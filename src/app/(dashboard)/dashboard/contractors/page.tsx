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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Подрядчики</h1>
        <p className="text-sm text-gray-500 mt-1">Управление исполнителями</p>
      </div>
      <ContractorsClient initialContractors={contractors} />
    </div>
  )
}
