import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Настройки</h1>
        <p className="text-sm text-zinc-500 mt-1">Конфигурация системы</p>
      </div>

      <div className="flex items-center justify-center min-h-80">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12 text-center max-w-sm w-full">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-100 mx-auto mb-4">
            <Settings className="h-7 w-7 text-zinc-300" />
          </div>
          <h2 className="text-base font-semibold text-zinc-900 mb-1">Настройки</h2>
          <p className="text-sm text-zinc-500 mb-6">Раздел находится в разработке</p>
          <Button variant="outline" disabled>Скоро будет</Button>
        </div>
      </div>
    </div>
  )
}
