import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth, isAuthError } from '@/lib/auth'
import {
  REQUEST_STATUSES,
  REQUEST_PRIORITIES,
} from '@/lib/constants'
import type { Database } from '@/types/database.types'

type RequestRow = Database['public']['Tables']['requests']['Row']
type RequestUpdate = Database['public']['Tables']['requests']['Update']
type StatusHistoryInsert =
  Database['public']['Tables']['request_status_history']['Insert']

// ---------------------------------------------------------------------------
// Схема PATCH
// ---------------------------------------------------------------------------

const UpdateRequestSchema = z
  .object({
    status: z.enum(REQUEST_STATUSES).optional(),
    priority: z.enum(REQUEST_PRIORITIES).optional(),
    contractor_id: z.string().uuid().nullable().optional(),
    deadline: z.string().datetime().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field required',
  })

// ---------------------------------------------------------------------------
// Параметры маршрута
// ---------------------------------------------------------------------------

interface RouteContext {
  params: Promise<{ id: string }>
}

// ---------------------------------------------------------------------------
// GET /api/requests/[id]
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const { id } = await params
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid request ID' } },
      { status: 422 }
    )
  }

  const supabase = await createServerClient()

  const { data, error } = (await supabase
    .from('requests')
    .select(
      `*, apartments(*, residential_complexes(*)), contractors(*),
       request_photos(*), request_completion_photos(*), request_status_history(*)`
    )
    .eq('id', idParsed.data)
    .maybeSingle()) as { data: unknown | null; error: PostgrestError | null }

  if (error) {
    console.error('[GET /api/requests/[id]] DB error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Request not found' } },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}

// ---------------------------------------------------------------------------
// PATCH /api/requests/[id]
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const { id } = await params
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid request ID' } },
      { status: 422 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 422 }
    )
  }

  const parsed = UpdateRequestSchema.safeParse(body)
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

  // Загрузить текущую заявку
  const { data: current, error: fetchErr } = (await supabase
    .from('requests')
    .select('id, status')
    .eq('id', idParsed.data)
    .maybeSingle()) as {
    data: Pick<RequestRow, 'id' | 'status'> | null
    error: PostgrestError | null
  }

  if (fetchErr) {
    console.error('[PATCH /api/requests/[id]] fetch error:', fetchErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!current) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Request not found' } },
      { status: 404 }
    )
  }

  const patch: RequestUpdate = {}
  if (parsed.data.status !== undefined) patch.status = parsed.data.status
  if (parsed.data.priority !== undefined) patch.priority = parsed.data.priority
  if (parsed.data.contractor_id !== undefined)
    patch.contractor_id = parsed.data.contractor_id
  if (parsed.data.deadline !== undefined) patch.deadline = parsed.data.deadline

  const { data: updated, error: updateErr } = (await supabase
    .from('requests')
    .update(patch as unknown as never)
    .eq('id', idParsed.data)
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

  if (updateErr || !updated) {
    console.error('[PATCH /api/requests/[id]] update error:', updateErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  // Записать историю статуса при его изменении
  if (parsed.data.status && parsed.data.status !== current.status) {
    const historyRecord: StatusHistoryInsert = {
      request_id: idParsed.data,
      old_status: current.status,
      new_status: parsed.data.status,
      changed_by: 'manager',
      reason: 'Status updated via API',
    }
    const { error: histErr } = await supabase
      .from('request_status_history')
      .insert(historyRecord as unknown as never)
    if (histErr) {
      console.error('[PATCH /api/requests/[id]] history insert error:', histErr)
    }
  }

  return NextResponse.json(updated)
}

// ---------------------------------------------------------------------------
// DELETE /api/requests/[id]
// ---------------------------------------------------------------------------

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const { id } = await params
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid request ID' } },
      { status: 422 }
    )
  }

  const supabase = await createServerClient()

  const { data: current, error: fetchErr } = (await supabase
    .from('requests')
    .select('id, status')
    .eq('id', idParsed.data)
    .maybeSingle()) as {
    data: Pick<RequestRow, 'id' | 'status'> | null
    error: PostgrestError | null
  }

  if (fetchErr) {
    console.error('[DELETE /api/requests/[id]] fetch error:', fetchErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!current) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Request not found' } },
      { status: 404 }
    )
  }

  const deletableStatuses: RequestRow['status'][] = [
    'new',
    'requires_manual_review',
  ]
  if (!deletableStatuses.includes(current.status)) {
    return NextResponse.json(
      {
        error: {
          code: 'CONFLICT',
          message:
            'Cannot delete request in current status. Only new or requires_manual_review requests can be deleted.',
        },
      },
      { status: 409 }
    )
  }

  const { error: deleteErr } = await supabase
    .from('requests')
    .delete()
    .eq('id', idParsed.data)

  if (deleteErr) {
    console.error('[DELETE /api/requests/[id]] delete error:', deleteErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return new NextResponse(null, { status: 204 })
}

export const dynamic = 'force-dynamic'
