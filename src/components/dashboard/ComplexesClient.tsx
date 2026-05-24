'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Complex {
  id: string
  name: string
  address: string
  created_at: string
  apartment_count: number
}

interface ComplexesClientProps {
  initialComplexes: Complex[]
}

interface FormState {
  name: string
  address: string
}

const emptyForm: FormState = { name: '', address: '' }

export function ComplexesClient({ initialComplexes }: ComplexesClientProps) {
  const router = useRouter()
  const [complexes, setComplexes] = useState<Complex[]>(initialComplexes)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(complex: Complex) {
    setEditingId(complex.id)
    setForm({ name: complex.name, address: complex.address })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.address.trim()) {
      toast.error('Заполните название и адрес')
      return
    }
    setSaving(true)
    try {
      const payload = { name: form.name.trim(), address: form.address.trim() }

      if (editingId) {
        const res = await fetch(`/api/complexes/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json() as { error: { message: string } }
          throw new Error(err.error?.message ?? 'Failed')
        }
        const updated = await res.json() as Complex
        setComplexes((prev) => prev.map((c) => (c.id === editingId ? { ...updated, apartment_count: c.apartment_count } : c)))
        toast.success('ЖК обновлён')
      } else {
        const res = await fetch('/api/complexes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const err = await res.json() as { error: { message: string } }
          throw new Error(err.error?.message ?? 'Failed')
        }
        const created = await res.json() as Complex
        setComplexes((prev) => [...prev, { ...created, apartment_count: 0 }])
        toast.success('ЖК добавлен')
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
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 flex justify-end">
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Добавить ЖК
        </Button>
      </div>

      {complexes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border-2 border-dashed border-zinc-200 bg-white">
          <Building2 className="h-12 w-12 mb-3 text-zinc-300" />
          <p className="text-base font-medium text-zinc-500">Комплексов нет</p>
          <p className="text-sm mt-1 text-zinc-400">Добавьте первый жилой комплекс</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50/60">
                <TableHead>Название</TableHead>
                <TableHead>Адрес</TableHead>
                <TableHead>Квартир</TableHead>
                <TableHead className="w-16">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {complexes.map((complex) => (
                <TableRow key={complex.id}>
                  <TableCell className="font-medium text-zinc-900">{complex.name}</TableCell>
                  <TableCell className="text-sm text-zinc-600">{complex.address}</TableCell>
                  <TableCell className="text-sm text-zinc-600">{complex.apartment_count}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(complex)}
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
            <DialogTitle>{editingId ? 'Редактировать ЖК' : 'Добавить ЖК'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="complex-name">Название *</Label>
              <Input
                id="complex-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ЖК Солнечный"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="complex-address">Адрес *</Label>
              <Input
                id="complex-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="г. Москва, ул. Примерная, д. 1"
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
