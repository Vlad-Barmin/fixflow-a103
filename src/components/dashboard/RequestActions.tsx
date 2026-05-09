'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RefreshCw, UserCog } from 'lucide-react'
import type { RequestStatus } from '@/types'

interface RequestActionsProps {
  requestId: string
  currentStatus: RequestStatus
  requiresManualReview: boolean
}

const STATUS_TRANSITIONS: Record<RequestStatus, { label: string; next: RequestStatus }[]> = {
  new: [{ label: 'Начать обработку', next: 'ai_processing' }],
  ai_processing: [],
  routed: [{ label: 'Принять', next: 'accepted' }],
  accepted: [{ label: 'Начать работу', next: 'in_progress' }],
  in_progress: [{ label: 'Завершить', next: 'completed' }],
  completed: [],
  requires_manual_review: [{ label: 'Направить вручную', next: 'routed' }],
}

export function RequestActions({ requestId, currentStatus, requiresManualReview }: RequestActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [reclassifyLoading, setReclassifyLoading] = useState(false)

  const transitions = STATUS_TRANSITIONS[currentStatus] ?? []

  async function handleStatusChange(nextStatus: RequestStatus) {
    setLoading(true)
    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!res.ok) throw new Error('Failed to update status')
      toast.success('Статус обновлён')
      router.refresh()
    } catch {
      toast.error('Ошибка при изменении статуса')
    } finally {
      setLoading(false)
    }
  }

  async function handleReclassify() {
    setReclassifyLoading(true)
    try {
      const res = await fetch(`/api/requests/${requestId}/reclassify`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to reclassify')
      toast.success('Заявка отправлена на повторную классификацию')
      router.refresh()
    } catch {
      toast.error('Ошибка при повторной классификации')
    } finally {
      setReclassifyLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {transitions.map((t) => (
        <Button
          key={t.next}
          size="sm"
          onClick={() => handleStatusChange(t.next)}
          disabled={loading}
        >
          {loading ? 'Обновление...' : t.label}
        </Button>
      ))}

      {requiresManualReview && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleReclassify}
          disabled={reclassifyLoading}
        >
          <RefreshCw className={`h-4 w-4 ${reclassifyLoading ? 'animate-spin' : ''}`} />
          Повторная классификация
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        disabled
      >
        <UserCog className="h-4 w-4" />
        Переназначить
      </Button>
    </div>
  )
}
