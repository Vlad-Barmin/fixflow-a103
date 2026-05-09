---
description: Правила для API-роутов Next.js в FixFlow A103
globs: ["src/app/api/**"]
---

## Структура роута

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

// 1. Zod-схема первой
const InputSchema = z.object({ ... })

// 2. Handler — парсинг → валидация → бизнес-логика → ответ
export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = InputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } },
      { status: 422 }
    )
  }
  // ...
}
```

## Коды ошибок и HTTP-статусы

| Код | HTTP | Ситуация |
|-----|------|----------|
| `VALIDATION_ERROR` | 422 | Zod не прошёл |
| `AUTH_ERROR` | 401 | Не авторизован |
| `FORBIDDEN` | 403 | Нет прав |
| `NOT_FOUND` | 404 | Объект не найден |
| `CONFLICT` | 409 | Уже существует |
| `DB_ERROR` | 500 | Ошибка Supabase |
| `AI_ERROR` | 502 | Ошибка Anthropic |
| `TELEGRAM_ERROR` | 502 | Ошибка Telegram API |
| `RATE_LIMIT` | 429 | Превышен лимит |

Форма ошибки всегда: `{ error: { code: string, message: string, details?: unknown } }`

## Валидация

- Zod перед любым обращением к БД — без исключений
- Для UUID: `z.string().uuid()`
- Для enum значений: `z.enum(['new', 'routed', ...])`
- Для необязательных фильтров: `.optional()` или `.nullable()`
- Не доверяй `req.params` без валидации

## Auth Manager

```typescript
// Проверка авторизации менеджера
import { createServerClient } from '@/lib/supabase/server'

const supabase = createServerClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) {
  return NextResponse.json(
    { error: { code: 'AUTH_ERROR', message: 'Unauthorized' } },
    { status: 401 }
  )
}
```

## Rate Limiting

```typescript
// Manager API: 100 req/min
// Telegram webhook: 30 msg/min per chat_id
// AI classification: 200/day (в app_settings)

// Используй in-memory Map с TTL или Redis (если добавим)
```

## Запросы к БД

- Никогда не возвращай сырые ошибки Supabase в ответ — только `DB_ERROR` + безопасное сообщение
- Лог ошибок — в console.error с полным контекстом (для Vercel logs)
- При 404 проверяй через `.maybeSingle()` (не `.single()` который бросает ошибку при отсутствии)

## Бизнес-логика

- Бизнес-логика не в route.ts — выноси в `src/lib/` сервисы
- Каждое изменение статуса → запись в `request_status_history`
- Каждый AI-вызов → запись в `ai_classification_log`
