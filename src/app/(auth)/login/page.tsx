'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClientClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const supabase = createClientClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      toast.error('Неверный email или пароль')
      setLoading(false)
      return
    }

    toast.success('Добро пожаловать!')
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#D91C1C] text-white font-bold text-lg mb-4">
            F
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">FixFlow A103</h1>
          <p className="text-sm text-zinc-500 mt-1">Система управления гарантийными заявками</p>
        </div>

        <Card className="shadow-md border-0 p-8">
          <h2 className="text-base font-semibold text-zinc-900 text-center mb-5">Вход в систему</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="manager@a103.ru"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full h-11 mt-2" disabled={loading}>
              {loading ? 'Вход...' : 'Войти'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
