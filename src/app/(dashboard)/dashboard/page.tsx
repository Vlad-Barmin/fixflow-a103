import { Suspense } from 'react'
import { createServerClient } from '@/lib/supabase/server'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { RequestsTable } from '@/components/dashboard/RequestsTable'
import { ClipboardList, Clock, AlertTriangle, CheckCircle } from 'lucide-react'

async function getKpiData() {
  const supabase = await createServerClient()

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [newToday, inWork, overdue, completedMonth] = await Promise.all([
    supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
      .gte('created_at', todayStart),
    supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .in('status', ['routed', 'accepted', 'in_progress']),
    supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .lt('deadline', now.toISOString())
      .not('status', 'eq', 'completed'),
    supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('updated_at', monthStart),
  ])

  return {
    newToday: newToday.count ?? 0,
    inWork: inWork.count ?? 0,
    overdue: overdue.count ?? 0,
    completedMonth: completedMonth.count ?? 0,
  }
}

async function getInitialRequests() {
  const supabase = await createServerClient()

  const { data } = await supabase
    .from('requests')
    .select(
      'id, description, status, priority, category, deadline, created_at, requires_manual_review, apartments(building, number, residential_complexes(name)), contractors(name)'
    )
    .order('created_at', { ascending: false })
    .limit(50)

  return data ?? []
}

async function getContractors() {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('contractors')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
  return data ?? []
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-2xl border border-zinc-100 bg-white p-6 animate-pulse">
          <div className="h-4 bg-zinc-200 rounded w-24 mb-3" />
          <div className="h-8 bg-zinc-200 rounded w-16" />
        </div>
      ))}
    </div>
  )
}

async function KpiSection() {
  const kpi = await getKpiData()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      <KpiCard
        title="Новые сегодня"
        value={kpi.newToday}
        description="Ожидают обработки"
        icon={<ClipboardList className="h-4 w-4" />}
      />
      <KpiCard
        title="В работе"
        value={kpi.inWork}
        description="Направлены / приняты / в процессе"
        icon={<Clock className="h-4 w-4" />}
        variant="warning"
      />
      <KpiCard
        title="Просроченные"
        value={kpi.overdue}
        description="Дедлайн прошёл"
        icon={<AlertTriangle className="h-4 w-4" />}
        variant={kpi.overdue > 0 ? 'danger' : 'default'}
      />
      <KpiCard
        title="Выполнено в этом месяце"
        value={kpi.completedMonth}
        description="Закрытые заявки"
        icon={<CheckCircle className="h-4 w-4" />}
        variant="success"
      />
    </div>
  )
}

async function TableSection() {
  const [requests, contractors] = await Promise.all([
    getInitialRequests(),
    getContractors(),
  ])

  // Cast to the shape expected by RequestsTable
  const tableRequests = requests as Parameters<typeof RequestsTable>[0]['initialRequests']
  const tableContractors = contractors as Parameters<typeof RequestsTable>[0]['contractors']

  return (
    <RequestsTable
      initialRequests={tableRequests}
      contractors={tableContractors}
    />
  )
}

export default function DashboardPage() {
  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">Заявки</h1>
        <p className="text-sm text-zinc-400">{today}</p>
      </div>

      <Suspense fallback={<KpiSkeleton />}>
        <KpiSection />
      </Suspense>

      <Suspense fallback={
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 animate-pulse">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-zinc-100 rounded-xl" />
            ))}
          </div>
        </div>
      }>
        <TableSection />
      </Suspense>
    </div>
  )
}
