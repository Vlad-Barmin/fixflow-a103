---
name: create-migration
description: "Создаёт Supabase SQL-миграцию для FixFlow A103 по описанию изменения схемы. Генерирует идемпотентный SQL-файл с правильным именем, RLS-политиками и триггерами."
---

Создай Supabase SQL-миграцию для FixFlow A103.

## Шаги

1. Определи timestamp: текущее время в формате `YYYYMMDDHHMMSS`
2. Создай файл: `supabase/migrations/<timestamp>_<короткое_описание>.sql`
3. Напиши SQL по правилам ниже

## Шаблон миграции

```sql
-- Migration: <описание что делает>
-- Created: <дата>

-- ============================================================
-- UP
-- ============================================================

-- Таблица
CREATE TABLE IF NOT EXISTS <table_name> (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ... поля ...
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "managers_only" ON <table_name>
  FOR ALL
  USING (is_manager())
  WITH CHECK (is_manager());

-- Триггер updated_at
CREATE TRIGGER IF NOT EXISTS set_updated_at
  BEFORE UPDATE ON <table_name>
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Индексы
CREATE INDEX IF NOT EXISTS idx_<table>_<field> ON <table_name>(<field>);

-- ============================================================
-- ROLLBACK (в комментарии, не выполнять)
-- DROP TABLE IF EXISTS <table_name>;
-- ============================================================
```

## Правила

- Все операции идемпотентны: `IF NOT EXISTS`, `CREATE OR REPLACE`
- Каждая таблица: RLS enabled + `managers_only` политика (если не исключение)
- Исключения RLS: `telegram_bot_states` (service_role only)
- `updated_at` поле → триггер `set_updated_at` (функция уже существует)
- Foreign keys: `ON DELETE CASCADE` для дочерних записей, `ON DELETE RESTRICT` для справочников
- UUID primary keys: `DEFAULT gen_random_uuid()`
- Индексы на все FK и часто фильтруемые поля

## После создания

Скажи database-architect проверить миграцию на корректность перед применением.
