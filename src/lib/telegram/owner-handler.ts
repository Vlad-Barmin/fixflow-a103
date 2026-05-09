/**
 * State machine для регистрации владельца квартиры через Telegram бот.
 *
 * Состояния (хранятся в telegram_bot_states):
 *   awaiting_consent → awaiting_name → awaiting_phone →
 *   awaiting_complex → awaiting_building → awaiting_apartment → registered
 *
 * После регистрации любое текстовое сообщение создаёт заявку (request)
 * и запускает AI-классификацию.
 *
 * Все операции с БД — через createServiceRoleClient() (обход RLS).
 * 152-ФЗ: данные владельца (ФИО, телефон, chat_id) не передаются в AI.
 */

import type { PostgrestError } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { calculateDeadline } from '@/lib/ai/classifier'
import type { Json, Database } from '@/types/database.types'
import {
  sendOwnerMessage,
  buildRequestCaption,
  buildContractorKeyboard,
  sendRequestToContractor,
  type TelegramUpdate,
  type InlineKeyboardMarkup,
} from './api'

// ---------------------------------------------------------------------------
// DB-типы для явных кастов (Supabase inference не всегда выводит тип)
// ---------------------------------------------------------------------------

type ApartmentRow = Database['public']['Tables']['apartments']['Row']
type ApartmentUpdate = Database['public']['Tables']['apartments']['Update']
type RequestRow = Database['public']['Tables']['requests']['Row']
type RequestInsert = Database['public']['Tables']['requests']['Insert']
type RequestUpdate = Database['public']['Tables']['requests']['Update']
type OwnerConsentInsert = Database['public']['Tables']['owner_consents']['Insert']
type TelegramBotStateInsert = Database['public']['Tables']['telegram_bot_states']['Insert']
type TelegramBotStateUpdate = Database['public']['Tables']['telegram_bot_states']['Update']
type StatusHistoryInsert = Database['public']['Tables']['request_status_history']['Insert']
type ResidentialComplexRow = Database['public']['Tables']['residential_complexes']['Row']
type RequestPhotoRow = Database['public']['Tables']['request_photos']['Row']

// ---------------------------------------------------------------------------
// Вспомогательные типы
// ---------------------------------------------------------------------------

/** Промежуточные данные, накапливаемые в telegram_bot_states.data */
interface RegistrationData {
  owner_name?: string
  owner_phone?: string
  complex_id?: string
  building?: string
}

type BotState =
  | 'awaiting_consent'
  | 'awaiting_name'
  | 'awaiting_phone'
  | 'awaiting_complex'
  | 'awaiting_building'
  | 'awaiting_apartment'
  | 'registered'

// ---------------------------------------------------------------------------
// Текст согласия (152-ФЗ)
// ---------------------------------------------------------------------------

const CONSENT_TEXT =
  'Я даю согласие на обработку моих персональных данных (ФИО, номер телефона, ' +
  'идентификатор Telegram) в соответствии с Федеральным законом № 152-ФЗ ' +
  '«О персональных данных» в целях обработки заявок на гарантийный ремонт. ' +
  'Данные передаются подрядчикам только в объёме, необходимом для выполнения работ. ' +
  'Согласие может быть отозвано путём обращения к администратору.'

// ---------------------------------------------------------------------------
// Главный обработчик
// ---------------------------------------------------------------------------

/**
 * Обрабатывает входящий update от owner bot.
 * Вызывается асинхронно — не выбрасывает ошибки наружу.
 */
export async function handleOwnerUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message
  const callbackQuery = update.callback_query

  const chatId =
    message?.chat.id ?? callbackQuery?.message?.chat.id ?? callbackQuery?.from.id

  if (!chatId) return

  const supabase = createServiceRoleClient()

  // Получить текущее состояние
  const { data: stateRow } = await supabase
    .from('telegram_bot_states')
    .select('state, data')
    .eq('chat_id', chatId)
    .maybeSingle() as {
      data: { state: string; data: Json } | null
      error: PostgrestError | null
    }

  const currentState = (stateRow?.state ?? null) as BotState | null
  const stateData = (stateRow?.data ?? {}) as RegistrationData

  // Команда /start всегда сбрасывает к началу регистрации
  if (message?.text === '/start' || currentState === null) {
    await upsertState(supabase, chatId, 'awaiting_consent', {})
    await sendConsentMessage(chatId)
    return
  }

  // Обработка callback_query (кнопки inline keyboard)
  if (callbackQuery) {
    await handleCallbackQuery(
      supabase,
      chatId,
      callbackQuery.id,
      callbackQuery.data ?? '',
      currentState,
      stateData
    )
    return
  }

  // Обработка текстовых сообщений
  if (message) {
    await handleTextMessage(supabase, chatId, message.text ?? '', currentState, stateData)
    return
  }
}

// ---------------------------------------------------------------------------
// Обработка inline кнопок
// ---------------------------------------------------------------------------

async function handleCallbackQuery(
  supabase: ReturnType<typeof createServiceRoleClient>,
  chatId: number,
  callbackQueryId: string,
  data: string,
  state: BotState | null,
  stateData: RegistrationData
): Promise<void> {
  // Ответить на callback_query через owner bot (убрать "часики")
  // Используем owner bot token напрямую через fetch — простой fire-and-forget
  const ownerToken = process.env.TELEGRAM_BOT_TOKEN
  if (ownerToken) {
    fetch(`https://api.telegram.org/bot${ownerToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    }).catch(console.error)
  }

  if (state === 'awaiting_consent') {
    if (data === 'consent_yes') {
      // Согласие получено — сохранить снапшот текста (152-ФЗ).
      // apartment_id станет известен только после полной регистрации,
      // поэтому consent сохраняем позже, при финальной привязке к квартире.
      // Здесь фиксируем факт согласия в stateData.
      await upsertState(supabase, chatId, 'awaiting_name', {
        ...stateData,
      })
      await sendOwnerMessage(
        chatId,
        'Спасибо! Введите ваше ФИО (например: Иванов Иван Иванович):'
      )
      return
    }

    if (data === 'consent_no') {
      await sendOwnerMessage(
        chatId,
        'К сожалению, без согласия на обработку персональных данных ' +
          'воспользоваться сервисом невозможно.\n\n' +
          'Если вы передумаете, нажмите /start.'
      )
      return
    }
  }

  if (state === 'awaiting_complex' && data.startsWith('complex:')) {
    const complexId = data.replace('complex:', '')
    await upsertState(supabase, chatId, 'awaiting_building', {
      ...stateData,
      complex_id: complexId,
    })
    await sendOwnerMessage(chatId, 'Введите номер корпуса (например: 1 или А):')
    return
  }

  await sendOwnerMessage(chatId, 'Пожалуйста, воспользуйтесь кнопками для ответа.')
}

// ---------------------------------------------------------------------------
// Обработка текстовых сообщений
// ---------------------------------------------------------------------------

async function handleTextMessage(
  supabase: ReturnType<typeof createServiceRoleClient>,
  chatId: number,
  text: string,
  state: BotState | null,
  stateData: RegistrationData
): Promise<void> {
  switch (state) {
    case 'awaiting_name': {
      const name = text.trim()
      if (name.length < 2) {
        await sendOwnerMessage(chatId, 'Введите полное ФИО (не менее 2 символов).')
        return
      }
      await upsertState(supabase, chatId, 'awaiting_phone', {
        ...stateData,
        owner_name: name,
      })
      await sendOwnerMessage(
        chatId,
        'Введите ваш номер телефона (например: +79991234567 или 89991234567):'
      )
      return
    }

    case 'awaiting_phone': {
      const phone = text.trim()
      if (!isValidPhone(phone)) {
        await sendOwnerMessage(
          chatId,
          'Неверный формат телефона. Введите номер в формате +79991234567 или 89991234567:'
        )
        return
      }
      await upsertState(supabase, chatId, 'awaiting_complex', {
        ...stateData,
        owner_phone: phone,
      })
      await sendComplexSelection(supabase, chatId)
      return
    }

    case 'awaiting_building': {
      const building = text.trim()
      if (!building) {
        await sendOwnerMessage(chatId, 'Введите номер корпуса:')
        return
      }
      await upsertState(supabase, chatId, 'awaiting_apartment', {
        ...stateData,
        building,
      })
      await sendOwnerMessage(chatId, 'Введите номер вашей квартиры:')
      return
    }

    case 'awaiting_apartment': {
      const apartmentNumber = text.trim()
      if (!apartmentNumber) {
        await sendOwnerMessage(chatId, 'Введите номер квартиры:')
        return
      }
      await handleApartmentRegistration(
        supabase,
        chatId,
        apartmentNumber,
        stateData
      )
      return
    }

    case 'registered': {
      // Владелец отправляет заявку — создаём request и запускаем AI
      await handleNewRequest(supabase, chatId, text)
      return
    }

    default:
      await sendConsentMessage(chatId)
      await upsertState(supabase, chatId, 'awaiting_consent', {})
  }
}

// ---------------------------------------------------------------------------
// Регистрация квартиры
// ---------------------------------------------------------------------------

async function handleApartmentRegistration(
  supabase: ReturnType<typeof createServiceRoleClient>,
  chatId: number,
  apartmentNumber: string,
  stateData: RegistrationData
): Promise<void> {
  const { complex_id, building, owner_name, owner_phone } = stateData

  if (!complex_id || !building || !owner_name || !owner_phone) {
    await sendOwnerMessage(
      chatId,
      'Произошла ошибка при регистрации. Начните заново — нажмите /start.'
    )
    await upsertState(supabase, chatId, 'awaiting_consent', {})
    return
  }

  // Найти квартиру в БД
  const { data: apartment, error: aptError } = await supabase
    .from('apartments')
    .select('id, number, building, complex_id')
    .eq('complex_id', complex_id)
    .eq('building', building)
    .eq('number', apartmentNumber)
    .maybeSingle() as {
      data: Pick<ApartmentRow, 'id' | 'number' | 'building' | 'complex_id'> | null
      error: PostgrestError | null
    }

  if (aptError) {
    console.error('DB error finding apartment:', aptError)
    await sendOwnerMessage(
      chatId,
      'Ошибка при поиске квартиры. Попробуйте позже или обратитесь к менеджеру.'
    )
    return
  }

  if (!apartment) {
    await sendOwnerMessage(
      chatId,
      `Квартира №${apartmentNumber} в корпусе ${building} не найдена в нашей базе.\n` +
        'Проверьте данные и попробуйте снова или обратитесь к менеджеру.\n\n' +
        'Введите номер квартиры ещё раз:'
    )
    return
  }

  // Обновить данные владельца в apartments
  const aptUpdate = {
    owner_name,
    owner_phone,
    owner_telegram_chat_id: chatId,
  } satisfies ApartmentUpdate
  const { error: updateError } = await supabase
    .from('apartments')
    .update(aptUpdate as unknown as never)
    .eq('id', apartment.id)

  if (updateError) {
    console.error('DB error updating apartment owner:', updateError)
    await sendOwnerMessage(
      chatId,
      'Ошибка при сохранении данных. Попробуйте позже.'
    )
    return
  }

  // Сохранить согласие на обработку ПД (152-ФЗ)
  const consentRecord = {
    apartment_id: apartment.id,
    consent_text: CONSENT_TEXT,
    consented_at: new Date().toISOString(),
  } satisfies OwnerConsentInsert
  const { error: consentError } = await supabase
    .from('owner_consents')
    .insert(consentRecord as unknown as never)

  if (consentError) {
    console.error('DB error saving consent:', consentError)
    // Не блокируем регистрацию — логируем и продолжаем
  }

  // Установить финальное состояние
  await upsertState(supabase, chatId, 'registered', {})

  await sendOwnerMessage(
    chatId,
    `Регистрация завершена!\n\n` +
      `Квартира: №${apartment.number}, корп. ${apartment.building}\n\n` +
      `Теперь вы можете отправлять заявки на гарантийный ремонт — ` +
      `просто напишите описание проблемы в этот чат.`
  )
}

// ---------------------------------------------------------------------------
// Создание заявки от зарегистрированного владельца
// ---------------------------------------------------------------------------

async function handleNewRequest(
  supabase: ReturnType<typeof createServiceRoleClient>,
  chatId: number,
  description: string
): Promise<void> {
  if (description.trim().length < 10) {
    await sendOwnerMessage(
      chatId,
      'Пожалуйста, опишите проблему подробнее (не менее 10 символов).'
    )
    return
  }

  // Найти квартиру по chat_id
  const { data: apartment, error: aptError } = await supabase
    .from('apartments')
    .select('id, number, building, complex_id, residential_complexes(id, name)')
    .eq('owner_telegram_chat_id', chatId)
    .maybeSingle() as {
      data: (Pick<ApartmentRow, 'id' | 'number' | 'building' | 'complex_id'> & {
        residential_complexes: Pick<ResidentialComplexRow, 'id' | 'name'> | Pick<ResidentialComplexRow, 'id' | 'name'>[] | null
      }) | null
      error: PostgrestError | null
    }

  if (aptError || !apartment) {
    console.error('DB error finding apartment by chat_id:', aptError)
    await sendOwnerMessage(
      chatId,
      'Не удалось найти вашу квартиру. Обратитесь к менеджеру.'
    )
    return
  }

  // Рассчитать дедлайн (5 рабочих дней, 18:00 МСК)
  const deadline = calculateDeadline(new Date())

  // Создать заявку
  const requestInsert = {
    apartment_id: apartment.id,
    description: description.trim(),
    status: 'new' as const,
    priority: 'normal' as const,
    deadline: deadline.toISOString(),
    requires_manual_review: false,
  } satisfies RequestInsert
  const { data: request, error: reqError } = await supabase
    .from('requests')
    .insert(requestInsert as unknown as never)
    .select('id, status')
    .single() as {
      data: Pick<RequestRow, 'id' | 'status'> | null
      error: PostgrestError | null
    }

  if (reqError || !request) {
    console.error('DB error creating request:', reqError)
    await sendOwnerMessage(
      chatId,
      'Ошибка при создании заявки. Попробуйте ещё раз.'
    )
    return
  }

  // Немедленно подтвердить владельцу
  await sendOwnerMessage(
    chatId,
    `Заявка принята! ID: #${request.id.slice(0, 8)}\n` +
      'Мы обрабатываем её и направим подрядчику. ' +
      'Вы получите уведомление об изменении статуса.'
  )

  // Запустить AI-классификацию асинхронно (не блокируем ответ владельцу)
  triggerAiClassification(supabase, request.id, apartment).catch((err) => {
    console.error('AI classification error for request', request.id, err)
  })
}

// ---------------------------------------------------------------------------
// Запуск AI-классификации
// ---------------------------------------------------------------------------

interface ApartmentWithComplex {
  id: string
  number: string
  building: string
  complex_id: string
  residential_complexes:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null
}

async function triggerAiClassification(
  supabase: ReturnType<typeof createServiceRoleClient>,
  requestId: string,
  apartment: ApartmentWithComplex
): Promise<void> {
  // Обновить статус перед вызовом AI
  await supabase
    .from('requests')
    .update(({ status: 'ai_processing' } satisfies RequestUpdate) as unknown as never)
    .eq('id', requestId)

  await insertStatusHistory(supabase, requestId, 'new', 'ai_processing', 'system')

  // Получить полное описание заявки
  const { data: requestRow } = await supabase
    .from('requests')
    .select('id, description, deadline')
    .eq('id', requestId)
    .maybeSingle() as {
      data: Pick<RequestRow, 'id' | 'description' | 'deadline'> | null
      error: PostgrestError | null
    }

  if (!requestRow) return

  // Извлечь имя комплекса
  const complexData = apartment.residential_complexes
  const complexName = Array.isArray(complexData)
    ? (complexData[0]?.name ?? '')
    : (complexData?.name ?? '')

  const { classifyRequest } = await import('@/lib/ai/classifier')

  const output = await classifyRequest({
    requestId,
    description: requestRow.description,
    complexName,
    building: apartment.building,
    apartmentNumber: apartment.number,
  })

  if (!output.success) {
    // AI вернул ошибку → требуется ручная проверка
    await supabase
      .from('requests')
      .update(({
        status: 'requires_manual_review',
        requires_manual_review: true,
      } satisfies RequestUpdate) as unknown as never)
      .eq('id', requestId)

    await insertStatusHistory(
      supabase,
      requestId,
      'ai_processing',
      'requires_manual_review',
      'system'
    )
    return
  }

  const { category, priority, confidence } = output.result

  if (confidence < 0.5) {
    const lowConfUpdate = {
      category,
      priority,
      ai_confidence: confidence,
      ai_raw_response: output.result as unknown as RequestUpdate['ai_raw_response'],
      status: 'requires_manual_review' as const,
      requires_manual_review: true,
    } satisfies RequestUpdate
    await supabase
      .from('requests')
      .update(lowConfUpdate as unknown as never)
      .eq('id', requestId)

    await insertStatusHistory(
      supabase,
      requestId,
      'ai_processing',
      'requires_manual_review',
      'system'
    )
    return
  }

  // Найти подрядчика для данной квартиры и категории
  type AcRowWithContractor = {
    contractor_id: string
    contractors: { id: string; name: string; telegram_channel_id: number | null } | { id: string; name: string; telegram_channel_id: number | null }[] | null
  }
  const { data: acRow } = await supabase
    .from('apartment_contractors')
    .select('contractor_id, contractors(id, name, telegram_channel_id)')
    .eq('apartment_id', apartment.id)
    .eq('category', category)
    .maybeSingle() as {
      data: AcRowWithContractor | null
      error: PostgrestError | null
    }

  const contractor = Array.isArray(acRow?.contractors)
    ? acRow?.contractors[0]
    : acRow?.contractors

  if (!acRow || !contractor || !contractor.telegram_channel_id) {
    // Подрядчик не назначен — на ручную проверку
    const noContractorUpdate = {
      category,
      priority,
      ai_confidence: confidence,
      ai_raw_response: output.result as unknown as RequestUpdate['ai_raw_response'],
      status: 'requires_manual_review' as const,
      requires_manual_review: true,
    } satisfies RequestUpdate
    await supabase
      .from('requests')
      .update(noContractorUpdate as unknown as never)
      .eq('id', requestId)

    await insertStatusHistory(
      supabase,
      requestId,
      'ai_processing',
      'requires_manual_review',
      'system'
    )
    return
  }

  // Получить фото заявки для отправки подрядчику
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

  // Сформировать caption и keyboard (используем complexName, вычисленный выше)
  const caption = buildRequestCaption({
    apartmentNumber: apartment.number,
    building: apartment.building,
    complexName,
    category,
    priority,
    description: requestRow.description,
    deadline: requestRow.deadline,
    requestId,
  })

  const keyboard = buildContractorKeyboard(requestId)

  const telegramMessageId = await sendRequestToContractor(
    contractor.telegram_channel_id,
    caption,
    photoUrls,
    keyboard
  )

  // Сохранить результат маршрутизации
  const routedUpdate = {
    category,
    priority,
    ai_confidence: confidence,
    ai_raw_response: output.result as unknown as RequestUpdate['ai_raw_response'],
    status: 'routed' as const,
    contractor_id: contractor.id,
    telegram_message_id: telegramMessageId,
    requires_manual_review: false,
  } satisfies RequestUpdate
  await supabase
    .from('requests')
    .update(routedUpdate as unknown as never)
    .eq('id', requestId)

  await insertStatusHistory(supabase, requestId, 'ai_processing', 'routed', 'system')
}

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

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

async function upsertState(
  supabase: ReturnType<typeof createServiceRoleClient>,
  chatId: number,
  state: BotState,
  data: RegistrationData
): Promise<void> {
  const record = { chat_id: chatId, state, data: data as Json } satisfies TelegramBotStateInsert
  const { error } = await supabase
    .from('telegram_bot_states')
    .upsert(record as unknown as never, { onConflict: 'chat_id' })
  if (error) console.error('DB error upserting bot state:', error)
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

/**
 * Валидация телефонного номера.
 * Принимает форматы: +79991234567 или 89991234567 (11 цифр).
 */
function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  if (digits.length !== 11) return false
  return digits[0] === '7' || digits[0] === '8'
}

// ---------------------------------------------------------------------------
// Отправка кнопок выбора ЖК
// ---------------------------------------------------------------------------

async function sendComplexSelection(
  supabase: ReturnType<typeof createServiceRoleClient>,
  chatId: number
): Promise<void> {
  const { data: complexes, error } = await supabase
    .from('residential_complexes')
    .select('id, name')
    .order('name') as {
      data: Pick<ResidentialComplexRow, 'id' | 'name'>[] | null
      error: PostgrestError | null
    }

  if (error || !complexes || complexes.length === 0) {
    await sendOwnerMessage(
      chatId,
      'Не удалось загрузить список ЖК. Обратитесь к менеджеру.'
    )
    return
  }

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: complexes.map((c) => [
      { text: c.name, callback_data: `complex:${c.id}` },
    ]),
  }

  await sendOwnerMessage(chatId, 'Выберите ваш жилой комплекс:', keyboard)
}

// ---------------------------------------------------------------------------
// Приветственное сообщение с кнопками согласия
// ---------------------------------------------------------------------------

async function sendConsentMessage(chatId: number): Promise<void> {
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: '✅ Согласен', callback_data: 'consent_yes' },
        { text: '❌ Отказываюсь', callback_data: 'consent_no' },
      ],
    ],
  }

  await sendOwnerMessage(
    chatId,
    `Добро пожаловать в сервис гарантийного обслуживания А103!\n\n` +
      `Для использования сервиса необходимо ваше согласие на обработку персональных данных.\n\n` +
      `<b>Текст согласия:</b>\n${CONSENT_TEXT}\n\n` +
      `Нажмите кнопку ниже, чтобы продолжить:`,
    keyboard
  )
}
