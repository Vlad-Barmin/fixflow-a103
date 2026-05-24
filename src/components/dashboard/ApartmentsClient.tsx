'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Plus, Pencil, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Complex {
  id: string
  name: string
}

interface Apartment {
  id: string
  complex_id: string
  building: string
  number: string
  owner_name: string | null
  owner_phone: string | null
  warranty_expires_at: string | null
  created_at: string
  residential_complexes: { id: string; name: string } | null
}

interface ApartmentsClientProps {
  initialApartments: Apartment[]
  complexes: Complex[]
}

interface FormState {
  complex_id: string
  building: string
  number: string
  owner_name: string
  owner_phone: string
  warranty_expires_at: string
}

const emptyForm = (firstComplexId = ''): FormState => ({
  complex_id: firstComplexId,
  building: '',
  number: '',
  owner_name: '',
  owner_phone: '',
  warranty_expires_at: '',
})

export function ApartmentsClient({ initialApartments, complexes }: ApartmentsClientProps) {
  const router = useRouter()
  const [apartments, setApartments] = useState<Apartment[]>(initialApartments)
  const [complexFilter, setComplexFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm(complexes[0]?.id ?? ''))
  const [saving, setSaving] = useState(false)

  const filtered = complexFilter
    ? apartments.filter((a) => a.complex_id === complexFilter)
    : apartments

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm(complexFilter || complexes[0]?.id || ''))
    setDialogOpen(true)
  }

  function openEdit(apt: Apartment) {
    setEditingId(apt.id)
    setForm({
      complex_id: apt.complex_id,
      building: apt.building,
      number: apt.number,
      owner_name: apt.owner_name ?? '',
      owner_phone: apt.owner_phone ?? '',
      warranty_expires_at: apt.warranty_expires_at
        ? apt.warranty_expires_at.slice(0, 10)
        : '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.complex_id || !form.building.trim() || !form.number.trim()) {
      toast.error('Заполните обязательные поля')
      return
    }
    setSaving(true)
    try {
      const payload = {
        complex_id: form.complex_id,
        building: form.building.trim(),
        number: form.number.trim(),
        owner_name: form.owner_name.trim() || null,
        owner_phone: form.owner_phone.trim() || null,
        warranty_expires_at: form.warranty_expires_at
          ? new Date(form.warranty_expires_at).toISOString()
          : null,
      }

      if (editingId) {
        const res = await fetch(`/api/apartments/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json() as { error: { message: string } }
          throw new Error(err.error?.message ?? 'Failed')
        }
        toast.success('Квартира обновлена')
      } else {
        const res = await fetch('/api/apartments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json() as { error: { message: string } }
          throw new Error(err.error?.message ?? 'Failed')
        }
        toast.success('Квартира добавлена')
      }
      setDialogOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <Select
          value={complexFilter}
          onChange={(e) => setComplexFilter(e.target.value)}
          className="w-56"
        >
          <option value="">Все комплексы</option>
          {complexes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>

        <div className="flex-1" />

        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Добавить квартиру
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border-2 border-dashed border-zinc-200 bg-white">
          <Home className="h-12 w-12 mb-3 text-zinc-300" />
          <p className="text-base font-medium text-zinc-500">Квартир нет</p>
          <p className="text-sm mt-1 text-zinc-400">
            {complexFilter ? 'В выбранном комплексе квартир нет' : 'Добавьте первую квартиру'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50/60">
                <TableHead>ЖК</TableHead>
                <TableHead>Корпус</TableHead>
                <TableHead>Квартира</TableHead>
                <TableHead>Владелец</TableHead>
                <TableHead>Телефон</TableHead>
                <TableHead>Гарантия до</TableHead>
                <TableHead className="w-16">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((apt) => (
                <TableRow key={apt.id}>
                  <TableCell className="text-sm text-zinc-600">
                    {apt.residential_complexes?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-600">{apt.building}</TableCell>
                  <TableCell className="font-medium text-zinc-900">{apt.number}</TableCell>
                  <TableCell className="text-sm text-zinc-600">{apt.owner_name ?? '—'}</TableCell>
                  <TableCell className="text-sm text-zinc-600">{apt.owner_phone ?? '—'}</TableCell>
                  <TableCell className="text-sm text-zinc-600">
                    {apt.warranty_expires_at
                      ? format(new Date(apt.warranty_expires_at), 'd MMM yyyy', { locale: ru })
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(apt)}
                      title="Редактировать"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
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
            <DialogTitle>{editingId ? 'Редактировать квартиру' : 'Добавить квартиру'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="apt-complex">ЖК *</Label>
              <Select
                id="apt-complex"
                value={form.complex_id}
                onChange={(e) => setForm((f) => ({ ...f, complex_id: e.target.value }))}
              >
                <option value="">Выберите ЖК</option>
                {complexes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="apt-building">Корпус *</Label>
                <Input
                  id="apt-building"
                  value={form.building}
                  onChange={(e) => setForm((f) => ({ ...f, building: e.target.value }))}
                  placeholder="1"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="apt-number">Номер квартиры *</Label>
                <Input
                  id="apt-number"
                  value={form.number}
                  onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                  placeholder="42"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apt-owner">Владелец</Label>
              <Input
                id="apt-owner"
                value={form.owner_name}
                onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value }))}
                placeholder="Иванов Иван Иванович"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apt-phone">Телефон</Label>
              <Input
                id="apt-phone"
                value={form.owner_phone}
                onChange={(e) => setForm((f) => ({ ...f, owner_phone: e.target.value }))}
                placeholder="+7 999 000 00 00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apt-warranty">Гарантия до</Label>
              <Input
                id="apt-warranty"
                type="date"
                value={form.warranty_expires_at}
                onChange={(e) => setForm((f) => ({ ...f, warranty_expires_at: e.target.value }))}
              />
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
