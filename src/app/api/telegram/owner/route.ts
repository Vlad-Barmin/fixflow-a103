/**
 * POST /api/telegram/owner
 *
 * Webhook для owner bot.
 * Telegram ожидает ответ 200 в течение 5 секунд — отвечаем немедленно,
 * реальную обработку запускаем в background.
 *
 * Безопасность:
 *   - Проверяем ?secret= до любой обработки (TELEGRAM_BOT_SECRET)
 *   - Rate limit: 30 сообщений/мин на chat_id (in-memory Map)
 */

import { NextRequest, NextResponse } from 'next/server'
import { handleOwnerUpdate } from '@/lib/telegram/owner-handler'
import type { TelegramUpdate } from '@/lib/telegram/api'

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, сбрасывается при рестарте инстанса)
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<number, number[]>()

function isRateLimited(chatId: number): boolean {
  const now = Date.now()
  const timestamps = rateLimitMap.get(chatId) ?? []
  const recent = timestamps.filter((t) => now - t < 60_000)
  if (recent.length >= 30) {
    rateLimitMap.set(chatId, recent)
    return true
  }
  rateLimitMap.set(chatId, [...recent, now])
  return false
}

function extractChatId(update: TelegramUpdate): number | null {
  return (
    update.message?.chat.id ??
    update.callback_query?.message?.chat.id ??
    update.callback_query?.from.id ??
    null
  )
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Верификация секрета — первым делом
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.TELEGRAM_BOT_SECRET) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  // 2. Парсинг тела
  let update: TelegramUpdate
  try {
    update = (await req.json()) as TelegramUpdate
  } catch {
    // Невалидный JSON от Telegram — вернуть 200, чтобы не получать повторов
    return NextResponse.json({ ok: true })
  }

  // 3. Rate limiting по chat_id
  const chatId = extractChatId(update)
  if (chatId !== null && isRateLimited(chatId)) {
    // Всё равно возвращаем 200 — Telegram не должен повторять запрос
    return NextResponse.json({ ok: true })
  }

  // 4. Обработка в background (не await)
  handleOwnerUpdate(update).catch((err) => {
    console.error('[owner webhook] unhandled error:', err)
  })

  // 5. Немедленный ответ Telegram
  return NextResponse.json({ ok: true })
}
