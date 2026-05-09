import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth, isAuthError } from '@/lib/auth'
import type { Database } from '@/types/database.types'

type ApartmentRow = Database['public']['Tables']['apartments']['Row']
type ApartmentInsert = Database['public']['Tables']['apartments']['Insert']

const ListApartmentsSchema = z.object({
  complex_id: z.string().uuid().optional(),
})

const CreateApartmentSchema = z.object({
  complex_id: z.string().uuid(),
  building: z.string().min(1).max(10),
  number: z.string().min(1).max(10),
  owner_name: z.string().optional(),
  owner_phone: z.string().optional(),
  warranty_expires_at: z.string().datetime().nullable().optional(),
})

// ---------------------------------------------------------------------------
// GET /api/apartments
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const params = Object.fromEntries(req.nextUrl.searchParams.entries())
  const queryParsed = ListApartmentsSchema.safeParse(params)
  if (!queryParsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: queryParsed.error.flatten(),
        },
      },
      { status: 422 }
    )
  }

  const supabase = await createServerClient()

  let query = supabase
    .from('apartments')
    .select(
      'id, complex_id, building, number, owner_name, owner_phone, warranty_expires_at, created_at, updated_at, residential_complexes(id, name)'
    )
    .order('building', { ascending: true })
    .order('number', { ascending: true })

  if (queryParsed.data.complex_id) {
    query = query.eq('complex_id', queryParsed.data.complex_id)
  }

  const { data, error } = await query

  if (error) {
    console.error('[GET /api/apartments] DB error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: data ?? [] })
}

// ---------------------------------------------------------------------------
// POST /api/apartments
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 422 }
    )
  }

  const parsed = CreateApartmentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: parsed.error.flatten(),
        },
      },
      { status: 422 }
    )
  }

  const supabase = await createServerClient()

  // Проверить что ЖК существует
  const { data: complex, error: complexErr } = (await supabase
    .from('residential_complexes')
    .select('id')
    .eq('id', parsed.data.complex_id)
    .maybeSingle()) as {
    data: { id: string } | null
    error: PostgrestError | null
  }

  if (complexErr) {
    console.error('[POST /api/apartments] complex lookup error:', complexErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!complex) {
    return NextResponse.json(
      {
        error: { code: 'NOT_FOUND', message: 'Residential complex not found' },
      },
      { status: 404 }
    )
  }

  // Проверить уникальность (complex_id + building + number)
  const { data: duplicate, error: dupErr } = (await supabase
    .from('apartments')
    .select('id')
    .eq('complex_id', parsed.data.complex_id)
    .eq('building', parsed.data.building)
    .eq('number', parsed.data.number)
    .maybeSingle()) as {
    data: { id: string } | null
    error: PostgrestError | null
  }

  if (dupErr) {
    console.error('[POST /api/apartments] duplicate check error:', dupErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (duplicate) {
    return NextResponse.json(
      {
        error: {
          code: 'CONFLICT',
          message: 'Apartment already exists in this complex/building',
        },
      },
      { status: 409 }
    )
  }

  const newApartment: ApartmentInsert = {
    complex_id: parsed.data.complex_id,
    building: parsed.data.building,
    number: parsed.data.number,
    owner_name: parsed.data.owner_name ?? null,
    owner_phone: parsed.data.owner_phone ?? null,
    warranty_expires_at: parsed.data.warranty_expires_at ?? null,
  }

  const { data: created, error: insertErr } = (await supabase
    .from('apartments')
    .insert(newApartment as unknown as never)
    .select(
      'id, complex_id, building, number, owner_name, owner_phone, warranty_expires_at, created_at, updated_at'
    )
    .single()) as {
    data: Pick<
      ApartmentRow,
      | 'id'
      | 'complex_id'
      | 'building'
      | 'number'
      | 'owner_name'
      | 'owner_phone'
      | 'warranty_expires_at'
      | 'created_at'
      | 'updated_at'
    > | null
    error: PostgrestError | null
  }

  if (insertErr || !created) {
    console.error('[POST /api/apartments] insert error:', insertErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return NextResponse.json(created, { status: 201 })
}

export const dynamic = 'force-dynamic'
