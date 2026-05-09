/**
 * Обёртка над Telegram Bot API для FixFlow A103.
 *
 * Все публичные функции используют exponential-backoff retry (3 попытки).
 * Токены берутся исключительно из process.env — никогда не передаются клиенту.
 */

// ---------------------------------------------------------------------------
// Telegram типы
// ---------------------------------------------------------------------------

export interface InlineKeyboardButton {
  text: string
  callback_data: string
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
}

export interface TelegramPhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

export interface TelegramDocument {
  file_id: string
  file_name?: string
  mime_type?: string
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  text?: string
  photo?: TelegramPhotoSize[]
  document?: TelegramDocument
}

export interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

// ---------------------------------------------------------------------------
// Внутренние типы ответов Telegram API
// ---------------------------------------------------------------------------

interface TelegramApiResponse<T> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
}

interface TelegramMessageResult {
  message_id: number
  chat: TelegramChat
}

interface TelegramFile {
  file_id: string
  file_unique_id: string
  file_size?: number
  file_path?: string
}

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot'

/** Задержки retry: 1с → 2с → 4с */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

/**
 * Вызов Telegram Bot API с автоматическим retry при сбоях.
 * Возвращает `result` из ответа или бросает ошибку после 3 попыток.
 */
async function callTelegramApi<T>(
  token: string,
  method: string,
  body: unknown
): Promise<T> {
  const url = `${TELEGRAM_API_BASE}${token}/${method}`

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = (await res.json()) as TelegramApiResponse<T>

      if (!json.ok) {
        throw new Error(
          `Telegram API error [${method}]: ${json.description ?? 'unknown'} (code ${json.error_code ?? res.status})`
        )
      }

      return json.result as T
    } catch (err) {
      if (attempt === 2) throw err
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
    }
  }

  // Недостижимо, но TypeScript требует явного возврата
  throw new Error('Telegram API: all retries exhausted')
}

// ---------------------------------------------------------------------------
// Форматирование
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  electrical: 'Электрика',
  plumbing: 'Сантехника',
  hvac: 'Отопление/Вентиляция',
  structural: 'Конструктив',
  windows_doors: 'Окна/Двери',
  finishing: 'Отделка',
  appliances: 'Техника',
  other: 'Прочее',
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: '🔴 Срочно',
  high: '🟠 Высокий',
  normal: '🟡 Обычный',
  low: '🟢 Низкий',
}

function formatDate(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  })
}

export interface RequestCaptionParams {
  apartmentNumber: string
  building: string
  complexName: string
  category: string | null
  priority: string
  description: string
  deadline: string | null
  requestId: string
}

/**
 * Формирует caption для карточки заявки, отправляемой подрядчику.
 * Лимит Telegram: 1024 символа для caption.
 */
export function buildRequestCaption(params: RequestCaptionParams): string {
  const categoryLabel =
    (params.category && CATEGORY_LABELS[params.category]) ?? 'Прочее'
  const priorityLabel = PRIORITY_LABELS[params.priority] ?? params.priority
  const deadlineStr = params.deadline ? formatDate(params.deadline) : 'не задан'
  const shortId = params.requestId.slice(0, 8)
  const descriptionSlice = params.description.slice(0, 300)

  return (
    `🏠 Кв. ${params.apartmentNumber}, корп. ${params.building}\n` +
    `🏢 ${params.complexName}\n` +
    `📋 ${categoryLabel} | ${priorityLabel}\n` +
    `📌 ${descriptionSlice}\n` +
    `⏰ Дедлайн: ${deadlineStr}\n` +
    `🆔 #${shortId}`
  ).slice(0, 1024)
}

// ---------------------------------------------------------------------------
// Публичные функции — Owner Bot
// ---------------------------------------------------------------------------

/**
 * Отправить текстовое сообщение владельцу квартиры.
 */
export async function sendOwnerMessage(
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup
): Promise<void> {
  const ownerToken = process.env.TELEGRAM_BOT_TOKEN
  if (!ownerToken) throw new Error('TELEGRAM_BOT_TOKEN is not set')

  await callTelegramApi<TelegramMessageResult>(ownerToken, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  })
}

// ---------------------------------------------------------------------------
// Публичные функции — Contractor Bot
// ---------------------------------------------------------------------------

/**
 * Отправить карточку заявки в канал подрядчика.
 *
 * - 0 фото → sendMessage
 * - 1 фото → sendPhoto с caption + keyboard
 * - 2+ фото → sendMediaGroup (без кнопок) + отдельный sendMessage с keyboard
 *
 * Возвращает telegram_message_id сообщения с кнопками управления.
 */
export async function sendRequestToContractor(
  channelId: number,
  caption: string,
  photoStoragePaths: string[],
  keyboard: InlineKeyboardMarkup
): Promise<number> {
  const contractorToken = process.env.TELEGRAM_CONTRACTOR_BOT_TOKEN
  if (!contractorToken) throw new Error('TELEGRAM_CONTRACTOR_BOT_TOKEN is not set')

  if (photoStoragePaths.length === 0) {
    const result = await callTelegramApi<TelegramMessageResult>(
      contractorToken,
      'sendMessage',
      {
        chat_id: channelId,
        text: caption,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }
    )
    return result.message_id
  }

  if (photoStoragePaths.length === 1) {
    const result = await callTelegramApi<TelegramMessageResult>(
      contractorToken,
      'sendPhoto',
      {
        chat_id: channelId,
        photo: photoStoragePaths[0],
        caption,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      }
    )
    return result.message_id
  }

  // Несколько фото — sendMediaGroup, затем отдельное сообщение с кнопками
  const media = photoStoragePaths.map((path, idx) => ({
    type: 'photo',
    media: path,
    ...(idx === 0 ? { caption, parse_mode: 'HTML' } : {}),
  }))

  await callTelegramApi<TelegramMessageResult[]>(
    contractorToken,
    'sendMediaGroup',
    { chat_id: channelId, media }
  )

  const result = await callTelegramApi<TelegramMessageResult>(
    contractorToken,
    'sendMessage',
    {
      chat_id: channelId,
      text: caption,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    }
  )
  return result.message_id
}

/**
 * Редактировать текст существующего сообщения в канале подрядчика.
 */
export async function editContractorMessage(
  channelId: number,
  messageId: number,
  text: string
): Promise<void> {
  const contractorToken = process.env.TELEGRAM_CONTRACTOR_BOT_TOKEN
  if (!contractorToken) throw new Error('TELEGRAM_CONTRACTOR_BOT_TOKEN is not set')

  await callTelegramApi<TelegramMessageResult>(
    contractorToken,
    'editMessageText',
    {
      chat_id: channelId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
    }
  )
}

/**
 * Ответить на callback query (убрать "часики" у кнопки).
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<void> {
  const contractorToken = process.env.TELEGRAM_CONTRACTOR_BOT_TOKEN
  if (!contractorToken) throw new Error('TELEGRAM_CONTRACTOR_BOT_TOKEN is not set')

  await callTelegramApi<boolean>(contractorToken, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  })
}

/**
 * Получить информацию о файле по file_id (для последующей загрузки).
 */
export async function getContractorFile(fileId: string): Promise<TelegramFile> {
  const contractorToken = process.env.TELEGRAM_CONTRACTOR_BOT_TOKEN
  if (!contractorToken) throw new Error('TELEGRAM_CONTRACTOR_BOT_TOKEN is not set')

  return callTelegramApi<TelegramFile>(contractorToken, 'getFile', {
    file_id: fileId,
  })
}

/**
 * Скачать файл из Telegram CDN по file_path.
 * Возвращает ArrayBuffer с содержимым файла.
 */
export async function downloadTelegramFile(
  filePath: string
): Promise<ArrayBuffer> {
  const contractorToken = process.env.TELEGRAM_CONTRACTOR_BOT_TOKEN
  if (!contractorToken) throw new Error('TELEGRAM_CONTRACTOR_BOT_TOKEN is not set')

  const url = `https://api.telegram.org/file/bot${contractorToken}/${filePath}`

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Failed to download Telegram file: ${res.status}`)
      }
      return res.arrayBuffer()
    } catch (err) {
      if (attempt === 2) throw err
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
    }
  }

  throw new Error('Telegram file download: all retries exhausted')
}

/**
 * Строит inline keyboard для карточки заявки в канале подрядчика.
 */
export function buildContractorKeyboard(requestId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Принять', callback_data: `accept:${requestId}` },
        { text: '❌ Отклонить', callback_data: `decline:${requestId}` },
      ],
      [{ text: '📷 Завершить с фото', callback_data: `complete:${requestId}` }],
    ],
  }
}
