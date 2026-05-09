import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth, isAuthError } from '@/lib/auth'
import ExcelJS from 'exceljs'
import type { Database } from '@/types/database.types'

type RequestRow = Database['public']['Tables']['requests']['Row']
type ContractorRow = Database['public']['Tables']['contractors']['Row']

const QuerySchema = z.object({
  date_from: z.string().datetime({ message: 'date_from must be ISO datetime' }),
  date_to: z.string().datetime({ message: 'date_to must be ISO datetime' }),
})

interface RequestWithRelations {
  id: string
  description: string
  status: RequestRow['status']
  priority: RequestRow['priority']
  category: RequestRow['category']
  deadline: string | null
  created_at: string
  updated_at: string
  contractor_id: string | null
  apartments: {
    building: string
    number: string
    residential_complexes: { name: string } | null
  } | null
  contractors: { name: string } | null
}

/**
 * GET /api/reports/xlsx
 *
 * Экспорт отчёта в Excel за период.
 * Лист 1: "Заявки" — все заявки за период.
 * Лист 2: "Сводка" — статистика по подрядчикам.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const params = Object.fromEntries(req.nextUrl.searchParams.entries())
  const queryParsed = QuerySchema.safeParse(params)

  if (!queryParsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Invalid parameters. date_from and date_to are required ISO datetime strings.',
          details: queryParsed.error.flatten(),
        },
      },
      { status: 422 }
    )
  }

  const { date_from, date_to } = queryParsed.data
  const supabase = await createServerClient()

  // Загрузить заявки за период
  const { data: requests, error: requestsErr } = (await supabase
    .from('requests')
    .select(
      'id, description, status, priority, category, deadline, created_at, updated_at, contractor_id, apartments(building, number, residential_complexes(name)), contractors(name)'
    )
    .gte('created_at', date_from)
    .lte('created_at', date_to)
    .order('created_at', { ascending: false })) as {
    data: RequestWithRelations[] | null
    error: PostgrestError | null
  }

  if (requestsErr) {
    console.error('[GET /api/reports/xlsx] requests error:', requestsErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  // Загрузить подрядчиков для сводки
  const { data: contractors, error: contractorsErr } = (await supabase
    .from('contractors')
    .select('id, name')
    .eq('is_active', true)
    .order('name', { ascending: true })) as {
    data: Pick<ContractorRow, 'id' | 'name'>[] | null
    error: PostgrestError | null
  }

  if (contractorsErr) {
    console.error('[GET /api/reports/xlsx] contractors error:', contractorsErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  const allRequests = requests ?? []
  const now = new Date()

  // ---------------------------------------------------------------------------
  // Создать Excel-книгу
  // ---------------------------------------------------------------------------

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'FixFlow A103'
  workbook.created = now

  // ---------------------------------------------------------------------------
  // Лист 1: "Заявки"
  // ---------------------------------------------------------------------------

  const requestsSheet = workbook.addWorksheet('Заявки')

  requestsSheet.columns = [
    { header: 'ID', key: 'id', width: 38 },
    { header: 'ЖК', key: 'complex', width: 20 },
    { header: 'Корпус', key: 'building', width: 10 },
    { header: 'Квартира', key: 'number', width: 10 },
    { header: 'Описание', key: 'description', width: 45 },
    { header: 'Категория', key: 'category', width: 18 },
    { header: 'Приоритет', key: 'priority', width: 12 },
    { header: 'Статус', key: 'status', width: 22 },
    { header: 'Подрядчик', key: 'contractor', width: 25 },
    { header: 'Дедлайн', key: 'deadline', width: 16 },
    { header: 'Создана', key: 'created_at', width: 16 },
  ]

  // Стиль заголовка
  const headerRow = requestsSheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  }

  for (const r of allRequests) {
    const apt = r.apartments
    requestsSheet.addRow({
      id: r.id,
      complex: apt?.residential_complexes?.name ?? '',
      building: apt?.building ?? '',
      number: apt?.number ?? '',
      description: r.description,
      category: r.category ?? '',
      priority: r.priority,
      status: r.status,
      contractor: r.contractors?.name ?? '',
      deadline: r.deadline
        ? new Date(r.deadline).toLocaleDateString('ru-RU')
        : '',
      created_at: new Date(r.created_at).toLocaleDateString('ru-RU'),
    })
  }

  // ---------------------------------------------------------------------------
  // Лист 2: "Сводка" по подрядчикам
  // ---------------------------------------------------------------------------

  const summarySheet = workbook.addWorksheet('Сводка')

  summarySheet.columns = [
    { header: 'Подрядчик', key: 'name', width: 28 },
    { header: 'Всего заявок', key: 'total', width: 14 },
    { header: 'Выполнено', key: 'completed', width: 14 },
    { header: 'В работе', key: 'in_progress', width: 14 },
    { header: 'Просрочено', key: 'overdue', width: 14 },
    { header: 'Ср. дней выполнения', key: 'avg_days', width: 22 },
  ]

  const summaryHeader = summarySheet.getRow(1)
  summaryHeader.font = { bold: true }
  summaryHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  }

  for (const contractor of contractors ?? []) {
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

    const completedReqs = contractorRequests.filter(
      (r) => r.status === 'completed'
    )
    let avgDays: number | string = ''
    if (completedReqs.length > 0) {
      const totalMs = completedReqs.reduce((sum, r) => {
        return (
          sum +
          (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime())
        )
      }, 0)
      avgDays =
        Math.round(
          (totalMs / completedReqs.length / (1000 * 60 * 60 * 24)) * 10
        ) / 10
    }

    summarySheet.addRow({
      name: contractor.name,
      total,
      completed,
      in_progress: inProgress,
      overdue,
      avg_days: avgDays,
    })
  }

  // ---------------------------------------------------------------------------
  // Сформировать буфер и вернуть ответ
  // ---------------------------------------------------------------------------

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `fixflow_report_${now.toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

export const dynamic = 'force-dynamic'
