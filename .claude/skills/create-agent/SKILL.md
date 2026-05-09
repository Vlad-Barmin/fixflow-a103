---
name: create-agent
description: "Создаёт или изменяет AI-классификатор заявок FixFlow A103. Используй когда нужно добавить новую категорию, улучшить промпт, изменить логику retry или оптимизировать стоимость."
---

Создай или обнови AI-компонент для FixFlow A103.

## Структура AI-компонента

```
src/agents/
├── config/
│   ├── classifier.ts    — конфигурация (модель, параметры, стоимость токенов)
│   └── prompts.ts       — системный промпт + шаблон пользовательского промпта
├── tools/
│   └── category-validator.ts  — парсинг и валидация JSON-ответа Claude
├── handlers/
│   └── classify-request.ts    — основная логика вызова API + retry
└── types.ts             — TypeScript типы

src/lib/ai/
└── classifier.ts        — публичный интерфейс (используется из API роутов)
```

## При добавлении новой категории

1. Добавить в `src/agents/types.ts` в тип `Category`
2. Обновить Zod-схему в `src/agents/tools/category-validator.ts`
3. Обновить системный промпт в `src/agents/config/prompts.ts`:
   - Описание новой категории в списке
   - Примеры для few-shot (если нужны)
4. Обновить `CATEGORY_LABELS` в `src/types/index.ts`
5. Добавить в `contractors.categories` массив допустимых значений
6. Создать миграцию если нужно обновить CHECK constraint в БД

## При улучшении промпта

Правила качественного классификационного промпта:
- Каждая категория: краткое описание + типичные примеры в скобках
- Приоритеты: объективные критерии, не субъективные ("угроза затопления" а не "срочно")
- Правила разрешения конфликтов (несколько категорий подходят)
- Формат вывода: JSON-схема с типами и ограничениями
- НЕ добавлять ФИО/телефон в промпт (152-ФЗ)

## Тест промпта перед применением

Проверить минимум 10 тестовых заявок:

```typescript
const TEST_CASES = [
  { input: 'Не работает розетка в ванной', expected: { category: 'electrical', priority: 'medium' } },
  { input: 'Заливает соседей снизу, вода хлещет', expected: { category: 'plumbing', priority: 'critical' } },
  { input: 'Сколы на плитке в коридоре', expected: { category: 'finishing', priority: 'low' } },
  { input: 'Не закрывается входная дверь', expected: { category: 'windows_doors', priority: 'medium' } },
  { input: 'Холодно, батареи не греют', expected: { category: 'hvac', priority: 'high' } },
  { input: 'Трещина в несущей стене', expected: { category: 'structural', priority: 'critical' } },
  { input: 'Сломалась встроенная плита от застройщика', expected: { category: 'appliances', priority: 'medium' } },
  { input: 'Что-то не так', expected: { confidence: '<0.5' } },  // → requires_manual_review
]
```

## Оценка качества

После изменения промпта проверить:
- Accuracy на тест-кейсах ≥ 85%
- Confidence для чётких заявок ≥ 0.8
- Confidence для неопределённых заявок < 0.5
- Валидный JSON в 100% случаев

## Чеклист

- [ ] Prompt caching включён (`cache_control: { type: 'ephemeral' }`)
- [ ] `temperature: 0` (детерминированный вывод)
- [ ] `max_tokens: 256` (хватает для JSON-ответа)
- [ ] Каждый вызов логируется в `ai_classification_log`
- [ ] Retry: 5с → 30с → fallback
- [ ] Дневной лимит проверяется перед вызовом
- [ ] ФИО и телефон НЕ передаются в промпт
