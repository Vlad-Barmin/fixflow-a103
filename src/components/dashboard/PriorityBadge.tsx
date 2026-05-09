import { cn } from '@/lib/utils'
import type { RequestPriority } from '@/types'

const PRIORITY_CONFIG: Record<RequestPriority, { label: string; className: string }> = {
  urgent: { label: 'Срочно', className: 'bg-red-100 text-red-700' },
  high: { label: 'Высокий', className: 'bg-orange-100 text-orange-700' },
  normal: { label: 'Обычный', className: 'bg-yellow-100 text-yellow-700' },
  low: { label: 'Низкий', className: 'bg-gray-100 text-gray-500' },
}

interface PriorityBadgeProps {
  priority: RequestPriority | null
  className?: string
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  if (!priority) return null
  const config = PRIORITY_CONFIG[priority] ?? { label: priority, className: 'bg-gray-100 text-gray-700' }
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
