'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, PowerOff, HardHat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CategoryBadge } from '@/components/dashboard/CategoryBadge'
import type { RequestCategory } from '@/types'

interface Contractor {
  id: string
  name: string
  telegram_channel_id: number | null
  categories: string[]
  phone: string | null
  is_active: boolean
  created_at: string
}

interface ContractorsClientProps {
  initialContractors: Contractor[]
}

const ALL_CATEGORIES: RequestCategory[] = [
  'electrical', 'plumbing', 'hvac', 'structural',
  'windows_doors', 'finishing', 'appliances', 'other',
]

interface FormState {
  name: string
  phone: string
  telegram_channel_id: string
  categories: RequestCategory[]
}

const emptyForm: FormState = {
  name: '',
  phone: '',
  telegram_channel_id: '',
  categories: [],
}

export function ContractorsClient({ initialContractors }: ContractorsClientProps) {
  const router = useRouter()
  const [contractors, setContractors] = useState<Contractor[]>(initialContractors)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(contractor: Contractor) {
    setEditingId(contractor.id)
    setForm({
      name: contractor.name,
      phone: contractor.phone ?? '',
      telegram_channel_id: contractor.telegram_channel_id?.toString() ?? '',
      categories: contractor.categories as RequestCategory[],
    })
    setDialogOpen(true)
  }

  function toggleCategory(cat: RequestCategory) {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat],
    }))
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Введите имя подрядчика')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        telegram_channel_id: form.telegram_channel_id
          ? parseInt(form.telegram_channel_id, 10)
          : undefined,
        categories: form.categories,
      }

      if (editingId) {
        const res = await fetch(`/api/contractors/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed')
        const updated = await res.json() as Contractor
        setContractors((prev) => prev.map((c) => (c.id === editingId ? updated : c)))
        toast.success('Подрядчик обновлён')
      } else {
        const res = await fetch('/api/contractors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed')
        const created = await res.json() as Contractor
        setContractors((prev) => [...prev, created])
        toast.success('Подрядчик добавлен')
      }
      setDialogOpen(false)
      router.refresh()
    } catch {
      toast.error('Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(contractor: Contractor) {
    try {
      const res = await fetch(`/api/contractors/${contractor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !contractor.is_active }),
      })
      if (!res.ok) throw new Error('Failed')
      const updated = await res.json() as Contractor
      setContractors((prev) => prev.map((c) => (c.id === contractor.id ? updated : c)))
      toast.success(contractor.is_active ? 'Подрядчик деактивирован' : 'Подрядчик активирован')
    } catch {
      toast.error('Ошибка при изменении статуса')
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 flex justify-end">
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Добавить подрядчика
        </Button>
      </div>

      {contractors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border-2 border-dashed border-zinc-200 bg-white">
          <HardHat className="h-12 w-12 mb-3 text-zinc-300" />
          <p className="text-base font-medium text-zinc-500">Подрядчиков нет</p>
          <p className="text-sm mt-1 text-zinc-400">Добавьте первого подрядчика</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50/60">
                <TableHead>Имя</TableHead>
                <TableHead>Telegram канал</TableHead>
                <TableHead>Категории</TableHead>
                <TableHead>Телефон</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="w-24">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contractors.map((contractor) => (
                <TableRow key={contractor.id}>
                  <TableCell className="font-medium text-zinc-900">{contractor.name}</TableCell>
                  <TableCell className="text-sm text-zinc-500">
                    {contractor.telegram_channel_id ?? '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {contractor.categories.length > 0 ? (
                        contractor.categories.map((cat) => (
                          <CategoryBadge key={cat} category={cat as RequestCategory} />
                        ))
                      ) : (
                        <span className="text-zinc-400 text-xs">Не указаны</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-zinc-600">{contractor.phone ?? '—'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      contractor.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {contractor.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(contractor)}
                        title="Редактировать"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(contractor)}
                        title={contractor.is_active ? 'Деактивировать' : 'Активировать'}
                      >
                        <PowerOff className={`h-4 w-4 ${contractor.is_active ? 'text-red-400' : 'text-green-500'}`} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Редактировать подрядчика' : 'Добавить подрядчика'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="contractor-name">Имя *</Label>
              <Input
                id="contractor-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ООО Электромонтаж"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contractor-phone">Телефон</Label>
              <Input
                id="contractor-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+7 999 000 00 00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contractor-tg">Telegram channel ID</Label>
              <Input
                id="contractor-tg"
                type="number"
                value={form.telegram_channel_id}
                onChange={(e) => setForm((f) => ({ ...f, telegram_channel_id: e.target.value }))}
                placeholder="-100000000000"
              />
            </div>
            <div className="space-y-2">
              <Label>Категории</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      form.categories.includes(cat)
                        ? 'border-[#D91C1C] bg-red-50 text-[#D91C1C]'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
                    }`}
                  >
                    <CategoryBadge category={cat} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
