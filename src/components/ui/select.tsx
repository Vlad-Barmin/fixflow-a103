import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        className={cn(
          'flex h-9 w-full rounded-xl border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-900 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D91C1C]/20 focus-visible:border-[#D91C1C] disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    )
  }
)
Select.displayName = 'Select'

export { Select }
