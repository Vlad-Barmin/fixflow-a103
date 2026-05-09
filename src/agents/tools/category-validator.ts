import { z } from 'zod'
import type { RequestCategory, RequestPriority } from '@/types'

/**
 * Список категорий и приоритетов как const-кортежи — для z.enum().
 * Должны точно совпадать с union-типами RequestCategory / RequestPriority.
 */
const CATEGORIES = [
  'electrical',
  'plumbing',
  'hvac',
  'structural',
  'windows_doors',
  'finishing',
  'appliances',
  'other',
] as const satisfies readonly RequestCategory[]

const PRIORITIES = [
  'low',
  'normal',
  'high',
  'urgent',
] as const satisfies readonly RequestPriority[]

/**
 * Zod-схема ответа классификатора. Любое отклонение → ZodError.
 */
export const ClassificationResponseSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(1000),
})

export type ClassificationResponse = z.infer<typeof ClassificationResponseSchema>

/**
 * Парсит сырой текстовый ответ Claude и валидирует его через Zod.
 *
 * Алгоритм:
 *   1. Триммим, убираем markdown code fences (```json … ``` и ``` … ```), если модель их добавила.
 *   2. Пытаемся распарсить как JSON напрямую.
 *   3. Если не вышло — пытаемся вырезать первый JSON-объект из текста по фигурным скобкам.
 *   4. Валидируем полученный объект Zod-схемой.
 *
 * При любой неудаче бросает Error / ZodError — обработчик выше переведёт это в
 * graceful fallback (requires_manual_review).
 */
export function parseClassificationResponse(raw: string): ClassificationResponse {
  const cleaned = stripCodeFences(raw.trim())

  // Попытка 1: чистый JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Попытка 2: извлечь первый JSON-объект по скобкам
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) {
      throw new Error(
        `Classifier response is not valid JSON: ${truncate(cleaned, 200)}`
      )
    }
    try {
      parsed = JSON.parse(match[0])
    } catch (err) {
      throw new Error(
        `Failed to parse JSON substring from classifier response: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  }

  // Валидация (бросает ZodError при несоответствии)
  return ClassificationResponseSchema.parse(parsed)
}

// ---------------------------------------------------------------------------
// Внутренние утилиты
// ---------------------------------------------------------------------------

function stripCodeFences(text: string): string {
  // ```json ... ``` или ``` ... ```
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenceMatch) return fenceMatch[1].trim()
  return text
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`
}
