'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { toast } from 'sonner'

interface ContractorPerformance {
  contractor_id: string
  name: string
  total: number
  completed: number
  in_progress: number
  overdue: number
  avg_completion_days: number | null
}

interface ApiResponse {
  data: ContractorPerformance[]
  date_from: string
  date_to: string
}

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = today.slice(0, 8) + '01'

  const [dateFrom, setDateFrom] = useState<string>(firstOfMonth)
  const [dateTo, setDateTo] = useState<string>(today)
  const [rows, setRows] = useState<ContractorPerformance[]>([])
  const [loading, setLoading] = useState(false)
  const [xlsxLoading, setXlsxLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toIso(dateStr: string, endOfDay = false): string {
    return endOfDay ? `${dateStr}T23:59:59.000Z` : `${dateStr}T00:00:00.000Z`
  }

  async function handleLoad() {
    if (!dateFrom || !dateTo) {
      toast.error('Укажите оба периода')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        date_from: toIso(dateFrom),
        date_to: toIso(dateTo, true),
      })
      const res = await fetch(`/api/reports/contractor-performance?${params.toString()}`)
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } }
        throw new Error(body.error?.message ?? 'Ошибка загрузки данных')
      }
      const json = (await res.json()) as ApiResponse
      setRows(json.data)
      setLoaded(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDownloadXlsx() {
    if (!dateFrom || !dateTo) {
      toast.error('Укажите оба периода')
      return
    }
    setXlsxLoading(true)
    try {
      const params = new URLSearchParams({
        date_from: toIso(dateFrom),
        date_to: toIso(dateTo, true),
      })
      const res = await fetch(`/api/reports/xlsx?${params.toString()}`)
      if (!res.ok) {
        throw new Error('Ошибка формирования отчёта')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fixflow-report-${dateFrom}-${dateTo}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Файл скачан')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
      toast.error(message)
    } finally {
      setXlsxLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Отчёты</h1>
        <p className="text-sm text-zinc-500 mt-1">Статистика по подрядчикам за период</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Период</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date-from">С</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date-to">По</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
            <Button onClick={handleLoad} disabled={loading}>
              {loading ? 'Загрузка...' : 'Загрузить'}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadXlsx}
              disabled={xlsxLoading}
            >
              {xlsxLoading ? 'Формирование...' : 'Скачать XLSX'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loaded && rows.length === 0 && !loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-zinc-500 text-sm">
              За выбранный период данных нет. Измените диапазон дат и нажмите «Загрузить».
            </p>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-50/60">
                  <TableHead>Подрядчик</TableHead>
                  <TableHead className="text-right">Всего</TableHead>
                  <TableHead className="text-right">Выполнено</TableHead>
                  <TableHead className="w-32">Выполнение</TableHead>
                  <TableHead className="text-right">В работе</TableHead>
                  <TableHead className="text-right">Просрочено</TableHead>
                  <TableHead className="text-right">Ср. время (дни)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const pct = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0
                  return (
                    <TableRow key={row.contractor_id}>
                      <TableCell className="font-medium text-zinc-900">
                        <span className="flex items-center gap-1.5">
                          {row.overdue > 0 && (
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                          )}
                          {row.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-zinc-700">{row.total}</TableCell>
                      <TableCell className="text-right text-green-700">{row.completed}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-zinc-200 rounded-full h-1.5">
                            <div
                              className="bg-[#D91C1C] h-1.5 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-500 w-8 text-right tabular-nums">{pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-purple-700">{row.in_progress}</TableCell>
                      <TableCell className="text-right">
                        <span className={row.overdue > 0 ? 'text-red-600 font-medium' : 'text-zinc-700'}>
                          {row.overdue}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-zinc-600">
                        {row.avg_completion_days !== null
                          ? row.avg_completion_days.toFixed(1)
                          : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
