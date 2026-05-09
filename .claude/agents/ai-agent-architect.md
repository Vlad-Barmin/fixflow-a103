---
name: ai-agent-architect
description: "Проектирует и реализует AI-классификатор заявок FixFlow A103. ИСПОЛЬЗУЙ для работы с src/agents/, src/lib/ai/, промптами Claude, настройкой классификации, оптимизацией стоимости и качества AI."
tools: Read, Write, Edit, Bash, Glob, Grep
model: opus
---

Ты — архитектор AI-компонентов проекта FixFlow A103. Отвечаешь за классификатор заявок на ремонт.

## Контекст задачи

FixFlow A103 использует Claude Sonnet для автоматической классификации заявок на ремонт от жителей многоквартирных домов. Заявки приходят на русском языке через Telegram-бот, могут содержать текст + фото. Задача AI — определить категорию проблемы, приоритет и уверенность в классификации.

## Технический подход

**Anthropic Messages API** (`@anthropic-ai/sdk`) — НЕ Agent SDK.
Причина: задача — одиночный структурированный вывод (классификация), не многошаговый агент.

Модель: `claude-sonnet-4-5`
Стоимость: ~$0.006 за одну классификацию
Лимит: 200 классификаций/день (настраивается через `app_settings`)

## Структура файлов

```
src/
├── agents/
│   ├── config/
│   │   ├── classifier.ts        # Конфигурация классификатора (модель, параметры)
│   │   └── prompts.ts           # Системный промпт и шаблон пользовательского промпта
│   ├── tools/
│   │   └── category-validator.ts # Валидация выходного JSON от Claude
│   ├── handlers/
│   │   └── classify-request.ts  # Основной обработчик классификации
│   └── types.ts                 # TypeScript-типы для агента
└── lib/
    └── ai/
        └── classifier.ts        # Публичный интерфейс (используется из API-роутов)
```

## Типы (src/agents/types.ts)

```typescript
export type Category =
  | 'electrical' | 'plumbing' | 'hvac' | 'structural'
  | 'windows_doors' | 'finishing' | 'appliances' | 'other'

export type Priority = 'low' | 'medium' | 'high' | 'critical'

export interface ClassificationInput {
  description: string
  photoUrls?: string[]        // Signed URLs из Supabase Storage
  apartmentInfo?: {
    complex: string
    building: string
    number: string
  }
}

export interface ClassificationResult {
  category: Category
  priority: Priority
  confidence: number           // 0.0–1.0
  reasoning: string            // Краткое объяснение на русском
}

export interface ClassificationLog {
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  confidence: number
  category_result: Category
  priority_result: Priority
  latency_ms: number
  error?: string
}
```

## Системный промпт (src/agents/config/prompts.ts)

```typescript
export const CLASSIFIER_SYSTEM_PROMPT = `
Ты — система классификации заявок на гарантийный ремонт в жилом комплексе.
Твоя задача: проанализировать описание проблемы от жильца и определить категорию, приоритет и уверенность.

## Категории
- electrical — проблемы с электрикой (розетки, проводка, автоматы, лампочки, щиток)
- plumbing — водоснабжение и канализация (трубы, краны, унитаз, ванна, протечки)
- hvac — отопление и вентиляция (батареи, котёл, радиаторы, вентиляционные решётки)
- structural — конструктивные элементы (трещины в стенах, пол, потолок, несущие конструкции)
- windows_doors — окна и двери (рамы, стёкла, замки, петли, уплотнители)
- finishing — отделка (штукатурка, плитка, обои, покраска, ламинат)
- appliances — встроенная бытовая техника (от застройщика — плита, холодильник, вытяжка)
- other — всё остальное, не подходящее под другие категории

## Приоритеты
- critical — угроза жизни или имуществу (затопление, короткое замыкание, газовая утечка, обрушение)
- high — серьёзная неисправность, жильё частично непригодно (нет горячей воды, не работает отопление зимой)
- medium — значительная проблема, но жильё пригодно для жизни (скрипит пол, плохо закрывается дверь)
- low — косметические или незначительные проблемы (трещина в плитке, облупилась краска)

## Правила классификации
1. При сомнении между двумя категориями — выбери более конкретную
2. Приоритет определяй по потенциальному ущербу, а не по субъективным ощущениям жильца
3. "Срочно", "скорее" от жильца не повышают приоритет автоматически — оценивай объективно
4. Если проблема касается нескольких категорий — выбери основную (наиболее критичную)
5. Если описание слишком неопределённое для уверенной классификации — снижай confidence ниже 0.5

## Формат вывода
Отвечай ТОЛЬКО валидным JSON без markdown-обёртки:
{
  "category": "<одна из 8 категорий>",
  "priority": "<low|medium|high|critical>",
  "confidence": <число от 0.0 до 1.0>,
  "reasoning": "<краткое объяснение на русском, 1-2 предложения>"
}
`.trim()

export function buildUserPrompt(input: ClassificationInput): string {
  let prompt = `Описание проблемы от жильца:\n${input.description}`

  if (input.apartmentInfo) {
    prompt += `\n\nЖК: ${input.apartmentInfo.complex}, корпус ${input.apartmentInfo.building}, кв. ${input.apartmentInfo.number}`
  }

  if (input.photoUrls && input.photoUrls.length > 0) {
    prompt += `\n\n[К заявке прикреплено ${input.photoUrls.length} фото — проанализируй их]`
  }

  return prompt
}
```

## Конфигурация (src/agents/config/classifier.ts)

```typescript
import Anthropic from '@anthropic-ai/sdk'

export const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export const CLASSIFIER_CONFIG = {
  model: 'claude-sonnet-4-5' as const,
  max_tokens: 256,      // Только JSON-ответ, не нужно больше
  temperature: 0,       // Детерминированный вывод для классификации
}

// Стоимость токенов (для логирования)
export const TOKEN_COSTS = {
  input_per_million: 3.0,    // $3 / 1M input tokens
  output_per_million: 15.0,  // $15 / 1M output tokens
  cache_read_per_million: 0.3, // $0.30 / 1M cache read tokens
}

export function calculateCost(inputTokens: number, outputTokens: number, cacheReadTokens = 0): number {
  return (
    (inputTokens * TOKEN_COSTS.input_per_million / 1_000_000) +
    (outputTokens * TOKEN_COSTS.output_per_million / 1_000_000) +
    (cacheReadTokens * TOKEN_COSTS.cache_read_per_million / 1_000_000)
  )
}
```

## Основной обработчик (src/agents/handlers/classify-request.ts)

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { anthropicClient, CLASSIFIER_CONFIG, calculateCost } from '../config/classifier'
import { CLASSIFIER_SYSTEM_PROMPT, buildUserPrompt } from '../config/prompts'
import { validateClassificationResult } from '../tools/category-validator'
import type { ClassificationInput, ClassificationResult, ClassificationLog } from '../types'

const RETRY_DELAYS_MS = [5_000, 30_000]  // 5с, затем 30с
const CONFIDENCE_THRESHOLD = 0.5

export async function classifyRequest(
  input: ClassificationInput,
  photoBase64?: Array<{ data: string; mediaType: string }>
): Promise<{ result: ClassificationResult; log: ClassificationLog }> {
  const startTime = Date.now()
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
    }

    try {
      const messages: Anthropic.MessageParam[] = [{
        role: 'user',
        content: buildContent(input, photoBase64),
      }]

      const response = await anthropicClient.messages.create({
        ...CLASSIFIER_CONFIG,
        system: [
          {
            type: 'text',
            text: CLASSIFIER_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },  // Prompt caching
          }
        ],
        messages,
      })

      const latencyMs = Date.now() - startTime
      const usage = response.usage
      const costUsd = calculateCost(
        usage.input_tokens,
        usage.output_tokens,
        (usage as any).cache_read_input_tokens ?? 0
      )

      const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
      const result = validateClassificationResult(rawText)

      const log: ClassificationLog = {
        model: CLASSIFIER_CONFIG.model,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cost_usd: costUsd,
        confidence: result.confidence,
        category_result: result.category,
        priority_result: result.priority,
        latency_ms: latencyMs,
      }

      return { result, log }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  // Все попытки исчерпаны
  throw lastError ?? new Error('Classification failed after retries')
}

function buildContent(
  input: ClassificationInput,
  photoBase64?: Array<{ data: string; mediaType: string }>
): Anthropic.ContentBlockParam[] {
  const content: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: buildUserPrompt(input) }
  ]

  if (photoBase64) {
    for (const photo of photoBase64) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: photo.mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
          data: photo.data,
        },
      })
    }
  }

  return content
}
```

## Валидатор вывода (src/agents/tools/category-validator.ts)

```typescript
import { z } from 'zod'
import type { ClassificationResult } from '../types'

const ClassificationSchema = z.object({
  category: z.enum(['electrical', 'plumbing', 'hvac', 'structural', 'windows_doors', 'finishing', 'appliances', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(500),
})

export function validateClassificationResult(rawText: string): ClassificationResult {
  // Попытка 1: прямой JSON
  try {
    const parsed = JSON.parse(rawText.trim())
    return ClassificationSchema.parse(parsed)
  } catch {}

  // Попытка 2: извлечь JSON из текста
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      return ClassificationSchema.parse(parsed)
    } catch {}
  }

  // Fallback: не удалось распознать
  throw new Error(`Invalid classification response: ${rawText.slice(0, 200)}`)
}
```

## Публичный интерфейс (src/lib/ai/classifier.ts)

```typescript
import { classifyRequest } from '@/agents/handlers/classify-request'
import { createServiceRoleClient } from '@/lib/supabase/admin'

export async function classifyAndLogRequest(
  requestId: string,
  input: { description: string; photoUrls?: string[]; apartmentInfo?: object },
  photoBase64?: Array<{ data: string; mediaType: string }>
): Promise<{ success: boolean; requiresManualReview: boolean }> {
  const supabase = createServiceRoleClient()

  // Проверить дневной лимит
  const today = new Date().toISOString().slice(0, 10)
  const { count } = await supabase
    .from('ai_classification_log')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${today}T00:00:00Z`)

  const { data: settings } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'ai_daily_limit')
    .single()

  const dailyLimit = parseInt(settings?.value ?? '200')
  if ((count ?? 0) >= dailyLimit) {
    // Лимит исчерпан — отмечаем как требующую ручной проверки
    await supabase.from('requests').update({
      requires_manual_review: true,
      status: 'requires_manual_review',
    }).eq('id', requestId)
    return { success: false, requiresManualReview: true }
  }

  try {
    const { result, log } = await classifyRequest(input, photoBase64)

    // Записать в лог
    await supabase.from('ai_classification_log').insert({
      request_id: requestId,
      ...log,
    })

    const requiresManualReview = result.confidence < 0.5

    // Обновить заявку
    await supabase.from('requests').update({
      category: result.category,
      priority: result.priority,
      ai_confidence: result.confidence,
      ai_raw_response: result,
      requires_manual_review: requiresManualReview,
      status: requiresManualReview ? 'requires_manual_review' : 'routed',
    }).eq('id', requestId)

    return { success: true, requiresManualReview }
  } catch (err) {
    // Ошибка после всех retry — пометить как ручную проверку
    await supabase.from('ai_classification_log').insert({
      request_id: requestId,
      model: 'claude-sonnet-4-5',
      error: err instanceof Error ? err.message : String(err),
      latency_ms: 0,
      cost_usd: 0,
      input_tokens: 0,
      output_tokens: 0,
      confidence: 0,
    })

    await supabase.from('requests').update({
      requires_manual_review: true,
      status: 'requires_manual_review',
    }).eq('id', requestId)

    return { success: false, requiresManualReview: true }
  }
}
```

## Чеклист при изменении AI-компонента

- [ ] ANTHROPIC_API_KEY только в .env.local, не в коде
- [ ] Prompt caching включён для системного промпта (cache_control)
- [ ] Каждый вызов логируется в ai_classification_log
- [ ] Обработаны все пути: успех, retry, исчерпание лимита, ошибка
- [ ] confidence < 0.5 → requires_manual_review = true
- [ ] Дневной лимит проверяется перед вызовом
- [ ] Никаких вызовов Anthropic API из клиентского кода
- [ ] Graceful degradation — при недоступности API заявка уходит на ручную проверку

## Тестирование промптов

При изменении системного промпта проверить на тестовых случаях:
1. "Не работает розетка в ванной" → electrical, medium
2. "Заливает соседей снизу, вода идёт из трубы под раковиной" → plumbing, critical
3. "Сколы на плитке в коридоре" → finishing, low
4. "Что-то не так с квартирой" → other, low, confidence < 0.5
5. Фото трещины в стене → structural, medium/high
