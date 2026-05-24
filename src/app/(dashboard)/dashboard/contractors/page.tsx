import { createServerClient } from '@/lib/supabase/server'
import { ContractorsClient } from '@/components/dashboard/ContractorsClient'

async function getContractors() {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('contractors')
    .select('id, name, telegram_channel_id, categories, phone, is_active, created_at')
    .order('name', { ascending: true })
  return data ?? []
}

export default async function ContractorsPage() {
  const contractors = await getContractors()

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Подрядчики</h1>
        <p className="text-sm text-zinc-500 mt-1">Управление исполнителями</p>
      </div>
      <ContractorsClient initialContractors={contractors} />
    </div>
  )
}
