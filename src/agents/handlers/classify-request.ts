import Anthropic from '@anthropic-ai/sdk'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database.types'
import {
  CLASSIFIER_CONFIG,
  RETRY_DELAYS_MS,
  DAILY_LIMIT_SETTING_KEY,
  DEFAULT_DAILY_LIMIT,
  calculateCostUsd,
} from '../config/classifier'
import {
  CLASSIFIER_SYSTEM_PROMPT,
  buildUserPrompt,
} from '../config/prompts'
import { parseClassificationResponse } from '../tools/category-validator'
import type {
  ClassificationInput,
  ClassificationOutput,
  ClassificationResult,
} from '../types'

/**
 * Один Anthropic-клиент на серверный инстанс. API-ключ читается из process.env
 * лениво — клиент не создаётся до первого вызова, чтобы избежать падения
 * на этапе билда.
 */
let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }
  _anthropic = new Anthropic({ apiKey })
  return _anthropic
}

/**
 * Поддерживаемые MIME-типы изображений Anthropic Messages API.
 */
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

/**
 * Определение MIME-типа по сигнатуре base64-картинки. Если не определилось —
 * fallback на image/jpeg (Telegram отдаёт JPEG в подавляющем большинстве случаев).
 */
function detectImageMediaType(base64: string): ImageMediaType {
  // PNG: iVBORw0KGgo
  if (base64.startsWith('iVBOR')) return 'image/png'
  // GIF: R0lGOD
  if (base64.startsWith('R0lGOD')) return 'image/gif'
  // WebP: UklGR ... WEBP
  if (base64.startsWith('UklGR')) return 'image/webp'
  // JPEG: /9j/
  return 'image/jpeg'
}

/**
 * Классификация заявки с retry и graceful degradation.
 *
 * Поток:
 *   1. Проверить дневной лимит из app_settings.ai_daily_limit (default 200).
 *   2. Вызвать Claude (claude-sonnet-4-5) с prompt caching на системном промпте.
 *   3. Распарсить и валидировать JSON.
 *   4. Логировать каждый вызов (успешный или нет) в ai_classification_log.
 *   5. На ошибки (таймаут, невалидный JSON, 5xx) — retry: 5с → 30с.
 *   6. После исчерпания попыток — { success: false, requiresManualReview: true }.
 *
 * Никогда не выбрасывает наверх — это часть контракта graceful degradation.
 */
// ---------------------------------------------------------------------------
// Keyword-based fallback classifier (no API key needed)
// TODO: удалить этот блок когда будет настоящий ANTHROPIC_API_KEY
// ---------------------------------------------------------------------------

type KeywordRule = { patterns: RegExp; category: ClassificationResult['category'] }

const KEYWORD_RULES: KeywordRule[] = [
  { patterns: /кран|вода|течёт|течет|протечк|сантехник|труб|унитаз|ванн|душ|водопровод/i, category: 'plumbing' },
  { patterns: /розетк|провод|свет|лампоч|щиток|автомат|электр|выключател|обесточ/i, category: 'electrical' },
  { patterns: /батаре|радиатор|тепло|отоплен|холодно|вентил|кондиц|hvac/i, category: 'hvac' },
  { patterns: /трещин|стен|потолок|пол|плит|фундамент|несущ|конструк/i, category: 'structural' },
  { patterns: /окн|дверь|дверей|петл|замок|ручк|стекло|раму|раме|балкон/i, category: 'windows_doors' },
  { patterns: /штукатурк|краск|обои|плитк|отделк|ламинат|паркет|полов/i, category: 'finishing' },
  { patterns: /плит|холодильник|стиральн|посудомо|духовк|бытов|техник|прибор/i, category: 'appliances' },
]

function keywordClassify(description: string): ClassificationResult['category'] {
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.test(description)) return rule.category
  }
  return 'other'
}

function isApiKeyPlaceholder(): boolean {
  // Явный выключатель — USE_MOCK_CLASSIFIER=true в Vercel env vars
  if (process.env.USE_MOCK_CLASSIFIER === 'true') return true
  // Запасная проверка: ключ не задан
  if (!process.env.ANTHROPIC_API_KEY) return true
  return false
}

export async function classifyRequest(
  input: ClassificationInput
): Promise<ClassificationOutput> {
  // -------------------------------------------------------------------------
  // 0. Обход AI: если ключ отсутствует или заглушка — keyword-классификация
  // TODO: убрать этот блок после настройки настоящего ANTHROPIC_API_KEY
  // -------------------------------------------------------------------------
  if (isApiKeyPlaceholder()) {
    const category = keywordClassify(input.description)
    const result: ClassificationResult = {
      category,
      priority: 'normal',
      confidence: 0.9,
      reasoning: `[MOCK] Keyword-based fallback, no valid ANTHROPIC_API_KEY. Matched: ${category}`,
    }
    console.log('[classify-request] MOCK mode — skipping Claude, category=', category)
    return { success: true, result }
  }

  const supabase = createServiceRoleClient()

  // -------------------------------------------------------------------------
  // 1. Проверка дневного лимита
  // -------------------------------------------------------------------------
  try {
    const limit = await getDailyLimit(supabase)
    const todayCount = await getTodayCallCount(supabase)
    if (todayCount >= limit) {
      const errorMsg = `Daily AI limit exceeded: ${todayCount}/${limit}`
      await logClassification(supabase, {
        request_id: input.requestId,
        model: CLASSIFIER_CONFIG.model,
        error: errorMsg,
        latency_ms: 0,
      })
      return {
        success: false,
        error: errorMsg,
        requiresManualReview: true,
      }
    }
  } catch (err) {
    // Если не удалось проверить лимит — это инфраструктурная проблема,
    // безопаснее отправить на ручную проверку, чем сжигать бюджет.
    const message =
      err instanceof Error ? err.message : String(err)
    console.error('[classify-request] Failed to check daily limit:', err)
    return {
      success: false,
      error: `Failed to check daily limit: ${message}`,
      requiresManualReview: true,
    }
  }

  // -------------------------------------------------------------------------
  // 2. Вызов Claude с retry
  // -------------------------------------------------------------------------
  const totalAttempts = RETRY_DELAYS_MS.length + 1
  let lastError: string | null = null

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1]
      await sleep(delay)
    }

    const startedAt = Date.now()
    try {
      const result = await invokeClaude(input)
      const latencyMs = Date.now() - startedAt

      await logClassification(supabase, {
        request_id: input.requestId,
        model: CLASSIFIER_CONFIG.model,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        cost_usd: result.cost_usd,
        confidence: result.classification.confidence,
        category_result: result.classification.category,
        priority_result: result.classification.priority,
        latency_ms: latencyMs,
      })

      return { success: true, result: result.classification }
    } catch (err) {
      const latencyMs = Date.now() - startedAt
      lastError = err instanceof Error ? err.message : String(err)
      console.error(
        `[classify-request] Attempt ${attempt + 1}/${totalAttempts} failed:`,
        lastError
      )

      // Логируем только последнюю провалившуюся попытку, чтобы не раздувать таблицу
      if (attempt === totalAttempts - 1) {
        await logClassification(supabase, {
          request_id: input.requestId,
          model: CLASSIFIER_CONFIG.model,
          error: lastError,
          latency_ms: latencyMs,
        })
      }
    }
  }

  return {
    success: false,
    error: lastError ?? 'Unknown classifier error',
    requiresManualReview: true,
  }
}

// ---------------------------------------------------------------------------
// Внутренние помощники
// ---------------------------------------------------------------------------

interface InvokeResult {
  classification: ClassificationResult
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
  }
  cost_usd: number
}

async function invokeClaude(input: ClassificationInput): Promise<InvokeResult> {
  const anthropic = getAnthropic()

  // Сборка контента: текст + опционально изображения
  const userContent: Array<Anthropic.Messages.TextBlockParam | Anthropic.Messages.ImageBlockParam> = [
    { type: 'text', text: buildUserPrompt(input) },
  ]

  if (input.photoBase64 && input.photoBase64.length > 0) {
    for (const data of input.photoBase64) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: detectImageMediaType(data),
          data,
        },
      })
    }
  }

  // Используем beta.promptCaching для поддержки cache_control на системных блоках.
  // Это экономит до 90% токенов на повторных вызовах за счёт кэширования системного промпта.
  const response = await anthropic.beta.promptCaching.messages.create({
    model: CLASSIFIER_CONFIG.model,
    max_tokens: CLASSIFIER_CONFIG.max_tokens,
    temperature: CLASSIFIER_CONFIG.temperature,
    system: [
      {
        type: 'text',
        text: CLASSIFIER_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  })

  // Извлекаем текстовый блок ответа
  const textBlock = response.content.find(
    (c): c is Anthropic.TextBlock => c.type === 'text'
  )
  if (!textBlock) {
    throw new Error('Claude response contains no text block')
  }

  const classification = parseClassificationResponse(textBlock.text)

  const usage = response.usage
  const cacheRead = (usage as { cache_read_input_tokens?: number | null })
    .cache_read_input_tokens ?? 0
  const cacheCreation =
    (usage as { cache_creation_input_tokens?: number | null })
      .cache_creation_input_tokens ?? 0
  const cost_usd = calculateCostUsd(
    usage.input_tokens,
    usage.output_tokens,
    cacheRead
  )

  return {
    classification,
    usage: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_read_input_tokens: cacheRead,
      cache_creation_input_tokens: cacheCreation,
    },
    cost_usd,
  }
}

type SupabaseAdmin = ReturnType<typeof createServiceRoleClient>

async function getDailyLimit(supabase: SupabaseAdmin): Promise<number> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', DAILY_LIMIT_SETTING_KEY)
    .maybeSingle() as {
      data: { value: string } | null
      error: PostgrestError | null
    }

  if (error) {
    console.error('[classify-request] app_settings read error:', error)
    return DEFAULT_DAILY_LIMIT
  }
  if (!data) return DEFAULT_DAILY_LIMIT

  const parsed = Number.parseInt(data.value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAILY_LIMIT
  return parsed
}

async function getTodayCallCount(supabase: SupabaseAdmin): Promise<number> {
  // День в UTC. Cutoff в 18:00 МСК — это про дедлайны заявок, не про лимит API.
  const startOfDayUtc = new Date()
  startOfDayUtc.setUTCHours(0, 0, 0, 0)

  const { count, error } = await supabase
    .from('ai_classification_log')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfDayUtc.toISOString())

  if (error) {
    console.error('[classify-request] daily count error:', error)
    return 0
  }
  return count ?? 0
}

interface LogPayload {
  request_id: string | null
  model: string
  input_tokens?: number
  output_tokens?: number
  cost_usd?: number
  confidence?: number
  category_result?: string
  priority_result?: string
  latency_ms: number
  error?: string
}

type AiLogInsert = Database['public']['Tables']['ai_classification_log']['Insert']

async function logClassification(
  supabase: SupabaseAdmin,
  payload: LogPayload
): Promise<void> {
  const record: AiLogInsert = {
    request_id: payload.request_id,
    model: payload.model,
    input_tokens: payload.input_tokens ?? null,
    output_tokens: payload.output_tokens ?? null,
    cost_usd: payload.cost_usd ?? null,
    confidence: payload.confidence ?? null,
    category_result: payload.category_result ?? null,
    priority_result: payload.priority_result ?? null,
    latency_ms: payload.latency_ms,
    error: payload.error ?? null,
  }
  const { error } = await supabase
    .from('ai_classification_log')
    // satisfies гарантирует типовую корректность; каст нужен из-за ограничения Supabase inference
    .insert((record satisfies AiLogInsert) as unknown as never)
  if (error) {
    // Логирование не должно ронять основной поток — только console.error
    console.error('[classify-request] Failed to write ai_classification_log:', error)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
