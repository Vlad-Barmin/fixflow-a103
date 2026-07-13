/**
 * Конфигурация AI-классификатора заявок FixFlow A103.
 *
 * Используется OpenRouter (OpenAI-совместимый /chat/completions), модель —
 * Claude Sonnet 4.5 через провайдера anthropic/claude-sonnet-4.5. Задача
 * одиночная (структурированный JSON-вывод), не многошаговая.
 */
export const CLASSIFIER_CONFIG = {
  model: 'anthropic/claude-sonnet-4.5' as const,
  /** Максимум токенов вывода — достаточно для короткого JSON */
  max_tokens: 256,
  /** temperature: 0 — детерминированный вывод для классификации */
  temperature: 0,
}

// ---------------------------------------------------------------------------
// Стоимость токенов claude-sonnet-4.5 через OpenRouter (USD за миллион токенов)
// Prompt caching Anthropic (cache_control) в OpenAI-совместимом формате
// OpenRouter недоступен, поэтому cache-read токены больше не тарифицируются
// отдельно — calculateCostUsd всегда получает cacheReadTokens = 0.
// ---------------------------------------------------------------------------

export const INPUT_COST_PER_M = 3.0
export const OUTPUT_COST_PER_M = 15.0
export const CACHE_READ_COST_PER_M = 0.3

// ---------------------------------------------------------------------------
// Пороги
// ---------------------------------------------------------------------------

/**
 * Минимальная уверенность модели, при которой результат принимается без
 * ручной проверки. Ниже — заявка отмечается requires_manual_review = true.
 */
export const CONFIDENCE_THRESHOLD = 0.5

// ---------------------------------------------------------------------------
// Retry и rate-limit
// ---------------------------------------------------------------------------

/** Задержки между попытками вызова API (мс): 5с → 30с */
export const RETRY_DELAYS_MS = [5_000, 30_000] as const

/** Ключ настройки в app_settings, хранящий дневной лимит вызовов */
export const DAILY_LIMIT_SETTING_KEY = 'ai_daily_limit'
/** Дефолтный лимит, если запись в app_settings отсутствует */
export const DEFAULT_DAILY_LIMIT = 200

/**
 * Расчёт стоимости одного вызова в USD.
 */
export function calculateCostUsd(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0
): number {
  return (
    (inputTokens * INPUT_COST_PER_M) / 1_000_000 +
    (outputTokens * OUTPUT_COST_PER_M) / 1_000_000 +
    (cacheReadTokens * CACHE_READ_COST_PER_M) / 1_000_000
  )
}
