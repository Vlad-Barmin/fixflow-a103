import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth, isAuthError } from '@/lib/auth'
import type { Database } from '@/types/database.types'

type RequestRow = Database['public']['Tables']['requests']['Row']
type StatusHistoryInsert =
  Database['public']['Tables']['request_status_history']['Insert']

const CommentSchema = z.object({
  text: z.string().min(1).max(1000),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/requests/[id]/comment
 *
 * Добавить комментарий менеджера к заявке.
 * Хранится в request_status_history (old_status = new_status = текущий статус).
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

  const parsed = CommentSchema.safeParse(body)
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

  // Проверить что заявка существует и получить текущий статус
  const { data: current, error: fetchErr } = (await supabase
    .from('requests')
    .select('id, status')
    .eq('id', idParsed.data)
    .maybeSingle()) as {
    data: Pick<RequestRow, 'id' | 'status'> | null
    error: PostgrestError | null
  }

  if (fetchErr) {
    console.error('[POST /comment] fetch error:', fetchErr)
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

  // Записать комментарий: статус не меняется (old = new = текущий)
  const historyRecord: StatusHistoryInsert = {
    request_id: idParsed.data,
    old_status: current.status,
    new_status: current.status,
    changed_by: 'manager',
    reason: parsed.data.text,
  }

  const { data: inserted, error: insertErr } = (await supabase
    .from('request_status_history')
    .insert(historyRecord as unknown as never)
    .select('id, request_id, old_status, new_status, changed_by, reason, created_at')
    .single()) as {
    data: {
      id: string
      request_id: string
      old_status: string | null
      new_status: string
      changed_by: string | null
      reason: string | null
      created_at: string
    } | null
    error: PostgrestError | null
  }

  if (insertErr || !inserted) {
    console.error('[POST /comment] insert error:', insertErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return NextResponse.json(inserted, { status: 201 })
}

export const dynamic = 'force-dynamic'
