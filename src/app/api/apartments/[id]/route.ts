import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth, isAuthError } from '@/lib/auth'
import type { Database } from '@/types/database.types'

type ApartmentRow = Database['public']['Tables']['apartments']['Row']
type ApartmentUpdate = Database['public']['Tables']['apartments']['Update']

const UpdateApartmentSchema = z.object({
  complex_id: z.string().uuid().optional(),
  building: z.string().min(1).max(10).optional(),
  number: z.string().min(1).max(10).optional(),
  owner_name: z.string().nullable().optional(),
  owner_phone: z.string().nullable().optional(),
  warranty_expires_at: z.string().datetime().nullable().optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

// ---------------------------------------------------------------------------
// GET /api/apartments/[id]
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const { id } = await params
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid apartment ID' } },
      { status: 422 }
    )
  }

  const supabase = await createServerClient()

  const { data, error } = (await supabase
    .from('apartments')
    .select(
      'id, complex_id, building, number, owner_name, owner_phone, warranty_expires_at, created_at, updated_at, residential_complexes(id, name, address)'
    )
    .eq('id', idParsed.data)
    .maybeSingle()) as { data: unknown | null; error: PostgrestError | null }

  if (error) {
    console.error('[GET /api/apartments/[id]] DB error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Apartment not found' } },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}

// ---------------------------------------------------------------------------
// PATCH /api/apartments/[id]
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const { id } = await params
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid apartment ID' } },
      { status: 422 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 422 }
    )
  }

  const parsed = UpdateApartmentSchema.safeParse(body)
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

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one field required',
        },
      },
      { status: 422 }
    )
  }

  const supabase = await createServerClient()

  const { data: existing, error: fetchErr } = (await supabase
    .from('apartments')
    .select('id')
    .eq('id', idParsed.data)
    .maybeSingle()) as {
    data: { id: string } | null
    error: PostgrestError | null
  }

  if (fetchErr) {
    console.error('[PATCH /api/apartments/[id]] fetch error:', fetchErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Apartment not found' } },
      { status: 404 }
    )
  }

  const patch: ApartmentUpdate = {}
  if (parsed.data.complex_id !== undefined) patch.complex_id = parsed.data.complex_id
  if (parsed.data.building !== undefined) patch.building = parsed.data.building
  if (parsed.data.number !== undefined) patch.number = parsed.data.number
  if (parsed.data.owner_name !== undefined) patch.owner_name = parsed.data.owner_name
  if (parsed.data.owner_phone !== undefined) patch.owner_phone = parsed.data.owner_phone
  if (parsed.data.warranty_expires_at !== undefined)
    patch.warranty_expires_at = parsed.data.warranty_expires_at

  const { data: updated, error: updateErr } = (await supabase
    .from('apartments')
    .update(patch as unknown as never)
    .eq('id', idParsed.data)
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

  if (updateErr || !updated) {
    console.error('[PATCH /api/apartments/[id]] update error:', updateErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return NextResponse.json(updated)
}

// ---------------------------------------------------------------------------
// DELETE /api/apartments/[id]
// ---------------------------------------------------------------------------

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const { id } = await params
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid apartment ID' } },
      { status: 422 }
    )
  }

  const supabase = await createServerClient()

  const { data: existing, error: fetchErr } = (await supabase
    .from('apartments')
    .select('id')
    .eq('id', idParsed.data)
    .maybeSingle()) as {
    data: { id: string } | null
    error: PostgrestError | null
  }

  if (fetchErr) {
    console.error('[DELETE /api/apartments/[id]] fetch error:', fetchErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Apartment not found' } },
      { status: 404 }
    )
  }

  // Проверить нет ли заявок
  const { count, error: countErr } = await supabase
    .from('requests')
    .select('id', { count: 'exact', head: true })
    .eq('apartment_id', idParsed.data)

  if (countErr) {
    console.error('[DELETE /api/apartments/[id]] count error:', countErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (count && count > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'CONFLICT',
          message: `Cannot delete apartment with ${count} associated request(s)`,
        },
      },
      { status: 409 }
    )
  }

  const { error: deleteErr } = await supabase
    .from('apartments')
    .delete()
    .eq('id', idParsed.data)

  if (deleteErr) {
    console.error('[DELETE /api/apartments/[id]] delete error:', deleteErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return new NextResponse(null, { status: 204 })
}

export const dynamic = 'force-dynamic'
