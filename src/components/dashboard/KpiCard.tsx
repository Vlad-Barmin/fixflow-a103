import { cn } from '@/lib/utils'

interface KpiCardProps {
  title: string
  value: number | string
  description?: string
  variant?: 'default' | 'warning' | 'danger' | 'success'
  icon?: React.ReactNode
}

export function KpiCard({ title, value, description, variant = 'default', icon }: KpiCardProps) {
  const variantStyles = {
    default: 'border-gray-200',
    warning: 'border-yellow-200 bg-yellow-50',
    danger: 'border-red-200 bg-red-50',
    success: 'border-green-200 bg-green-50',
  }

  const valueStyles = {
    default: 'text-gray-900',
    warning: 'text-yellow-700',
    danger: 'text-red-700',
    success: 'text-green-700',
  }

  return (
    <div className={cn('rounded-lg border bg-white p-6 shadow-sm', variantStyles[variant])}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>
      <p className={cn('text-3xl font-bold', valueStyles[variant])}>{value}</p>
      {description && (
        <p className="text-xs text-gray-400 mt-1">{description}</p>
      )}
    </div>
  )
}
