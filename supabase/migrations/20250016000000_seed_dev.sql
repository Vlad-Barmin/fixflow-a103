-- ============================================================================
-- Migration: 20250016000000_seed_dev.sql
-- Purpose: Development seed data. Idempotent (uses fixed UUIDs + ON CONFLICT).
--
--   - 1 ЖК: "ЖК Звёздный"
--   - 3 квартиры (кв. 1, 15, 42)
--   - 2 подрядчика
--       * "ЭлектроПлюс" — electrical, plumbing
--       * "КлиматСтрой" — hvac, structural
--   - apartment_contractors привязки на все 3 квартиры × 4 категории
--
-- WARNING: do NOT run this migration in production.
--          It is intended for local Supabase dev environment only.
--
-- Rollback:
--   DELETE FROM public.apartment_contractors WHERE apartment_id IN (...);
--   DELETE FROM public.apartments            WHERE id IN (...);
--   DELETE FROM public.contractors           WHERE id IN (...);
--   DELETE FROM public.residential_complexes WHERE id IN (...);
-- ============================================================================

-- Fixed UUIDs (kept stable so re-runs are idempotent)
-- Complex
--   c0000001-... — ЖК Звёздный
-- Apartments
--   a0000001-... кв. 1
--   a0000002-... кв. 15
--   a0000003-... кв. 42
-- Contractors
--   b0000001-... ЭлектроПлюс
--   b0000002-... КлиматСтрой

-- ---- Residential complex ----
INSERT INTO public.residential_complexes (id, name, address)
VALUES
  ('c0000001-0000-0000-0000-000000000001',
   'ЖК Звёздный',
   'ул. Звёздная, д. 1, Москва')
ON CONFLICT (id) DO NOTHING;

-- ---- Apartments ----
INSERT INTO public.apartments
  (id, complex_id, building, number, owner_name, owner_phone,
   owner_telegram_chat_id, warranty_expires_at)
VALUES
  ('a0000001-0000-0000-0000-000000000001',
   'c0000001-0000-0000-0000-000000000001',
   '1', '1',
   'Иванов Иван Иванович',  '+79991110001',
   100000001,
   (now() + interval '2 years')),
  ('a0000002-0000-0000-0000-000000000002',
   'c0000001-0000-0000-0000-000000000001',
   '1', '15',
   'Петрова Мария Сергеевна', '+79991110015',
   100000015,
   (now() + interval '1 year')),
  ('a0000003-0000-0000-0000-000000000003',
   'c0000001-0000-0000-0000-000000000001',
   '2', '42',
   'Сидоров Алексей Петрович', '+79991110042',
   100000042,
   (now() + interval '3 years'))
ON CONFLICT (id) DO NOTHING;

-- ---- Contractors ----
INSERT INTO public.contractors
  (id, name, telegram_channel_id, phone, categories, is_active)
VALUES
  ('b0000001-0000-0000-0000-000000000001',
   'ЭлектроПлюс',
   -1001000000001,
   '+79992220001',
   ARRAY['electrical','plumbing']::text[],
   true),
  ('b0000002-0000-0000-0000-000000000002',
   'КлиматСтрой',
   -1001000000002,
   '+79992220002',
   ARRAY['hvac','structural']::text[],
   true)
ON CONFLICT (id) DO NOTHING;

-- ---- Apartment ↔ contractor bindings ----
-- Все 3 квартиры получают одинаковый набор подрядчиков.
INSERT INTO public.apartment_contractors (apartment_id, category, contractor_id)
VALUES
  -- кв. 1
  ('a0000001-0000-0000-0000-000000000001', 'electrical', 'b0000001-0000-0000-0000-000000000001'),
  ('a0000001-0000-0000-0000-000000000001', 'plumbing',   'b0000001-0000-0000-0000-000000000001'),
  ('a0000001-0000-0000-0000-000000000001', 'hvac',       'b0000002-0000-0000-0000-000000000002'),
  ('a0000001-0000-0000-0000-000000000001', 'structural', 'b0000002-0000-0000-0000-000000000002'),
  -- кв. 15
  ('a0000002-0000-0000-0000-000000000002', 'electrical', 'b0000001-0000-0000-0000-000000000001'),
  ('a0000002-0000-0000-0000-000000000002', 'plumbing',   'b0000001-0000-0000-0000-000000000001'),
  ('a0000002-0000-0000-0000-000000000002', 'hvac',       'b0000002-0000-0000-0000-000000000002'),
  ('a0000002-0000-0000-0000-000000000002', 'structural', 'b0000002-0000-0000-0000-000000000002'),
  -- кв. 42
  ('a0000003-0000-0000-0000-000000000003', 'electrical', 'b0000001-0000-0000-0000-000000000001'),
  ('a0000003-0000-0000-0000-000000000003', 'plumbing',   'b0000001-0000-0000-0000-000000000001'),
  ('a0000003-0000-0000-0000-000000000003', 'hvac',       'b0000002-0000-0000-0000-000000000002'),
  ('a0000003-0000-0000-0000-000000000003', 'structural', 'b0000002-0000-0000-0000-000000000002')
ON CONFLICT (apartment_id, category) DO NOTHING;
