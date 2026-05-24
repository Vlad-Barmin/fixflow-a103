import { cn } from '@/lib/utils'

interface KpiCardProps {
  title: string
  value: number | string
  description?: string
  variant?: 'default' | 'warning' | 'danger' | 'success'
  icon?: React.ReactNode
}

export function KpiCard({ title, value, description, variant = 'default', icon }: KpiCardProps) {
  const iconBoxStyles = {
    default: 'bg-zinc-100 text-zinc-500',
    warning: 'bg-amber-100 text-amber-600',
    danger: 'bg-red-100 text-red-600',
    success: 'bg-emerald-100 text-emerald-600',
  }

  const isDangerActive = variant === 'danger' && typeof value === 'number' && value > 0

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-zinc-500">{title}</p>
        {icon && (
          <div className={cn('flex items-center justify-center w-9 h-9 rounded-xl shrink-0', iconBoxStyles[variant])}>
            {icon}
          </div>
        )}
      </div>
      <p className={cn('text-3xl font-extrabold tabular-nums', isDangerActive ? 'text-red-600' : 'text-zinc-900')}>
        {value}
      </p>
      {description && (
        <p className="text-sm text-zinc-500 mt-1">{description}</p>
      )}
    </div>
  )
}
