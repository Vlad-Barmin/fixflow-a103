import { createServerClient } from '@/lib/supabase/server'
import { ApartmentsClient } from '@/components/dashboard/ApartmentsClient'

async function getData() {
  const supabase = await createServerClient()

  const [apartmentsRes, complexesRes] = await Promise.all([
    supabase
      .from('apartments')
      .select('id, complex_id, building, number, owner_name, owner_phone, warranty_expires_at, created_at, residential_complexes(id, name)')
      .order('building', { ascending: true })
      .order('number', { ascending: true }),
    supabase
      .from('residential_complexes')
      .select('id, name')
      .order('name'),
  ])

  return {
    apartments: apartmentsRes.data ?? [],
    complexes: complexesRes.data ?? [],
  }
}

export default async function ApartmentsPage() {
  const { apartments, complexes } = await getData()

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Квартиры</h1>
        <p className="text-sm text-gray-500 mt-1">Реестр квартир и владельцев</p>
      </div>
      <ApartmentsClient
        initialApartments={apartments as Parameters<typeof ApartmentsClient>[0]['initialApartments']}
        complexes={complexes}
      />
    </div>
  )
}
