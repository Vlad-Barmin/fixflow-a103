import type { PostgrestError } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { CONFIDENCE_THRESHOLD } from '@/agents/config/classifier'
import { calculateDeadline } from './classifier'
import type { ClassificationResult } from '@/agents/types'
import type { Database } from '@/types/database.types'

type RequestStatusRow = Database['public']['Tables']['requests']['Row']
type RequestUpdate = Database['public']['Tables']['requests']['Update']
type StatusHistoryInsert = Database['public']['Tables']['request_status_history']['Insert']

/**
 * Результат диспетчеризации заявки.
 * Возвращает null, если подрядчик для (apartment_id, category) не найден ИЛИ
 * у подрядчика отсутствует telegram_channel_id, ИЛИ confidence ниже порога —
 * во всех таких случаях заявка переводится в requires_manual_review и НЕ
 * отправляется в Telegram-канал.
 */
export interface DispatchResult {
  contractorId: string
  channelId: number
}

/**
 * Привязывает результат AI-классификации к заявке и подрядчику.
 *
 * Шаги:
 *   1. Если confidence < CONFIDENCE_THRESHOLD → status = 'requires_manual_review'.
 *   2. Иначе ищем подрядчика в apartment_contractors по (apartment_id, category).
 *   3. Если подрядчик найден и активен и имеет telegram_channel_id —
 *      обновляем заявку (status='routed', contractor_id, deadline) и возвращаем
 *      { contractorId, channelId } для последующей отправки в Telegram.
 *   4. Если подрядчика нет / неактивен / без канала — status = 'requires_manual_review'.
 *   5. Каждый переход статуса фиксируется в request_status_history.
 *
 * Все операции идут через service role (вызывается из webhook'а владельца).
 */
export async function dispatchRequest(
  requestId: string,
  classification: ClassificationResult,
  apartmentId: string
): Promise<DispatchResult | null> {
  const supabase = createServiceRoleClient()

  // Получим текущий статус заявки для корректной записи в request_status_history
  const { data: currentRequest, error: fetchErr } = await supabase
    .from('requests')
    .select('status')
    .eq('id', requestId)
    .maybeSingle() as {
      data: Pick<RequestStatusRow, 'status'> | null
      error: PostgrestError | null
    }

  if (fetchErr) {
    console.error('[dispatcher] Failed to load request:', fetchErr)
    return null
  }
  if (!currentRequest) {
    console.error(`[dispatcher] Request ${requestId} not found`)
    return null
  }

  const oldStatus = currentRequest.status

  // -------------------------------------------------------------------------
  // 1. Низкая уверенность → ручная проверка, без поиска подрядчика
  // -------------------------------------------------------------------------
  if (classification.confidence < CONFIDENCE_THRESHOLD) {
    await markManualReview(supabase, requestId, classification, oldStatus, {
      reason: `AI confidence ${classification.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD}`,
    })
    return null
  }

  // -------------------------------------------------------------------------
  // 2. Поиск подрядчика по (apartment_id, category)
  // -------------------------------------------------------------------------
  const { data: assignment, error: assignErr } = await supabase
    .from('apartment_contractors')
    .select('contractor_id')
    .eq('apartment_id', apartmentId)
    .eq('category', classification.category)
    .maybeSingle() as {
      data: { contractor_id: string } | null
      error: PostgrestError | null
    }

  if (assignErr) {
    console.error('[dispatcher] apartment_contractors lookup error:', assignErr)
    await markManualReview(supabase, requestId, classification, oldStatus, {
      reason: 'Failed to look up contractor assignment',
    })
    return null
  }

  if (!assignment) {
    await markManualReview(supabase, requestId, classification, oldStatus, {
      reason: `No contractor configured for category ${classification.category}`,
    })
    return null
  }

  const { data: contractor, error: contractorErr } = await supabase
    .from('contractors')
    .select('id, telegram_channel_id, is_active')
    .eq('id', assignment.contractor_id)
    .maybeSingle() as {
      data: { id: string; telegram_channel_id: number | null; is_active: boolean } | null
      error: PostgrestError | null
    }

  if (contractorErr) {
    console.error('[dispatcher] contractor lookup error:', contractorErr)
    await markManualReview(supabase, requestId, classification, oldStatus, {
      reason: 'Failed to load contractor',
    })
    return null
  }

  if (!contractor || !contractor.is_active || !contractor.telegram_channel_id) {
    await markManualReview(supabase, requestId, classification, oldStatus, {
      reason: !contractor
        ? 'Assigned contractor missing'
        : !contractor.is_active
          ? 'Assigned contractor is inactive'
          : 'Assigned contractor has no telegram_channel_id',
    })
    return null
  }

  // -------------------------------------------------------------------------
  // 3. Диспетчеризация: обновить заявку и записать историю статуса
  // -------------------------------------------------------------------------
  const deadline = calculateDeadline()

  const routedUpdate = {
    category: classification.category,
    priority: classification.priority,
    ai_confidence: classification.confidence,
    ai_raw_response: classification as unknown as RequestUpdate['ai_raw_response'],
    status: 'routed' as const,
    contractor_id: contractor.id,
    deadline: deadline.toISOString(),
    requires_manual_review: false,
  } satisfies RequestUpdate
  const { error: updateErr } = await supabase
    .from('requests')
    .update(routedUpdate as unknown as never)
    .eq('id', requestId)

  if (updateErr) {
    console.error('[dispatcher] Failed to update request to routed:', updateErr)
    await markManualReview(supabase, requestId, classification, oldStatus, {
      reason: 'Failed to update request',
    })
    return null
  }

  await insertStatusHistory(supabase, {
    request_id: requestId,
    old_status: oldStatus,
    new_status: 'routed',
    reason: `AI routed to contractor (category=${classification.category}, priority=${classification.priority}, confidence=${classification.confidence.toFixed(2)})`,
  })

  return {
    contractorId: contractor.id,
    channelId: contractor.telegram_channel_id,
  }
}

/**
 * Помечает заявку как требующую ручной проверки, когда AI-классификация
 * целиком не удалась (дневной лимит, исчерпаны retry, неожиданное исключение) —
 * в отличие от markManualReview здесь нет ClassificationResult для сохранения.
 *
 * Вызывается из background-обработчиков (`after()` в API-роутах) как fallback,
 * чтобы заявка никогда не оставалась вечно висеть в ai_processing без следа.
 */
export async function markClassificationFailed(
  requestId: string,
  reason: string
): Promise<void> {
  const supabase = createServiceRoleClient()

  const { data: currentRequest } = (await supabase
    .from('requests')
    .select('status')
    .eq('id', requestId)
    .maybeSingle()) as {
    data: Pick<RequestStatusRow, 'status'> | null
    error: PostgrestError | null
  }

  const update = {
    status: 'requires_manual_review' as const,
    requires_manual_review: true,
  } satisfies RequestUpdate
  const { error } = await supabase
    .from('requests')
    .update(update as unknown as never)
    .eq('id', requestId)

  if (error) {
    console.error(
      '[dispatcher] Failed to mark request manual review after classification failure:',
      error
    )
    return
  }

  await insertStatusHistory(supabase, {
    request_id: requestId,
    old_status: currentRequest?.status ?? null,
    new_status: 'requires_manual_review',
    reason,
  })
}

// ---------------------------------------------------------------------------
// Внутренние помощники
// ---------------------------------------------------------------------------

type SupabaseAdmin = ReturnType<typeof createServiceRoleClient>

async function markManualReview(
  supabase: SupabaseAdmin,
  requestId: string,
  classification: ClassificationResult,
  oldStatus: string,
  opts: { reason: string }
): Promise<void> {
  const manualUpdate = {
    // Сохраняем результат AI даже при ручной проверке — менеджер увидит подсказку
    category: classification.category,
    priority: classification.priority,
    ai_confidence: classification.confidence,
    ai_raw_response: classification as unknown as RequestUpdate['ai_raw_response'],
    status: 'requires_manual_review' as const,
    requires_manual_review: true,
  } satisfies RequestUpdate
  const { error } = await supabase
    .from('requests')
    .update(manualUpdate as unknown as never)
    .eq('id', requestId)

  if (error) {
    console.error('[dispatcher] Failed to mark request manual review:', error)
    return
  }

  await insertStatusHistory(supabase, {
    request_id: requestId,
    old_status: oldStatus,
    new_status: 'requires_manual_review',
    reason: opts.reason,
  })
}

interface StatusHistoryEntry {
  request_id: string
  old_status: string | null
  new_status: string
  reason: string
}

async function insertStatusHistory(
  supabase: SupabaseAdmin,
  entry: StatusHistoryEntry
): Promise<void> {
  const record: StatusHistoryInsert = {
    request_id: entry.request_id,
    old_status: entry.old_status,
    new_status: entry.new_status,
    reason: entry.reason,
    changed_by: null, // системное действие
  }
  const { error } = await supabase
    .from('request_status_history')
    .insert((record satisfies StatusHistoryInsert) as unknown as never)
  if (error) {
    console.error('[dispatcher] Failed to write request_status_history:', error)
  }
}
