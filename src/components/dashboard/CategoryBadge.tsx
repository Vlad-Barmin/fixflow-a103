import { cn } from '@/lib/utils'
import type { RequestCategory } from '@/types'

const CATEGORY_CONFIG: Record<RequestCategory, { label: string; className: string }> = {
  electrical: { label: 'Электрика', className: 'bg-yellow-100 text-yellow-800' },
  plumbing: { label: 'Сантехника', className: 'bg-blue-100 text-blue-800' },
  hvac: { label: 'Отопление/вент.', className: 'bg-orange-100 text-orange-800' },
  structural: { label: 'Конструктив', className: 'bg-stone-100 text-stone-800' },
  windows_doors: { label: 'Окна/двери', className: 'bg-cyan-100 text-cyan-800' },
  finishing: { label: 'Отделка', className: 'bg-pink-100 text-pink-800' },
  appliances: { label: 'Бытовая техника', className: 'bg-violet-100 text-violet-800' },
  other: { label: 'Прочее', className: 'bg-gray-100 text-gray-700' },
}

interface CategoryBadgeProps {
  category: RequestCategory | null
  className?: string
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  if (!category) {
    return (
      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-500', className)}>
        Не определено
      </span>
    )
  }
  const config = CATEGORY_CONFIG[category] ?? { label: category, className: 'bg-gray-100 text-gray-700' }
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

export { CATEGORY_CONFIG }
