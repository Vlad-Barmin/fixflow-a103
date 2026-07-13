---
description: Правила для AI-агентов FixFlow A103 (OpenRouter, классификатор заявок)
globs: ["src/agents/**", "src/lib/ai/**", "src/app/api/requests/*/reclassify/**"]
---

## Модель и SDK

```typescript
// Используем OpenRouter (OpenAI-совместимый /chat/completions через fetch)
// НЕ Agent SDK — задача одиночная (классификация), не многошаговая
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

// Модель по умолчанию
const MODEL = 'anthropic/claude-sonnet-4.5'

// Параметры классификатора
const CLASSIFIER_CONFIG = {
  model: MODEL,
  max_tokens: 256,  // только JSON-ответ
  temperature: 0,   // детерминированный вывод
}
```

## API Key

- `OPENROUTER_API_KEY` только в `.env.local`, только server-side
- Никогда в client components, никогда в NEXT_PUBLIC_ переменных
- Никогда в коде или комментариях

## Prompt Caching

```typescript
// OpenRouter в OpenAI-совместимом режиме не поддерживает Anthropic
// cache_control — системный промпт кэширование не применяется
```

## Логирование

Каждый вызов API логировать в `ai_classification_log`:
```typescript
{
  request_id,
  model,
  input_tokens,
  output_tokens,
  cost_usd,         // рассчитывать из токенов
  confidence,
  category_result,
  priority_result,
  latency_ms,
  error,            // если была ошибка
}
```

## Rate Limiting

- Проверять дневной лимит из `app_settings.ai_daily_limit` (default 200) перед вызовом
- При превышении → `requires_manual_review = true`, без вызова API
- Rate limit хранится в БД, не в памяти (для Vercel serverless)

## Retry Logic

```
Попытка 1 → ошибка → ждать 5с →
Попытка 2 → ошибка → ждать 30с →
Попытка 3 → ошибка → fallback: requires_manual_review = true
```

## Fallback

При любом сбое AI (таймаут, невалидный JSON, ошибка API):
- `status = 'requires_manual_review'`
- `requires_manual_review = true`
- Записать ошибку в `ai_classification_log.error`
- НЕ выбрасывать ошибку наверх — это graceful degradation

## Confidence Threshold

```typescript
const CONFIDENCE_THRESHOLD = 0.5  // из app_settings.ai_confidence_threshold

if (result.confidence < CONFIDENCE_THRESHOLD) {
  // Не отправляем подрядчику — менеджер проверит вручную
  requires_manual_review = true
}
```

## Безопасность данных (152-ФЗ)

- В промпт передавать только: описание проблемы, данные квартиры (ЖК, корпус, номер)
- НЕ передавать: ФИО владельца, номер телефона, Telegram chat_id
- AI-логи удалять через 90 дней (cron job или pg_cron)

## Стоимость

```typescript
// anthropic/claude-sonnet-4.5 через OpenRouter
INPUT_COST_PER_M  = 3.00   // $/M tokens
OUTPUT_COST_PER_M = 15.00  // $/M tokens

// Типичный запрос (без prompt caching — OpenRouter его не поддерживает):
// Input: ~800 tokens = $0.0024
// Output: ~100 tokens = $0.0015
// Итого: ~$0.004 за классификацию
```
