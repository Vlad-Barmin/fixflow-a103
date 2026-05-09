---
description: Критические правила безопасности FixFlow A103. Применяются ко всему проекту.
globs: ["src/**", "supabase/**"]
---

## Ключи и секреты — АБСОЛЮТНЫЕ ЗАПРЕТЫ

```
❌ НИКОГДА не помещать в client-side код:
   - SUPABASE_SERVICE_ROLE_KEY
   - ANTHROPIC_API_KEY
   - TELEGRAM_BOT_TOKEN
   - TELEGRAM_BOT_SECRET
   - TELEGRAM_CONTRACTOR_BOT_TOKEN
   - TELEGRAM_CONTRACTOR_BOT_SECRET
   - CRON_SECRET

❌ НИКОГДА не использовать NEXT_PUBLIC_ префикс для секретов
❌ НИКОГДА не коммитить .env.local
✅ Все секреты — только в process.env.* на server-side
```

## Supabase Service Role

```typescript
// service_role обходит RLS — использовать ТОЛЬКО в:
// ✅ src/lib/supabase/admin.ts (createServiceRoleClient)
// ✅ Telegram webhook handlers
// ✅ Cron job handler
// ✅ AI classifier

// ❌ НИКОГДА не использовать:
// - В 'use client' компонентах
// - В публичных API роутах без auth проверки
// - В src/lib/supabase/client.ts
```

## Аутентификация менеджера

```typescript
// JWT в httpOnly cookie (Supabase Auth SSR)
// ❌ НЕ localStorage
// ❌ НЕ sessionStorage
// ❌ НЕ URL параметры

// Проверка в server-side коде:
const supabase = createServerClient()
const { data: { user } } = await supabase.auth.getUser()
// НЕ getSession() — она не проверяет JWT с сервером
```

## Telegram Webhooks

```typescript
// Каждый webhook handler — первое что делает:
const secret = req.nextUrl.searchParams.get('secret')
if (secret !== process.env.TELEGRAM_BOT_SECRET) {
  return NextResponse.json({ ok: false }, { status: 403 })
}
// Без этой проверки — любой может слать нам фейковые обновления
```

## Cron Endpoint

```typescript
// /api/cron/overdue — только с секретным заголовком
if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

## Supabase Storage

- Оба bucket приватные: `public: false`
- Доступ через signed URLs: `storage.createSignedUrl(path, 3600)` (TTL 1 час)
- Загрузка только через server-side код с service_role
- Никаких публичных URL на фото с персональными данными

## 152-ФЗ (Персональные данные)

```typescript
// owner_consents — обязательные поля:
consent_text: string  // полный текст согласия (snapshot)
consented_at: timestamptz
revoked_at?: timestamptz  // поддержка отзыва

// При запросе на удаление данных:
// 1. Обнулить owner_name, owner_phone в apartments
// 2. Установить revoked_at в owner_consents
// 3. Удалить telegram_bot_states запись
// 4. НЕ удалять саму заявку (нужна для отчётности) — анонимизировать

// AI-логи:
// Удалять записи ai_classification_log старше 90 дней
// (pg_cron или Vercel cron)

// В промпт AI — НЕ передавать:
// ❌ ФИО владельца
// ❌ Номер телефона
// ❌ Telegram chat_id
// ✅ Только описание проблемы + адрес квартиры
```

## Input Validation

```typescript
// Все входные данные из: req.body, req.params, req.query
// Валидировать через Zod ПЕРЕД любой обработкой

// ❌ Нет SQL-инъекций (Supabase ORM защищает, но параметры через .eq(), не строки)
// ❌ Нет XSS — React экранирует, но dangerouslySetInnerHTML запрещён
// ❌ Нет path traversal при работе со Storage paths
```

## .gitignore

Обязательные записи:
```
.env.local
.env.*.local
*.pem
```

## Ошибки — не раскрывать внутреннее

```typescript
// ❌ Плохо:
return NextResponse.json({ error: supabaseError.message })
// Может раскрыть структуру БД

// ✅ Хорошо:
console.error('DB error:', supabaseError)
return NextResponse.json(
  { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
  { status: 500 }
)
```
