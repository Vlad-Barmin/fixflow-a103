/**
 * Обработчик callback-кнопок от подрядчиков в Telegram.
 *
 * Поддерживаемые действия (callback_data):
 *   accept:UUID   — принять заявку → status='accepted'
 *   decline:UUID  — отклонить заявку → ищем другого подрядчика или manual review
 *   complete:UUID — начать завершение → просим прислать фото
 *
 * После команды complete бот ждёт фото.
 * Состояние ожидания фото хранится в telegram_bot_states (chat_id подрядчика).
 *
 * Все операции с БД — через createServiceRoleClient().
 */

import type { PostgrestError } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import {
  answerCallbackQuery,
  editContractorMessage,
  getContractorFile,
  downloadTelegramFile,
  buildRequestCaption,
  buildContractorKeyboard,
  sendRequestToContractor,
  type TelegramUpdate,
} from './api'
import type { Json, Database } from '@/types/database.types'

// ---------------------------------------------------------------------------
// DB-типы для явных кастов
// ---------------------------------------------------------------------------

type RequestRow = Database['public']['Tables']['requests']['Row']
type RequestUpdate = Database['public']['Tables']['requests']['Update']
type StatusHistoryInsert = Database['public']['Tables']['request_status_history']['Insert']
type RequestPhotoRow = Database['public']['Tables']['request_photos']['Row']
type RequestCompletionPhotoInsert = Database['public']['Tables']['request_completion_photos']['Insert']
type ResidentialComplexRow = Database['public']['Tables']['residential_complexes']['Row']
type ApartmentRow = Database['public']['Tables']['apartments']['Row']
type ContractorRow = Database['public']['Tables']['contractors']['Row']

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

interface ContractorBotStateData {
  awaiting_completion_for?: string // request_id
}

// ---------------------------------------------------------------------------
// Главный обработчик
// ---------------------------------------------------------------------------

/**
 * Обрабатывает входящий update от contractor bot.
 * Вызывается асинхронно — не выбрасывает ошибки наружу.
 */
export async function handleContractorUpdate(update: TelegramUpdate): Promise<void> {
  console.log('[contractor-handler] start, update keys=', Object.keys(update).join(','))

  const callbackQuery = update.callback_query
  const message = update.message

  const updateType = callbackQuery ? 'callback_query' : message ? 'message' : 'unknown'
  const chatId = callbackQuery?.message?.chat.id ?? callbackQuery?.from.id ?? message?.chat.id
  console.log('[contractor-handler] type=', updateType, 'chatId=', chatId)

  if (message?.text) {
    console.log('[contractor-handler] text=', message.text.slice(0, 80))
  }

  const supabase = createServiceRoleClient()

  // ── Обработка inline кнопок ──
  if (callbackQuery) {
    console.log('[contractor-handler] handling callback, data=', callbackQuery.data)
    const cbChatId = callbackQuery.message?.chat.id ?? callbackQuery.from.id
    await handleContractorCallback(supabase, cbChatId, callbackQuery.id, callbackQuery.data ?? '')
    return
  }

  // ── Обработка входящих фото (завершение заявки) ──
  if (message?.photo && message.photo.length > 0) {
    console.log('[contractor-handler] handling photo, count=', message.photo.length)
    await handleCompletionPhoto(supabase, message.chat.id, message)
    return
  }

  // Текстовые сообщения и /start не обрабатываются contractor-ботом —
  // он работает только через inline-кнопки и фото в канале.
  console.log('[contractor-handler] EARLY RETURN: no callback_query and no photo (text/start ignored by design)')
}

// ---------------------------------------------------------------------------
// Обработка callback кнопок
// ---------------------------------------------------------------------------

async function handleContractorCallback(
  supabase: ReturnType<typeof createServiceRoleClient>,
  chatId: number,
  callbackQueryId: string,
  data: string
): Promise<void> {
  const colonIdx = data.indexOf(':')
  if (colonIdx === -1) {
    await answerCallbackQuery(callbackQueryId, 'Неизвестная команда')
    return
  }

  const action = data.slice(0, colonIdx)
  const requestId = data.slice(colonIdx + 1)

  switch (action) {
    case 'accept':
      await handleAccept(supabase, chatId, callbackQueryId, requestId)
      break
    case 'decline':
      await handleDecline(supabase, chatId, callbackQueryId, requestId)
      break
    case 'complete':
      await handleCompleteStart(supabase, chatId, callbackQueryId, requestId)
      break
    default:
      await answerCallbackQuery(callbackQueryId, 'Неизвестное действие')
  }
}

// ---------------------------------------------------------------------------
// accept
// ---------------------------------------------------------------------------

async function handleAccept(
  supabase: ReturnType<typeof createServiceRoleClient>,
  chatId: number,
  callbackQueryId: string,
  requestId: string
): Promise<void> {
  type RequestForAccept = Pick<RequestRow, 'id' | 'status' | 'telegram_message_id' | 'contractor_id'> & {
    contractors: Pick<ContractorRow, 'telegram_channel_id'> | Pick<ContractorRow, 'telegram_channel_id'>[] | null
  }
  const { data: request, error } = await supabase
    .from('requests')
    .select('id, status, telegram_message_id, contractor_id, contractors(telegram_channel_id)')
    .eq('id', requestId)
    .maybeSingle() as {
      data: RequestForAccept | null
      error: PostgrestError | null
    }

  if (error || !request) {
    await answerCallbackQuery(callbackQueryId, 'Заявка не найдена')
    return
  }

  if (request.status === 'accepted') {
    await answerCallbackQuery(callbackQueryId, 'Заявка уже принята')
    return
  }

  if (!['routed', 'new'].includes(request.status)) {
    await answerCallbackQuery(
      callbackQueryId,
      `Нельзя принять заявку в статусе: ${request.status}`
    )
    return
  }

  const oldStatus = request.status

  // Обновить статус
  await supabase
    .from('requests')
    .update(({ status: 'accepted' } satisfies RequestUpdate) as unknown as never)
    .eq('id', requestId)

  await insertStatusHistory(supabase, requestId, oldStatus, 'accepted', `tg:${chatId}`)

  await answerCallbackQuery(callbackQueryId, '✅ Заявка принята!')

  // Обновить сообщение в канале подрядчика
  const contractor = Array.isArray(request.contractors)
    ? request.contractors[0]
    : request.contractors

  const channelId = contractor?.telegram_channel_id ?? chatId

  if (request.telegram_message_id) {
    await editContractorMessage(
      channelId,
      request.telegram_message_id,
      `✅ <b>ПРИНЯТА</b>\n🆔 #${requestId.slice(0, 8)}\n\nЗаявка принята в работу.`
    ).catch((err) => console.error('editContractorMessage error:', err))
  }
}

// ---------------------------------------------------------------------------
// decline
// ---------------------------------------------------------------------------

async function handleDecline(
  supabase: ReturnType<typeof createServiceRoleClient>,
  chatId: number,
  callbackQueryId: string,
  requestId: string
): Promise<void> {
  type RequestForDecline = Pick<RequestRow, 'id' | 'status' | 'telegram_message_id' | 'contractor_id' | 'apartment_id' | 'category'> & {
    contractors: Pick<ContractorRow, 'id' | 'telegram_channel_id'> | Pick<ContractorRow, 'id' | 'telegram_channel_id'>[] | null
  }
  const { data: request, error } = await supabase
    .from('requests')
    .select(
      'id, status, telegram_message_id, contractor_id, apartment_id, category, ' +
        'contractors(id, telegram_channel_id)'
    )
    .eq('id', requestId)
    .maybeSingle() as {
      data: RequestForDecline | null
      error: PostgrestError | null
    }

  if (error || !request) {
    await answerCallbackQuery(callbackQueryId, 'Заявка не найдена')
    return
  }

  if (!['routed', 'accepted'].includes(request.status)) {
    await answerCallbackQuery(
      callbackQueryId,
      `Нельзя отклонить заявку в статусе: ${request.status}`
    )
    return
  }

  const oldStatus = request.status
  const currentContractorId = request.contractor_id

  // Искать другого подрядчика для той же категории и квартиры
  const alternativeContractor = currentContractorId && request.category
    ? await findAlternativeContractor(
        supabase,
        request.apartment_id,
        request.category,
        currentContractorId
      )
    : null

  if (alternativeContractor && alternativeContractor.telegram_channel_id) {
    // Перенаправить на другого подрядчика
    // Получить детали заявки для caption
    type FullRequestRow = Pick<RequestRow, 'description' | 'priority' | 'deadline'> & {
      apartments: (Pick<ApartmentRow, 'number' | 'building'> & {
        residential_complexes: Pick<ResidentialComplexRow, 'name'> | Pick<ResidentialComplexRow, 'name'>[] | null
      }) | (Pick<ApartmentRow, 'number' | 'building'> & {
        residential_complexes: Pick<ResidentialComplexRow, 'name'> | Pick<ResidentialComplexRow, 'name'>[] | null
      })[] | null
    }
    const { data: fullRequest } = await supabase
      .from('requests')
      .select(
        'description, priority, deadline, ' +
          'apartments(number, building, residential_complexes(name))'
      )
      .eq('id', requestId)
      .maybeSingle() as {
        data: FullRequestRow | null
        error: PostgrestError | null
      }

    if (fullRequest) {
      const apt = Array.isArray(fullRequest.apartments)
        ? fullRequest.apartments[0]
        : fullRequest.apartments
      const complex = apt
        ? Array.isArray(apt.residential_complexes)
          ? apt.residential_complexes[0]
          : apt.residential_complexes
        : null

      const caption = buildRequestCaption({
        apartmentNumber: apt?.number ?? '',
        building: apt?.building ?? '',
        complexName: complex?.name ?? '',
        category: request.category,
        priority: fullRequest.priority,
        description: fullRequest.description,
        deadline: fullRequest.deadline,
        requestId,
      })

      const keyboard = buildContractorKeyboard(requestId)

      const { data: photos } = await supabase
        .from('request_photos')
        .select('storage_path')
        .eq('request_id', requestId) as {
          data: Pick<RequestPhotoRow, 'storage_path'>[] | null
          error: PostgrestError | null
        }

      const photoUrls = await resolvePhotoUrls(
        supabase,
        (photos ?? []).map((p) => p.storage_path)
      )

      const newMessageId = await sendRequestToContractor(
        alternativeContractor.telegram_channel_id,
        caption,
        photoUrls,
        keyboard
      ).catch((err) => {
        console.error('sendRequestToContractor error:', err)
        return null
      })

      const rerouteUpdate = {
        status: 'routed' as const,
        contractor_id: alternativeContractor.id,
        telegram_message_id: newMessageId,
        requires_manual_review: false,
      } satisfies RequestUpdate
      await supabase
        .from('requests')
        .update(rerouteUpdate as unknown as never)
        .eq('id', requestId)

      await insertStatusHistory(
        supabase,
        requestId,
        oldStatus,
        'routed',
        `tg:${chatId}`
      )
    }
  } else {
    // Нет альтернативного подрядчика — на ручную проверку
    const noAltUpdate = {
      status: 'requires_manual_review' as const,
      requires_manual_review: true,
      contractor_id: null,
    } satisfies RequestUpdate
    await supabase
      .from('requests')
      .update(noAltUpdate as unknown as never)
      .eq('id', requestId)

    await insertStatusHistory(
      supabase,
      requestId,
      oldStatus,
      'requires_manual_review',
      `tg:${chatId}`
    )
  }

  await answerCallbackQuery(callbackQueryId, '❌ Заявка отклонена')

  // Обновить сообщение в канале
  const contractor = Array.isArray(request.contractors)
    ? request.contractors[0]
    : request.contractors
  const channelId = contractor?.telegram_channel_id ?? chatId

  if (request.telegram_message_id) {
    await editContractorMessage(
      channelId,
      request.telegram_message_id,
      `❌ <b>ОТКЛОНЕНА</b>\n🆔 #${requestId.slice(0, 8)}\n\nЗаявка была отклонена и перенаправлена.`
    ).catch((err) => console.error('editContractorMessage error:', err))
  }
}

// ---------------------------------------------------------------------------
// complete (начало — запрос фото)
// ---------------------------------------------------------------------------

async function handleCompleteStart(
  supabase: ReturnType<typeof createServiceRoleClient>,
  chatId: number,
  callbackQueryId: string,
  requestId: string
): Promise<void> {
  const { data: request, error } = await supabase
    .from('requests')
    .select('id, status')
    .eq('id', requestId)
    .maybeSingle() as {
      data: Pick<RequestRow, 'id' | 'status'> | null
      error: PostgrestError | null
    }

  if (error || !request) {
    await answerCallbackQuery(callbackQueryId, 'Заявка не найдена')
    return
  }

  if (request.status === 'completed') {
    await answerCallbackQuery(callbackQueryId, 'Заявка уже завершена')
    return
  }

  type TelegramBotStateInsert = Database['public']['Tables']['telegram_bot_states']['Insert']
  // Сохранить состояние ожидания фото
  const completionStateRecord = {
    chat_id: chatId,
    state: 'awaiting_completion_photo',
    data: { awaiting_completion_for: requestId } as Json,
  } satisfies TelegramBotStateInsert
  await supabase
    .from('telegram_bot_states')
    .upsert(completionStateRecord as unknown as never, { onConflict: 'chat_id' })

  await answerCallbackQuery(callbackQueryId, '📷 Пришлите фото выполненных работ')

  // Отправить текстовую подсказку (contractor bot)
  const contractorToken = process.env.TELEGRAM_CONTRACTOR_BOT_TOKEN
  if (contractorToken) {
    fetch(`https://api.telegram.org/bot${contractorToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text:
          `📷 Пришлите фото выполненных работ для заявки #${requestId.slice(0, 8)}.\n\n` +
          'Можно прислать несколько фотографий.',
      }),
    }).catch(console.error)
  }
}

// ---------------------------------------------------------------------------
// Обработка фото завершения
// ---------------------------------------------------------------------------

async function handleCompletionPhoto(
  supabase: ReturnType<typeof createServiceRoleClient>,
  chatId: number,
  message: NonNullable<TelegramUpdate['message']>
): Promise<void> {
  // Проверить, ожидает ли этот чат фото для завершения
  const { data: stateRow } = await supabase
    .from('telegram_bot_states')
    .select('state, data')
    .eq('chat_id', chatId)
    .maybeSingle() as {
      data: { state: string; data: Json } | null
      error: PostgrestError | null
    }

  if (!stateRow || stateRow.state !== 'awaiting_completion_photo') return

  const stateData = stateRow.data as ContractorBotStateData
  const requestId = stateData.awaiting_completion_for

  if (!requestId) return

  // Проверить что заявка существует и не завершена
  type RequestForCompletion = Pick<RequestRow, 'id' | 'status' | 'telegram_message_id' | 'contractor_id'> & {
    contractors: Pick<ContractorRow, 'telegram_channel_id'> | Pick<ContractorRow, 'telegram_channel_id'>[] | null
  }
  const { data: request } = await supabase
    .from('requests')
    .select('id, status, telegram_message_id, contractor_id, contractors(telegram_channel_id)')
    .eq('id', requestId)
    .maybeSingle() as {
      data: RequestForCompletion | null
      error: PostgrestError | null
    }

  if (!request || request.status === 'completed') {
    // Сбросить состояние
    type TelegramBotStateUpdate = Database['public']['Tables']['telegram_bot_states']['Update']
    const idleUpdate = { state: 'idle', data: {} as Json } satisfies TelegramBotStateUpdate
    await supabase
      .from('telegram_bot_states')
      .update(idleUpdate as unknown as never)
      .eq('chat_id', chatId)
    return
  }

  const oldStatus = request.status

  // Получить файл с наибольшим разрешением
  const photos = message.photo ?? []
  if (photos.length === 0) return

  const bestPhoto = photos.reduce((best, p) =>
    p.file_size && best.file_size && p.file_size > best.file_size ? p : best
  )

  try {
    // Скачать файл
    const fileInfo = await getContractorFile(bestPhoto.file_id)
    if (!fileInfo.file_path) throw new Error('file_path is missing from Telegram getFile response')

    const fileBuffer = await downloadTelegramFile(fileInfo.file_path)

    // Сформировать путь в Storage
    const ext = fileInfo.file_path.split('.').pop() ?? 'jpg'
    const storagePath = `${requestId}/${Date.now()}_completion.${ext}`

    // Загрузить в Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('completion-photos')
      .upload(storagePath, fileBuffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      throw uploadError
    }

    // Записать в request_completion_photos
    const completionPhotoRecord = {
      request_id: requestId,
      storage_path: storagePath,
      uploaded_by_chat_id: chatId,
    } satisfies RequestCompletionPhotoInsert
    await supabase
      .from('request_completion_photos')
      .insert(completionPhotoRecord as unknown as never)
  } catch (err) {
    console.error('Error processing completion photo:', err)
    // Не блокируем завершение заявки из-за ошибки фото
  }

  // Завершить заявку
  await supabase
    .from('requests')
    .update(({ status: 'completed' } satisfies RequestUpdate) as unknown as never)
    .eq('id', requestId)

  await insertStatusHistory(supabase, requestId, oldStatus, 'completed', `tg:${chatId}`)

  // Сбросить состояние бота
  type TelegramBotStateUpdate2 = Database['public']['Tables']['telegram_bot_states']['Update']
  const finalIdleUpdate = { state: 'idle', data: {} as Json } satisfies TelegramBotStateUpdate2
  await supabase
    .from('telegram_bot_states')
    .update(finalIdleUpdate as unknown as never)
    .eq('chat_id', chatId)

  // Обновить сообщение в канале подрядчика
  const contractor = Array.isArray(request.contractors)
    ? request.contractors[0]
    : request.contractors
  const channelId = contractor?.telegram_channel_id ?? chatId

  if (request.telegram_message_id) {
    await editContractorMessage(
      channelId,
      request.telegram_message_id,
      `✅ <b>ЗАВЕРШЕНА</b>\n🆔 #${requestId.slice(0, 8)}\n\nРаботы выполнены.`
    ).catch((err) => console.error('editContractorMessage error:', err))
  }

  // Подтверждение подрядчику
  const contractorToken = process.env.TELEGRAM_CONTRACTOR_BOT_TOKEN
  if (contractorToken) {
    fetch(`https://api.telegram.org/bot${contractorToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `✅ Заявка #${requestId.slice(0, 8)} завершена. Спасибо!`,
      }),
    }).catch(console.error)
  }
}

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

async function findAlternativeContractor(
  supabase: ReturnType<typeof createServiceRoleClient>,
  apartmentId: string,
  category: string,
  excludeContractorId: string
): Promise<{ id: string; telegram_channel_id: number | null } | null> {
  type AcWithContractor = {
    contractor_id: string
    contractors: Pick<ContractorRow, 'id' | 'telegram_channel_id' | 'is_active'> | Pick<ContractorRow, 'id' | 'telegram_channel_id' | 'is_active'>[] | null
  }
  const { data, error } = await supabase
    .from('apartment_contractors')
    .select('contractor_id, contractors(id, telegram_channel_id, is_active)')
    .eq('apartment_id', apartmentId)
    .eq('category', category)
    .neq('contractor_id', excludeContractorId)
    .maybeSingle() as {
      data: AcWithContractor | null
      error: PostgrestError | null
    }

  if (error || !data) return null

  const contractor = Array.isArray(data.contractors)
    ? data.contractors[0]
    : data.contractors

  if (!contractor || !contractor.is_active) return null

  return { id: contractor.id, telegram_channel_id: contractor.telegram_channel_id }
}

async function resolvePhotoUrls(
  supabase: ReturnType<typeof createServiceRoleClient>,
  storagePaths: string[]
): Promise<string[]> {
  const urls: string[] = []
  for (const path of storagePaths) {
    const { data } = await supabase.storage
      .from('request-photos')
      .createSignedUrl(path, 3600)
    if (data?.signedUrl) urls.push(data.signedUrl)
  }
  return urls
}

async function insertStatusHistory(
  supabase: ReturnType<typeof createServiceRoleClient>,
  requestId: string,
  oldStatus: string,
  newStatus: string,
  changedBy: string
): Promise<void> {
  const record = {
    request_id: requestId,
    old_status: oldStatus,
    new_status: newStatus,
    changed_by: changedBy,
  } satisfies StatusHistoryInsert
  const { error } = await supabase
    .from('request_status_history')
    .insert(record as unknown as never)
  if (error) console.error('DB error inserting status history:', error)
}
