/**
 * Публичный интерфейс AI-классификатора FixFlow A103.
 *
 * Импортировать ТОЛЬКО из server-side кода (API routes, webhook handlers,
 * cron jobs). Никогда не использовать в client components — содержит
 * обращения к Anthropic API и Supabase service role.
 */
export { classifyRequest } from '@/agents/handlers/classify-request'
export type {
  ClassificationInput,
  ClassificationOutput,
  ClassificationResult,
} from '@/agents/types'
export { CONFIDENCE_THRESHOLD } from '@/agents/config/classifier'

// ---------------------------------------------------------------------------
// Расчёт дедлайна заявки
// ---------------------------------------------------------------------------

/**
 * Час отсечения по МСК — заявки, созданные после этого времени, считаются
 * пришедшими «на следующий рабочий день» при расчёте дедлайна.
 */
const CUTOFF_HOUR_MSK = 18

/** Сколько рабочих дней даётся подрядчику на выполнение */
const BUSINESS_DAYS_TO_DEADLINE = 5

/** Смещение МСК от UTC в часах (без учёта DST — Россия не переходит) */
const MSK_OFFSET_HOURS = 3

/**
 * Расчёт дедлайна: 5 рабочих дней от `from`, с отсечением в 18:00 МСК.
 *
 * Логика:
 *   1. Стартовая дата нормализуется по МСК: если час ≥ 18, то старт переносится
 *      на следующий день (заявка «упала после конца дня»).
 *   2. Если стартовая дата приходится на выходные — смещаем на ближайший
 *      будний день (понедельник).
 *   3. Прибавляем 5 рабочих дней (пн-пт), пропуская субботы/воскресенья.
 *   4. MVP: без учёта государственных праздников РФ.
 *
 * Возвращается дата в 18:00 МСК того дня (= 15:00 UTC).
 */
export function calculateDeadline(from: Date = new Date()): Date {
  // Преобразуем `from` в МСК-«часы и день», работая с UTC-эпохой
  const mskTime = new Date(from.getTime() + MSK_OFFSET_HOURS * 3_600_000)

  // Если уже после cutoff — стартуем со следующего дня
  if (mskTime.getUTCHours() >= CUTOFF_HOUR_MSK) {
    mskTime.setUTCDate(mskTime.getUTCDate() + 1)
  }

  // Сбрасываем время на 00:00 МСК «нормализованного» дня
  mskTime.setUTCHours(0, 0, 0, 0)

  // Если попали на выходной — двигаем на ближайший будний день
  while (isWeekend(mskTime.getUTCDay())) {
    mskTime.setUTCDate(mskTime.getUTCDate() + 1)
  }

  // Прибавляем рабочие дни
  let added = 0
  while (added < BUSINESS_DAYS_TO_DEADLINE) {
    mskTime.setUTCDate(mskTime.getUTCDate() + 1)
    if (!isWeekend(mskTime.getUTCDay())) {
      added++
    }
  }

  // Дедлайн = 18:00 МСК итогового дня = (18 - 3) UTC = 15:00 UTC
  mskTime.setUTCHours(CUTOFF_HOUR_MSK - MSK_OFFSET_HOURS, 0, 0, 0)
  return mskTime
}

/** 0 = воскресенье, 6 = суббота (по getUTCDay) */
function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6
}
