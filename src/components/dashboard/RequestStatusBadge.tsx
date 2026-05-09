import { cn } from '@/lib/utils'
import type { RequestStatus } from '@/types'

const STATUS_CONFIG: Record<RequestStatus, { label: string; className: string }> = {
  new: { label: 'Новая', className: 'bg-gray-100 text-gray-700' },
  ai_processing: { label: 'AI обработка', className: 'bg-blue-100 text-blue-700' },
  routed: { label: 'Направлена', className: 'bg-yellow-100 text-yellow-700' },
  accepted: { label: 'Принята', className: 'bg-orange-100 text-orange-700' },
  in_progress: { label: 'В работе', className: 'bg-purple-100 text-purple-700' },
  completed: { label: 'Выполнена', className: 'bg-green-100 text-green-700' },
  requires_manual_review: { label: 'Ручная проверка', className: 'bg-red-100 text-red-700' },
}

interface RequestStatusBadgeProps {
  status: RequestStatus
  className?: string
}

export function RequestStatusBadge({ status, className }: RequestStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-700' }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}

export { STATUS_CONFIG }
