# FixFlow A103 — Промпт для автономной сборки проекта

Вставь этот промпт в Claude Code (VS Code) для запуска автономной сборки.

---

## ПРОМПТ

```
Ты собираешь FixFlow A103 — AI-систему управления заявками на гарантийный ремонт.
Прочитай CLAUDE.md и SPEC.md — там полная документация. Ниже — план автономной сборки.

## Команда субагентов (делегируй им работу)

- database-architect — схема БД, миграции, RLS
- backend-engineer — API роуты, Telegram боты, cron
- frontend-developer — дашборд менеджера, UI
- ai-agent-architect — классификатор заявок на Claude Sonnet
- qa-reviewer — проверка каждого модуля перед финализацией

## Порядок сборки (строго по фазам)

### Фаза 1: Инициализация проекта
1. Создать Next.js 16 проект: `npx create-next-app@latest . --typescript --tailwind --app --src-dir`
2. Установить зависимости из SPEC Appendix C (package.json)
3. Настроить TypeScript strict mode в tsconfig.json
4. Создать .env.local по шаблону из CLAUDE.md (с заглушками)
5. Создать vercel.json с cron конфигурацией

### Фаза 2: База данных (делегируй database-architect)
1. Создать все 13 миграций в supabase/migrations/ (каждая таблица — отдельный файл)
2. Функция is_manager() и update_updated_at() 
3. RLS-политики для всех таблиц
4. Индексы
5. Storage bucket конфигурации
6. Seed-данные для разработки (1 ЖК, 3 квартиры, 2 подрядчика)

### Фаза 3: Supabase клиенты и типы
1. src/lib/supabase/server.ts — createServerClient()
2. src/lib/supabase/client.ts — createClientClient()
3. src/lib/supabase/admin.ts — createServiceRoleClient()
4. src/types/index.ts — TypeScript типы для всех сущностей

### Фаза 4: AI-классификатор (делегируй ai-agent-architect)
1. src/agents/types.ts
2. src/agents/config/prompts.ts — системный промпт с 8 категориями
3. src/agents/config/classifier.ts — конфигурация модели
4. src/agents/tools/category-validator.ts — Zod-валидация JSON ответа
5. src/agents/handlers/classify-request.ts — retry логика
6. src/lib/ai/classifier.ts — публичный интерфейс

### Фаза 5: Telegram боты (делегируй backend-engineer)
1. src/lib/telegram/api.ts — обёртка над Telegram Bot API
2. src/lib/telegram/owner-handler.ts — state machine регистрации
3. src/lib/telegram/contractor-handler.ts — обработка callback кнопок
4. src/app/api/telegram/owner/route.ts — вебхук бота владельцев
5. src/app/api/telegram/contractor/route.ts — вебхук бота подрядчиков

### Фаза 6: API роуты (делегируй backend-engineer)
Создать все 22 эндпоинта из CLAUDE.md по шаблону из skills/create-api-route/:
- /api/requests (GET+POST)
- /api/requests/[id] (GET+PATCH+DELETE)
- /api/requests/[id]/reclassify (POST)
- /api/requests/[id]/reassign (POST)  
- /api/requests/[id]/comment (POST)
- /api/contractors и /api/contractors/[id]
- /api/apartments и /api/apartments/[id]
- /api/complexes и /api/complexes/[id]
- /api/reports/contractor-performance (GET)
- /api/reports/xlsx (GET)
- /api/cron/overdue (POST)

### Фаза 7: Фронтенд (делегируй frontend-developer)
1. src/app/(auth)/login/page.tsx — страница входа
2. src/app/(dashboard)/dashboard/layout.tsx — layout с сайдбаром
3. src/components/dashboard/Sidebar.tsx
4. src/app/(dashboard)/dashboard/page.tsx — KPI + таблица заявок
5. src/app/(dashboard)/dashboard/requests/[id]/page.tsx — детальная карточка
6. src/app/(dashboard)/dashboard/contractors/page.tsx — CRUD
7. src/app/(dashboard)/dashboard/apartments/page.tsx — CRUD
8. src/app/(dashboard)/dashboard/complexes/page.tsx — CRUD
9. src/app/(dashboard)/dashboard/reports/page.tsx — аналитика

### Фаза 8: Проверка (делегируй qa-reviewer)
После каждой фазы запускать qa-reviewer для проверки:
- Безопасность (секреты, RLS, auth)
- Типизация (no any)
- Бизнес-логика (статусы, лог, 152-ФЗ)

### Фаза 9: Финальная проверка
1. `npm run type-check` — без ошибок
2. `npm run lint` — без ошибок
3. `npm run build` — успешная сборка
4. Все env vars задокументированы в .env.local
5. DEPLOYMENT_CHECKLIST.md из SPEC Appendix E — выполнить

## Правила автономной работы

- Следуй SPEC.md как источнику истины — если вопрос не покрыт, спроси
- Делегируй задачи профильным субагентам, не делай всё сам
- После каждой фазы — краткий отчёт: что сделано, что осталось
- При блокере — останови и объясни, не придумывай решения за пределами SPEC
- Все временные решения отмечай комментарием TODO + объяснением

## Начни с Фазы 1
```

---

## Как использовать

1. Убедись что в VS Code открыта папка `FixFlow А103`
2. Убедись что Supabase MCP и Context7 MCP подключены
3. Скопируй содержимое блока ПРОМПТ выше
4. Вставь в Claude Code чат
5. Дождись завершения Фазы 1, затем дай команду продолжать

## Что нужно подготовить заранее

- [ ] Supabase проект создан, URL и ключи получены
- [ ] Telegram боты созданы через @BotFather, токены получены
- [ ] Anthropic API ключ получен
- [ ] Vercel аккаунт подключён (для деплоя)
- [ ] `.env.local` заполнен реальными значениями

## MCP конфигурация

В настройках Claude Code должны быть подключены:
```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest",
               "--supabase-url", "YOUR_URL",
               "--supabase-key", "YOUR_SERVICE_ROLE_KEY"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```
