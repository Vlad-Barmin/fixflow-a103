---
name: create-telegram-handler
description: "Создаёт обработчик для Telegram-вебхука FixFlow A103 (бот владельцев или подрядчиков). Включает верификацию секрета, обработку update-типов, state machine для регистрации."
---

Создай Telegram webhook handler для FixFlow A103.

## Выбор типа

**Owner bot** (`/api/telegram/owner`): регистрация жильцов + приём заявок
**Contractor bot** (`/api/telegram/contractor`): обработка callback кнопок (принять/отклонить/завершить)

## Шаблон Owner Bot Handler

```typescript
// src/app/api/telegram/owner/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { processOwnerUpdate } from '@/lib/telegram/owner-handler'

export async function POST(req: NextRequest) {
  // 1. Верификация — ПЕРВЫМ ДЕЛОМ
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.TELEGRAM_BOT_SECRET) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  // 2. Ответить Telegram немедленно
  const update = await req.json()

  // 3. Обработать асинхронно (не await)
  processOwnerUpdate(update).catch(err =>
    console.error('Owner bot error:', err, { update })
  )

  return NextResponse.json({ ok: true })
}
```

## Шаблон обработки состояний владельца

```typescript
// src/lib/telegram/owner-handler.ts
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { sendMessage, sendInlineKeyboard } from './api'

export async function processOwnerUpdate(update: TelegramUpdate) {
  const chatId = update.message?.chat.id ?? update.callback_query?.from.id
  if (!chatId) return

  const supabase = createServiceRoleClient()

  // Получить текущее состояние
  const { data: stateRow } = await supabase
    .from('telegram_bot_states')
    .select('state, data')
    .eq('chat_id', chatId)
    .maybeSingle()

  const state = stateRow?.state ?? 'new'
  const data = stateRow?.data ?? {}

  // State machine
  switch (state) {
    case 'new':
    case 'awaiting_consent':
      return handleConsent(chatId, update, supabase)
    case 'awaiting_name':
      return handleName(chatId, update, data, supabase)
    case 'awaiting_phone':
      return handlePhone(chatId, update, data, supabase)
    case 'awaiting_complex':
      return handleComplex(chatId, update, data, supabase)
    case 'awaiting_building':
      return handleBuilding(chatId, update, data, supabase)
    case 'awaiting_apartment':
      return handleApartment(chatId, update, data, supabase)
    case 'registered':
      return handleRequest(chatId, update, supabase)
    default:
      return sendMessage(chatId, 'Нажмите /start для начала')
  }
}

async function updateState(
  chatId: number,
  state: string,
  data: object,
  supabase: ReturnType<typeof createServiceRoleClient>
) {
  await supabase
    .from('telegram_bot_states')
    .upsert({ chat_id: chatId, state, data, updated_at: new Date().toISOString() })
}
```

## Шаблон Contractor Bot Handler

```typescript
// src/app/api/telegram/contractor/route.ts
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.TELEGRAM_CONTRACTOR_BOT_SECRET) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  const update = await req.json()
  processContractorUpdate(update).catch(err =>
    console.error('Contractor bot error:', err, { update })
  )
  return NextResponse.json({ ok: true })
}

// Обработка callback_query (кнопки)
async function processContractorUpdate(update: TelegramUpdate) {
  if (!update.callback_query) return

  const { data: callbackData, from, message } = update.callback_query
  const [action, requestId] = callbackData.split(':')

  switch (action) {
    case 'accept':  return handleAccept(requestId, from.id)
    case 'decline': return handleDecline(requestId, from.id)
    case 'complete': return handleComplete(requestId, from.id, message)
  }
}
```

## Вспомогательные функции Telegram API

```typescript
// src/lib/telegram/api.ts
const BASE_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

export async function sendMessage(chatId: number, text: string, extra?: object) {
  return fetch(`${BASE_URL}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  }).then(r => r.json())
}

export async function sendPhoto(chatId: number, photo: string, caption: string, replyMarkup?: object) {
  return fetch(`${BASE_URL}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo, caption, reply_markup: replyMarkup }),
  }).then(r => r.json())
}
```

## Правила

- Верификация secret — всегда первая операция
- Немедленный ответ 200 — обработка асинхронна
- Все ошибки обработчика логировать с `update` контекстом
- State changes — через `upsert` на `telegram_bot_states`
- Retry отправки → 3 попытки с backoff
