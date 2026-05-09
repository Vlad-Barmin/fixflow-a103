import { NextRequest, NextResponse } from 'next/server'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database.types'

type RequestRow = Database['public']['Tables']['requests']['Row']
type StatusHistoryInsert =
  Database['public']['Tables']['request_status_history']['Insert']

/**
 * POST /api/cron/overdue
 *
 * Проверка просроченных заявок. Запускается каждый час по vercel.json cron.
 * Авторизация: заголовок x-cron-secret.
 *
 * Логика:
 *   1. Найти заявки с deadline < NOW() и status NOT IN ('completed').
 *   2. Для каждой — записать в request_status_history с reason='overdue' (если ещё не записано).
 *   3. Найти заявки с deadline в следующие 24 часа (approaching).
 *   4. Вернуть сводку: checked, newly_overdue, approaching, notifications_sent.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: { code: 'AUTH_ERROR', message: 'Unauthorized' } },
      { status: 401 }
    )
  }

  const supabase = createServiceRoleClient()
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // -------------------------------------------------------------------------
  // 1. Найти все незавершённые заявки с дедлайном в прошлом
  // -------------------------------------------------------------------------
  const { data: overdueRequests, error: overdueErr } = (await supabase
    .from('requests')
    .select('id, status, deadline, contractor_id')
    .lt('deadline', now.toISOString())
    .not('status', 'in', '("completed","requires_manual_review")')) as {
    data: Pick<
      RequestRow,
      'id' | 'status' | 'deadline' | 'contractor_id'
    >[] | null
    error: PostgrestError | null
  }

  if (overdueErr) {
    console.error('[POST /api/cron/overdue] overdue query error:', overdueErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  // -------------------------------------------------------------------------
  // 2. Найти заявки с дедлайном в следующие 24 часа
  // -------------------------------------------------------------------------
  const { data: approachingRequests, error: approachingErr } = (await supabase
    .from('requests')
    .select('id, status, deadline')
    .gte('deadline', now.toISOString())
    .lte('deadline', in24h.toISOString())
    .not('status', 'in', '("completed","requires_manual_review")')) as {
    data: Pick<RequestRow, 'id' | 'status' | 'deadline'>[] | null
    error: PostgrestError | null
  }

  if (approachingErr) {
    console.error('[POST /api/cron/overdue] approaching query error:', approachingErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  // -------------------------------------------------------------------------
  // 3. Для каждой просроченной заявки — записать в историю статуса
  //    только если ещё нет записи с reason='overdue'
  // -------------------------------------------------------------------------
  const overdue = overdueRequests ?? []
  let newlyOverdue = 0

  for (const request of overdue) {
    // Проверить, уже ли записывали overdue для этой заявки
    const { count, error: checkErr } = await supabase
      .from('request_status_history')
      .select('id', { count: 'exact', head: true })
      .eq('request_id', request.id)
      .eq('reason', 'overdue')

    if (checkErr) {
      console.error(
        `[POST /api/cron/overdue] history check error for request ${request.id}:`,
        checkErr
      )
      continue
    }

    // Если записи ещё нет — добавить
    if (!count || count === 0) {
      const historyRecord: StatusHistoryInsert = {
        request_id: request.id,
        old_status: request.status,
        new_status: request.status, // статус не меняется — только отметка
        changed_by: 'system',
        reason: 'overdue',
      }

      const { error: insertErr } = await supabase
        .from('request_status_history')
        .insert(historyRecord as unknown as never)

      if (insertErr) {
        console.error(
          `[POST /api/cron/overdue] history insert error for request ${request.id}:`,
          insertErr
        )
        continue
      }

      newlyOverdue++
    }
  }

  const result = {
    checked: overdue.length,
    newly_overdue: newlyOverdue,
    approaching: (approachingRequests ?? []).length,
    notifications_sent: 0, // TODO: реализовать Telegram-уведомления менеджеру
  }

  console.info('[POST /api/cron/overdue] completed:', result)

  return NextResponse.json(result)
}
