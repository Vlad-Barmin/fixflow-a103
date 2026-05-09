---
description: Правила для Telegram-интеграции FixFlow A103 (bot webhooks, owner flow, contractor callbacks)
globs: ["src/app/api/telegram/**", "src/lib/telegram/**"]
---

## Верификация вебхука (ПЕРВОЕ в каждом handler)

```typescript
// Owner bot
const secret = req.nextUrl.searchParams.get('secret')
if (secret !== process.env.TELEGRAM_BOT_SECRET) {
  return NextResponse.json({ ok: false }, { status: 403 })
}

// Contractor bot
const secret = req.nextUrl.searchParams.get('secret')
if (secret !== process.env.TELEGRAM_CONTRACTOR_BOT_SECRET) {
  return NextResponse.json({ ok: false }, { status: 403 })
}
```

## Ответ Telegram — всегда 200 немедленно

```typescript
// Telegram ждёт 200 в течение 5 секунд
// Если не получает — повторяет запрос снова (нежелательно)
// Поэтому: возвращаем 200 сразу, обрабатываем асинхронно

export async function POST(req: NextRequest) {
  // Верификация
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.TELEGRAM_BOT_SECRET) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  const update = await req.json()

  // Запустить обработку в background (не await)
  processUpdate(update).catch(console.error)

  // Немедленно ответить Telegram
  return NextResponse.json({ ok: true })
}
```

## Rate Limiting

```typescript
// 30 сообщений в минуту на chat_id
// Используй in-memory Map<chatId, timestamps[]>
const rateLimitMap = new Map<number, number[]>()

function isRateLimited(chatId: number): boolean {
  const now = Date.now()
  const timestamps = rateLimitMap.get(chatId) ?? []
  const recent = timestamps.filter(t => now - t < 60_000)
  rateLimitMap.set(chatId, recent)
  if (recent.length >= 30) return true
  rateLimitMap.set(chatId, [...recent, now])
  return false
}
```

## Состояния бота владельца

```typescript
// Таблица telegram_bot_states — источник истины для состояния разговора
// States:
// 'awaiting_consent'   — ждёт нажатия кнопки согласия
// 'awaiting_name'      — ждёт ФИО
// 'awaiting_phone'     — ждёт телефон
// 'awaiting_complex'   — ждёт выбор ЖК
// 'awaiting_building'  — ждёт номер корпуса
// 'awaiting_apartment' — ждёт номер квартиры
// 'registered'         — зарегистрирован, ждёт заявок

// При каждом входящем сообщении:
// 1. Получить state по chat_id
// 2. Обработать по state
// 3. Обновить state + data (jsonb с промежуточными данными)
```

## Кнопки подрядчика

```typescript
// Inline keyboard для заявки в канале подрядчика
const keyboard = {
  inline_keyboard: [[
    { text: '✅ Принять', callback_data: `accept:${requestId}` },
    { text: '❌ Отклонить', callback_data: `decline:${requestId}` },
  ], [
    { text: '📷 Завершить с фото', callback_data: `complete:${requestId}` },
  ]]
}
```

## Отправка с retry

```typescript
// 3 попытки с экспоненциальным backoff: 1с → 2с → 4с
async function sendWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === 2) throw err
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000))
    }
  }
  throw new Error('unreachable')
}
```

## Отправка фото

```typescript
// 1 фото → sendPhoto с caption + keyboard
// 2-10 фото → sendMediaGroup, затем sendMessage с keyboard
// 0 фото → sendMessage с caption + keyboard

// Формат caption (краткий, Telegram лимит 1024 символа):
`🏠 Кв. ${apartment} | 📋 ${category}
📌 ${description.slice(0, 200)}
⏰ Дедлайн: ${formatDate(deadline)}`
```

## Переменные окружения

```
TELEGRAM_BOT_TOKEN           — токен бота владельцев
TELEGRAM_BOT_SECRET          — секрет для верификации webhook
TELEGRAM_CONTRACTOR_BOT_TOKEN — токен бота подрядчиков
TELEGRAM_CONTRACTOR_BOT_SECRET — секрет для верификации webhook
```

Все токены — только server-side, никогда в NEXT_PUBLIC_.
