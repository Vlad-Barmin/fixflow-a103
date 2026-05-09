import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth, isAuthError } from '@/lib/auth'
import type { Database } from '@/types/database.types'

type ContractorRow = Database['public']['Tables']['contractors']['Row']
type RequestRow = Database['public']['Tables']['requests']['Row']

const ReportQuerySchema = z.object({
  date_from: z.string().datetime({ message: 'date_from must be ISO datetime' }),
  date_to: z.string().datetime({ message: 'date_to must be ISO datetime' }),
})

interface ContractorPerformance {
  contractor_id: string
  name: string
  total: number
  completed: number
  in_progress: number
  overdue: number
  avg_completion_days: number | null
}

/**
 * GET /api/reports/contractor-performance
 *
 * Статистика по подрядчикам за период.
 * Параметры date_from и date_to обязательны (ISO datetime).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const params = Object.fromEntries(req.nextUrl.searchParams.entries())
  const queryParsed = ReportQuerySchema.safeParse(params)

  if (!queryParsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Invalid query parameters. date_from and date_to are required ISO datetime strings.',
          details: queryParsed.error.flatten(),
        },
      },
      { status: 422 }
    )
  }

  const { date_from, date_to } = queryParsed.data
  const supabase = await createServerClient()

  // Загрузить всех подрядчиков
  const { data: contractors, error: contractorsErr } = (await supabase
    .from('contractors')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true })) as {
    data: Pick<ContractorRow, 'id' | 'name'>[] | null
    error: PostgrestError | null
  }

  if (contractorsErr) {
    console.error(
      '[GET /reports/contractor-performance] contractors error:',
      contractorsErr
    )
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!contractors || contractors.length === 0) {
    return NextResponse.json({ data: [], date_from, date_to })
  }

  // Загрузить все заявки за период с подрядчиком
  const { data: requests, error: requestsErr } = (await supabase
    .from('requests')
    .select('id, contractor_id, status, deadline, created_at, updated_at')
    .not('contractor_id', 'is', null)
    .gte('created_at', date_from)
    .lte('created_at', date_to)) as {
    data: Pick<
      RequestRow,
      | 'id'
      | 'contractor_id'
      | 'status'
      | 'deadline'
      | 'created_at'
      | 'updated_at'
    >[] | null
    error: PostgrestError | null
  }

  if (requestsErr) {
    console.error(
      '[GET /reports/contractor-performance] requests error:',
      requestsErr
    )
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  const now = new Date()
  const allRequests = requests ?? []

  const performance: ContractorPerformance[] = contractors.map((contractor) => {
    const contractorRequests = allRequests.filter(
      (r) => r.contractor_id === contractor.id
    )

    const total = contractorRequests.length
    const completed = contractorRequests.filter(
      (r) => r.status === 'completed'
    ).length
    const inProgress = contractorRequests.filter(
      (r) => r.status === 'in_progress'
    ).length
    const overdue = contractorRequests.filter(
      (r) =>
        r.deadline !== null &&
        new Date(r.deadline) < now &&
        r.status !== 'completed'
    ).length

    // Среднее время выполнения для completed заявок
    const completedRequests = contractorRequests.filter(
      (r) => r.status === 'completed'
    )
    let avgCompletionDays: number | null = null
    if (completedRequests.length > 0) {
      const totalMs = completedRequests.reduce((sum, r) => {
        const created = new Date(r.created_at).getTime()
        const updated = new Date(r.updated_at).getTime()
        return sum + (updated - created)
      }, 0)
      avgCompletionDays =
        Math.round(
          (totalMs / completedRequests.length / (1000 * 60 * 60 * 24)) * 10
        ) / 10
    }

    return {
      contractor_id: contractor.id,
      name: contractor.name,
      total,
      completed,
      in_progress: inProgress,
      overdue,
      avg_completion_days: avgCompletionDays,
    }
  })

  return NextResponse.json({ data: performance, date_from, date_to })
}

export const dynamic = 'force-dynamic'
