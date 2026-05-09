import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { requireAuth, isAuthError } from '@/lib/auth'
import { classifyRequest, calculateDeadline } from '@/lib/ai/classifier'
import { dispatchRequest } from '@/lib/ai/dispatcher'
import {
  REQUEST_STATUSES,
  REQUEST_PRIORITIES,
  REQUEST_CATEGORIES,
} from '@/lib/constants'
import type { Database } from '@/types/database.types'

type RequestRow = Database['public']['Tables']['requests']['Row']
type RequestInsert = Database['public']['Tables']['requests']['Insert']
type StatusHistoryInsert =
  Database['public']['Tables']['request_status_history']['Insert']

// ---------------------------------------------------------------------------
// Схемы валидации
// ---------------------------------------------------------------------------

const ListRequestsSchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  category: z.enum(REQUEST_CATEGORIES).optional(),
  contractor_id: z.string().uuid().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const CreateRequestSchema = z.object({
  apartment_id: z.string().uuid(),
  description: z.string().min(1).max(2000),
})

// ---------------------------------------------------------------------------
// GET /api/requests
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const params = Object.fromEntries(req.nextUrl.searchParams.entries())
  const parsed = ListRequestsSchema.safeParse(params)

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parsed.error.flatten(),
        },
      },
      { status: 422 }
    )
  }

  const { status, category, contractor_id, date_from, date_to, limit, offset } =
    parsed.data

  const supabase = await createServerClient()

  let query = supabase
    .from('requests')
    .select(
      `id, apartment_id, description, status, priority, category,
       ai_confidence, contractor_id, deadline, requires_manual_review,
       created_at, updated_at,
       apartments(id, building, number, complex_id, residential_complexes(id, name))`,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)
  if (category) query = query.eq('category', category)
  if (contractor_id) query = query.eq('contractor_id', contractor_id)
  if (date_from) query = query.gte('created_at', date_from)
  if (date_to) query = query.lte('created_at', date_to)

  const { data, error, count } = await query

  if (error) {
    console.error('[GET /api/requests] DB error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ data, total: count ?? 0, limit, offset })
}

// ---------------------------------------------------------------------------
// POST /api/requests
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 422 }
    )
  }

  const parsed = CreateRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      },
      { status: 422 }
    )
  }

  const supabase = await createServerClient()

  // Проверить что квартира существует
  const { data: apartment, error: aptErr } = (await supabase
    .from('apartments')
    .select('id')
    .eq('id', parsed.data.apartment_id)
    .maybeSingle()) as { data: { id: string } | null; error: PostgrestError | null }

  if (aptErr) {
    console.error('[POST /api/requests] apartment lookup error:', aptErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }
  if (!apartment) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Apartment not found' } },
      { status: 404 }
    )
  }

  const newRequest: RequestInsert = {
    apartment_id: parsed.data.apartment_id,
    description: parsed.data.description,
    status: 'new',
    priority: 'normal',
    requires_manual_review: false,
    deadline: calculateDeadline().toISOString(),
  }

  const { data: created, error: insertErr } = (await supabase
    .from('requests')
    .insert(newRequest as unknown as never)
    .select(
      'id, apartment_id, description, status, priority, category, ai_confidence, contractor_id, deadline, requires_manual_review, created_at, updated_at'
    )
    .single()) as {
    data: Pick<
      RequestRow,
      | 'id'
      | 'apartment_id'
      | 'description'
      | 'status'
      | 'priority'
      | 'category'
      | 'ai_confidence'
      | 'contractor_id'
      | 'deadline'
      | 'requires_manual_review'
      | 'created_at'
      | 'updated_at'
    > | null
    error: PostgrestError | null
  }

  if (insertErr || !created) {
    console.error('[POST /api/requests] insert error:', insertErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  // Записать начальный статус в историю
  const historyRecord: StatusHistoryInsert = {
    request_id: created.id,
    old_status: null,
    new_status: 'new',
    changed_by: 'manager',
    reason: 'Request created via API',
  }
  await supabase
    .from('request_status_history')
    .insert(historyRecord as unknown as never)

  // Запустить AI-классификацию асинхронно
  runClassificationFlow(created.id, parsed.data.apartment_id).catch(
    (err: unknown) =>
      console.error('[POST /api/requests] classification flow error:', err)
  )

  return NextResponse.json(created, { status: 201 })
}

// ---------------------------------------------------------------------------
// Вспомогательная функция: AI-классификация → диспетчеризация
// ---------------------------------------------------------------------------

async function runClassificationFlow(
  requestId: string,
  apartmentId: string
): Promise<void> {
  const supabase = createServiceRoleClient()

  // Установить status='ai_processing'
  await supabase
    .from('requests')
    .update({ status: 'ai_processing' } as unknown as never)
    .eq('id', requestId)

  // Получить данные для классификации
  const { data: requestData } = (await supabase
    .from('requests')
    .select('description, apartments(building, number, residential_complexes(name))')
    .eq('id', requestId)
    .maybeSingle()) as {
    data: {
      description: string
      apartments: {
        building: string
        number: string
        residential_complexes: { name: string } | null
      } | null
    } | null
    error: PostgrestError | null
  }

  if (!requestData || !requestData.apartments) {
    console.error('[runClassificationFlow] Failed to load request data')
    return
  }

  const { data: photos } = (await supabase
    .from('request_photos')
    .select('storage_path')
    .eq('request_id', requestId)) as {
    data: { storage_path: string }[] | null
    error: PostgrestError | null
  }

  const complexName =
    requestData.apartments.residential_complexes?.name ?? 'Неизвестный ЖК'

  const output = await classifyRequest({
    requestId,
    description: requestData.description,
    complexName,
    building: requestData.apartments.building,
    apartmentNumber: requestData.apartments.number,
    photoBase64: [],
  })

  if (!output.success) {
    // Dispatcher уже пометит как requires_manual_review через classifyRequest
    return
  }

  await dispatchRequest(requestId, output.result, apartmentId)
}

export const dynamic = 'force-dynamic'
