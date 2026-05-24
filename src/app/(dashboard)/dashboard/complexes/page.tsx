import { createServerClient } from '@/lib/supabase/server'
import { ComplexesClient } from '@/components/dashboard/ComplexesClient'
import { Building2 } from 'lucide-react'
import type { PostgrestError } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

type ComplexRow = Database['public']['Tables']['residential_complexes']['Row']
type ApartmentComplexIdRow = { complex_id: string }

async function getComplexes() {
  const supabase = await createServerClient()

  const { data: complexes } = await supabase
    .from('residential_complexes')
    .select('id, name, address, created_at, updated_at')
    .order('name') as { data: ComplexRow[] | null; error: PostgrestError | null }

  const { data: apartmentCounts } = await supabase
    .from('apartments')
    .select('complex_id') as { data: ApartmentComplexIdRow[] | null; error: PostgrestError | null }

  const countMap: Record<string, number> = {}
  for (const apt of apartmentCounts ?? []) {
    countMap[apt.complex_id] = (countMap[apt.complex_id] ?? 0) + 1
  }

  return (complexes ?? []).map((c) => ({
    ...c,
    apartment_count: countMap[c.id] ?? 0,
  }))
}

export default async function ComplexesPage() {
  const complexes = await getComplexes()

  return (
    <div className="p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-zinc-400" />
          <h1 className="text-xl font-bold text-zinc-900">Жилые комплексы</h1>
        </div>
        <p className="text-sm text-zinc-500 mt-1">Реестр ЖК</p>
      </div>
      <ComplexesClient initialComplexes={complexes} />
    </div>
  )
}
