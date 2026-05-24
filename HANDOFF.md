# FixFlow A103 — Session Handoff

## Что сделано

### Инфраструктура
- Next.js 16 App Router проект собран с нуля
- Задеплоен на Vercel: **fixflow-a103.vercel.app**
- GitHub: https://github.com/Vlad-Barmin/fixflow-a103.git (ветка `main`)
- БД: 17 миграций применены через Supabase SQL Editor (файл `MIGRATIONS_ALL.sql`)
- Все env-переменные прописаны в Vercel Settings → Environment Variables

### Telegram-боты
- Owner-бот: полный цикл работает — `/start` → регистрация → заявка → карточка подрядчику
- Contractor-бот: inline-кнопки работают — Accept / Decline / Complete+фото
- Webhooks установлены через `setWebhook` на оба бота

### Критические баги, исправленные в ходе сессии

| # | Проблема | Файл | Фикс |
|---|----------|------|------|
| 1 | `fire-and-forget` в route.ts — Vercel замораживает функцию после HTTP-ответа, фоновая промиса убивается | `src/app/api/telegram/owner/route.ts`, `contractor/route.ts` | Заменили `.catch()` на `await` + try/catch |
| 2 | `triggerAiClassification` тоже fire-and-forget внутри handler | `src/lib/telegram/owner-handler.ts` | Заменили на `await triggerAiClassification(...)` |
| 3 | Mock-классификатор не включался: заглушка начиналась с `sk-ant-` и проходила старую проверку | `src/agents/handlers/classify-request.ts` | Явный флаг `USE_MOCK_CLASSIFIER=true` вместо heuristic |
| 4 | `is_manager()` в `LANGUAGE sql` падала при парсинге — `manager_profiles` ещё не существовала | `MIGRATIONS_ALL.sql` | Заменили на `LANGUAGE plpgsql` (отложенный парсинг) |
| 5 | `//` комментарий в `vercel.json` ломал парсер | `vercel.json` | Убрали, заметку перенесли в `CRON_NOTES.md` |

### AI-классификатор
- Код Claude Sonnet (`claude-sonnet-4-5`) написан и задеплоен, но не активен
- Активен keyword-fallback: регексп по ключевым словам → 8 категорий
- Режим включается через `USE_MOCK_CLASSIFIER=true` в Vercel env vars

### Редизайн веб-дашборда (стиль A101) — завершён ✅
Выполнены все 9 шагов. Проверено на localhost, production-сборка (`npm run build`) прошла чисто.

| Шаг | Описание | Статус |
|-----|----------|--------|
| 1 | Шрифт Manrope (Google Fonts) + CSS-переменные палитры + базовые UI-компоненты (button, card, input, select) | ✅ |
| 2 | Login-страница | ✅ |
| 3 | Sidebar: белый фон, правая тень, красный логотип, активный nav — `bg-[#FEF2F2]`, аватар-инициал | ✅ |
| 4 | KPI-карточки (`rounded-2xl`, цветные icon-boxes) + главная страница дашборда | ✅ |
| 5 | Таблица заявок: toolbar в карточке, `rounded-2xl` контейнеры, `zinc-*` цвета | ✅ |
| 6 | Страница деталей заявки: breadcrumb, timeline-dots по статусу, прогресс-бар AI | ✅ |
| 7 | CRUD-страницы (подрядчики, квартиры, комплексы): диалоги `rounded-2xl shadow-2xl`, таблицы в карточках | ✅ |
| 8 | Страница отчётов: `Input`/`Label` вместо bare input, прогресс-бар выполнения, красная точка просрочки | ✅ |
| 9 | Страница настроек: styled placeholder | ✅ |

**Дизайн-система:** фон `#F5F5F5`, карточки `#FFFFFF rounded-2xl shadow-sm`, акцент `#D91C1C`, кнопки `rounded-full`, инпуты `rounded-xl`, шрифт Manrope 400–800.

---

## Текущее состояние

| Компонент | Статус |
|-----------|--------|
| Owner-бот (регистрация + заявки) | ✅ Работает |
| Contractor-бот (кнопки + фото) | ✅ Работает |
| AI-классификация (keyword mock) | ✅ Работает |
| Web-дашборд менеджера | ✅ Редизайн A101 завершён, готов к деплою |
| Cron `/api/cron/overdue` | ✅ Задеплоен, запускается раз в день (Hobby plan) |
| Storage (фото заявок) | ✅ Buckets созданы, приватные |
| Auth менеджера | ✅ Supabase Auth, httpOnly cookie |

---

## Что предстоит

### Обязательно перед боевым запуском
1. **Настоящий `ANTHROPIC_API_KEY`** — получить платный ключ Anthropic, прописать в Vercel, убрать/выключить `USE_MOCK_CLASSIFIER`
2. **Удалить TODO-код mock-классификатора** — блок `isApiKeyPlaceholder()` + `KEYWORD_RULES` в `src/agents/handlers/classify-request.ts`
3. **Создать менеджера** — Supabase Auth → создать пользователя, добавить строку в `manager_profiles`
4. **Заполнить `apartment_contractors`** — привязать квартиры к подрядчикам по категориям (иначе заявки уходят в `requires_manual_review`)
5. **Протестировать дашборд** — зайти под менеджером, проверить список заявок, фильтры, смену статуса, отчёты

### После Vercel Pro
6. **Вернуть cron на почасовой** — `vercel.json`: `0 9 * * *` → `0 * * * *` (см. `CRON_NOTES.md`)

### Улучшения (опционально)
7. Уведомления владельцу при смене статуса заявки (`accepted`, `completed`)
8. Удаление диагностических console.log в `classify-request.ts` вернуть после реального AI (сейчас уже убраны)

---

## Ключевые файлы

```
src/lib/telegram/owner-handler.ts      — state machine владельца + triggerAiClassification
src/lib/telegram/contractor-handler.ts — обработчик кнопок подрядчика
src/agents/handlers/classify-request.ts — AI-классификатор + mock-обход (TODO)
src/lib/supabase/admin.ts              — createServiceRoleClient (обходит RLS)
vercel.json                            — cron schedule
MIGRATIONS_ALL.sql                     — все 17 миграций для Supabase SQL Editor
CRON_NOTES.md                          — заметка про cron Hobby vs Pro
```

---

## Архитектурные особенности, важные для дальнейшей работы

- **Vercel serverless**: любой async-код после `return NextResponse.json(...)` убивается. Всё должно быть `await`-нуто ДО возврата ответа.
- **Supabase `never` type**: Supabase TypeScript inference возвращает `never` для insert/update/select. Везде стоят явные касты `as { data: T | null; error: PostgrestError | null }` и `as unknown as never`.
- **Service role vs server client**: webhooks и cron используют `createServiceRoleClient()` (обход RLS). Обычные API роуты менеджера — `createServerClient()` (через JWT cookie).
- **Contractor-бот не отвечает на `/start`** — это штатно. Бот работает только в канале/группе, реагирует на callback_query (кнопки) и photo (фото завершения).
