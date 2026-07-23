import type { RequestCategory, RequestPriority } from '@/types'

/**
 * Входные данные для классификатора.
 *
 * 152-ФЗ: НЕ передавать в промпт ФИО владельца, телефон, telegram chat_id.
 * Только описание проблемы и обезличенный адрес квартиры.
 */
export interface ClassificationInput {
  /**
   * null — для предварительной проверки релевантности текста ДО создания
   * строки в requests (заявки ещё не существует, писать в лог не к чему
   * привязать; ai_classification_log.request_id допускает NULL).
   */
  requestId: string | null
  description: string
  complexName: string
  building: string
  apartmentNumber: string
  /** Base64-encoded изображения (без data: префикса) */
  photoBase64?: string[]
}

/**
 * Структурированный результат классификации, полученный от Claude.
 */
export interface ClassificationResult {
  /**
   * false — текст не описывает бытовую проблему/дефект в квартире (болтовня,
   * приветствие, вопрос не по теме и т.п.). В этом случае category/priority —
   * заполнители и не должны использоваться для создания или маршрутизации заявки.
   */
  is_request: boolean
  category: RequestCategory
  priority: RequestPriority
  /** Уверенность модели в диапазоне 0..1 */
  confidence: number
  /** Краткое объяснение причин выбора (русский язык) */
  reasoning: string
}

/**
 * Дискриминированное объединение результата вызова классификатора.
 *
 * При любом сбое (таймаут, невалидный JSON, ошибка API, превышение лимита)
 * возвращается success: false — ошибки не выбрасываются наверх (graceful degradation).
 */
export type ClassificationOutput =
  | {
      success: true
      result: ClassificationResult
    }
  | {
      success: false
      error: string
      requiresManualReview: true
    }
