import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth, isAuthError } from '@/lib/auth'
import type { Database } from '@/types/database.types'

type RequestRow = Database['public']['Tables']['requests']['Row']
type RequestUpdate = Database['public']['Tables']['requests']['Update']
type StatusHistoryInsert =
  Database['public']['Tables']['request_status_history']['Insert']

const ReassignSchema = z.object({
  contractor_id: z.string().uuid(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/requests/[id]/reassign
 *
 * Переназначить подрядчика для заявки вручную.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
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

  const parsed = ReassignSchema.safeParse(body)
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
    .select('id, status, contractor_id')
    .eq('id', idParsed.data)
    .maybeSingle()) as {
    data: Pick<RequestRow, 'id' | 'status' | 'contractor_id'> | null
    error: PostgrestError | null
  }

  if (fetchErr) {
    console.error('[POST /reassign] fetch error:', fetchErr)
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

  // Проверить что новый подрядчик существует и активен
  const { data: contractor, error: contractorErr } = (await supabase
    .from('contractors')
    .select('id, name, is_active')
    .eq('id', parsed.data.contractor_id)
    .maybeSingle()) as {
    data: { id: string; name: string; is_active: boolean } | null
    error: PostgrestError | null
  }

  if (contractorErr) {
    console.error('[POST /reassign] contractor lookup error:', contractorErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!contractor) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Contractor not found' } },
      { status: 404 }
    )
  }

  if (!contractor.is_active) {
    return NextResponse.json(
      {
        error: {
          code: 'CONFLICT',
          message: 'Cannot assign to inactive contractor',
        },
      },
      { status: 409 }
    )
  }

  const patch: RequestUpdate = {
    contractor_id: parsed.data.contractor_id,
    status: 'routed',
  }

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
    console.error('[POST /reassign] update error:', updateErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  const historyRecord: StatusHistoryInsert = {
    request_id: idParsed.data,
    old_status: current.status,
    new_status: 'routed',
    changed_by: 'manager',
    reason: `Manually reassigned to contractor: ${contractor.name}`,
  }
  const { error: histErr } = await supabase
    .from('request_status_history')
    .insert(historyRecord as unknown as never)
  if (histErr) {
    console.error('[POST /reassign] history insert error:', histErr)
  }

  // TODO: отправить уведомление в Telegram-канал нового подрядчика

  return NextResponse.json(updated)
}

export const dynamic = 'force-dynamic'
