'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Search, RefreshCw, Download, ChevronRight, ClipboardX } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { RequestStatusBadge } from '@/components/dashboard/RequestStatusBadge'
import { CategoryBadge } from '@/components/dashboard/CategoryBadge'
import { PriorityBadge } from '@/components/dashboard/PriorityBadge'
import type { RequestStatus, RequestCategory, RequestPriority } from '@/types'

interface RequestRow {
  id: string
  description: string
  status: RequestStatus
  priority: RequestPriority
  category: RequestCategory | null
  deadline: string | null
  created_at: string
  requires_manual_review: boolean
  apartments: {
    building: string
    number: string
    residential_complexes: { name: string } | null
  } | null
  contractors: { name: string } | null
}

interface RequestsTableProps {
  initialRequests: RequestRow[]
  contractors: { id: string; name: string }[]
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Все статусы' },
  { value: 'new', label: 'Новая' },
  { value: 'ai_processing', label: 'AI обработка' },
  { value: 'routed', label: 'Направлена' },
  { value: 'accepted', label: 'Принята' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'completed', label: 'Выполнена' },
  { value: 'requires_manual_review', label: 'Ручная проверка' },
]

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Все категории' },
  { value: 'electrical', label: 'Электрика' },
  { value: 'plumbing', label: 'Сантехника' },
  { value: 'hvac', label: 'Отопление/вент.' },
  { value: 'structural', label: 'Конструктив' },
  { value: 'windows_doors', label: 'Окна/двери' },
  { value: 'finishing', label: 'Отделка' },
  { value: 'appliances', label: 'Бытовая техника' },
  { value: 'other', label: 'Прочее' },
]

function isOverdue(deadline: string | null, status: RequestStatus): boolean {
  if (!deadline || status === 'completed') return false
  return new Date(deadline) < new Date()
}

function formatDeadline(deadline: string | null, status: RequestStatus): string {
  if (!deadline) return '—'
  return format(new Date(deadline), 'd MMM yyyy', { locale: ru })
}

function getApartmentLabel(apt: RequestRow['apartments']): string {
  if (!apt) return '—'
  const complex = apt.residential_complexes?.name ?? ''
  return `${complex ? complex + ', ' : ''}корп. ${apt.building}, кв. ${apt.number}`
}

export function RequestsTable({ initialRequests, contractors }: RequestsTableProps) {
  const router = useRouter()
  const [requests, setRequests] = useState<RequestRow[]>(initialRequests)
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [contractorFilter, setContractorFilter] = useState('')

  const fetchRequests = useCallback(async (params: {
    search?: string
    status?: string
    category?: string
    contractor_id?: string
  }) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (params.search) qs.set('search', params.search)
      if (params.status) qs.set('status', params.status)
      if (params.category) qs.set('category', params.category)
      if (params.contractor_id) qs.set('contractor_id', params.contractor_id)

      const res = await fetch(`/api/requests?${qs.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json() as { data: RequestRow[] }
      setRequests(json.data ?? [])
    } catch {
      toast.error('Ошибка при загрузке заявок')
    } finally {
      setLoading(false)
    }
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    void fetchRequests({ search, status: statusFilter, category: categoryFilter, contractor_id: contractorFilter })
  }

  function handleFilterChange(key: 'status' | 'category' | 'contractor', value: string) {
    const newStatus = key === 'status' ? value : statusFilter
    const newCategory = key === 'category' ? value : categoryFilter
    const newContractor = key === 'contractor' ? value : contractorFilter

    if (key === 'status') setStatusFilter(value)
    if (key === 'category') setCategoryFilter(value)
    if (key === 'contractor') setContractorFilter(value)

    void fetchRequests({ search, status: newStatus, category: newCategory, contractor_id: newContractor })
  }

  function handleRefresh() {
    void fetchRequests({ search, status: statusFilter, category: categoryFilter, contractor_id: contractorFilter })
  }

  async function handleExport() {
    try {
      const qs = new URLSearchParams()
      const res = await fetch(`/api/reports/xlsx?${qs.toString()}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `requests_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Файл скачан')
    } catch {
      toast.error('Ошибка экспорта')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-64">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Поиск по описанию..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">Найти</Button>
        </form>

        <div className="flex gap-2 flex-wrap">
          <Select
            value={statusFilter}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="w-44"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>

          <Select
            value={categoryFilter}
            onChange={(e) => handleFilterChange('category', e.target.value)}
            className="w-44"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>

          <Select
            value={contractorFilter}
            onChange={(e) => handleFilterChange('contractor', e.target.value)}
            className="w-44"
          >
            <option value="">Все подрядчики</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>

          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </Button>

          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
            XLSX
          </Button>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 rounded-lg border border-dashed border-gray-200 bg-white">
          <ClipboardX className="h-12 w-12 mb-3 text-gray-300" />
          <p className="text-base font-medium text-gray-500">Заявок нет</p>
          <p className="text-sm mt-1">Измените фильтры или создайте первую заявку</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-12">#</TableHead>
                <TableHead>Квартира</TableHead>
                <TableHead>Описание</TableHead>
                <TableHead>Категория</TableHead>
                <TableHead>Приоритет</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Дедлайн</TableHead>
                <TableHead>Подрядчик</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => {
                const overdue = isOverdue(req.deadline, req.status)
                return (
                  <TableRow
                    key={req.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/requests/${req.id}`)}
                  >
                    <TableCell className="text-xs text-gray-400 font-mono">
                      {req.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-700 max-w-32">
                      <span className="truncate block">{getApartmentLabel(req.apartments)}</span>
                    </TableCell>
                    <TableCell className="max-w-48">
                      <span className="block truncate text-sm text-gray-900">
                        {req.description}
                      </span>
                    </TableCell>
                    <TableCell>
                      <CategoryBadge category={req.category} />
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={req.priority} />
                    </TableCell>
                    <TableCell>
                      <RequestStatusBadge status={req.status} />
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm ${overdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                        {formatDeadline(req.deadline, req.status)}
                        {overdue && ' (просрочено)'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {req.contractors?.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
