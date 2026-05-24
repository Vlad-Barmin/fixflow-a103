'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClientClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  ClipboardList,
  HardHat,
  Home,
  Building2,
  BarChart3,
  Settings,
  LogOut,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Заявки', icon: ClipboardList, exact: true },
  { href: '/dashboard/contractors', label: 'Подрядчики', icon: HardHat },
  { href: '/dashboard/apartments', label: 'Квартиры', icon: Home },
  { href: '/dashboard/complexes', label: 'Комплексы', icon: Building2 },
  { href: '/dashboard/reports', label: 'Отчёты', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Настройки', icon: Settings },
]

interface SidebarProps {
  userEmail?: string | null
}

export function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClientClient()
    await supabase.auth.signOut()
    toast.success('Вы вышли из системы')
    router.push('/login')
    router.refresh()
  }

  const initials = userEmail
    ? userEmail[0].toUpperCase()
    : 'М'

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-white shadow-[1px_0_0_0_#e4e4e7]">
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#D91C1C] text-white font-bold text-sm shrink-0">
          F
        </div>
        <span className="font-semibold text-zinc-900">FixFlow A103</span>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150',
                isActive
                  ? 'bg-[#FEF2F2] text-[#D91C1C]'
                  : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-zinc-100">
        <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold shrink-0">
            {initials}
          </div>
          <p className="text-xs text-zinc-500 truncate">{userEmail ?? 'Менеджер'}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-500 hover:bg-red-50 hover:text-red-600 transition-colors duration-150 cursor-pointer"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Выйти
        </button>
      </div>
    </aside>
  )
}
