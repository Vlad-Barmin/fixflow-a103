---
description: Правила работы с базой данных Supabase в FixFlow A103
globs: ["supabase/**", "src/lib/supabase/**", "src/app/api/**"]
---

## Миграции

- Файлы в `supabase/migrations/` с именем `<timestamp>_<description>.sql`
- Все миграции идемпотентны: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`
- Каждая миграция имеет секцию rollback в комментарии
- Никогда не редактировать уже применённые миграции — только новые файлы

## RLS (Row Level Security)

- Каждая новая таблица: `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY`
- Используй `is_manager()` функцию, не прямую проверку `auth.uid()`
- Исключения (RLS отключён): `telegram_bot_states` (доступ только через service_role)
- Проверяй RLS после каждого изменения схемы

## Triqqgers

- Все таблицы с `updated_at`: триггер `set_updated_at` обязателен
- Используй общую функцию `update_updated_at()` — не создавай отдельную на каждую таблицу

## Supabase Clients

```typescript
// server-side с Auth (RLS работает) — для всех обычных операций
import { createServerClient } from '@/lib/supabase/server'

// service_role (обходит RLS) — ТОЛЬКО для:
// - Telegram webhooks
// - Cron jobs (/api/cron/*)
// - AI classifier (src/lib/ai/classifier.ts)
import { createServiceRoleClient } from '@/lib/supabase/admin'

// client-side (только чтение, анон ключ) — ТОЛЬКО для:
// - Client Components, которым нужны не чувствительные данные
import { createClientClient } from '@/lib/supabase/client'
```

## Индексы

- Обязательно на все внешние ключи
- На `requests.status`, `requests.created_at`, `requests.deadline`
- Partial index на незавершённые заявки: `WHERE status NOT IN ('completed')`
- Не добавляй индексы на редко используемые поля

## Storage

- Оба bucket (`request-photos`, `completion-photos`) — приватные (`public: false`)
- Доступ только через signed URLs (TTL 1 час для просмотра)
- Загрузка файлов — только через service_role из webhook handler
- Максимальный размер файла: 10MB
- Допустимые MIME-типы: `image/jpeg`, `image/png`, `image/webp`

## Запросы

- Никогда не используй `SELECT *` в production коде — указывай конкретные поля
- Для pagination: `limit` + `range` (не `offset` при больших таблицах)
- Все запросы к `requests` фильтруй по индексированным полям
- При N+1 проблемах — используй Supabase join (`.select('*, apartments(*)')`)
