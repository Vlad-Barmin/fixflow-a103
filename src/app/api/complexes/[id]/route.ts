import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth, isAuthError } from '@/lib/auth'
import type { Database } from '@/types/database.types'

type ComplexRow = Database['public']['Tables']['residential_complexes']['Row']
type ComplexUpdate =
  Database['public']['Tables']['residential_complexes']['Update']

const UpdateComplexSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().min(1).max(500).optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

// ---------------------------------------------------------------------------
// GET /api/complexes/[id]
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const { id } = await params
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid complex ID' } },
      { status: 422 }
    )
  }

  const supabase = await createServerClient()

  const { data, error } = (await supabase
    .from('residential_complexes')
    .select('id, name, address, created_at, updated_at')
    .eq('id', idParsed.data)
    .maybeSingle()) as {
    data: Pick<
      ComplexRow,
      'id' | 'name' | 'address' | 'created_at' | 'updated_at'
    > | null
    error: PostgrestError | null
  }

  if (error) {
    console.error('[GET /api/complexes/[id]] DB error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json(
      {
        error: { code: 'NOT_FOUND', message: 'Residential complex not found' },
      },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}

// ---------------------------------------------------------------------------
// PATCH /api/complexes/[id]
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const { id } = await params
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid complex ID' } },
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

  const parsed = UpdateComplexSchema.safeParse(body)
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
    .from('residential_complexes')
    .select('id')
    .eq('id', idParsed.data)
    .maybeSingle()) as {
    data: { id: string } | null
    error: PostgrestError | null
  }

  if (fetchErr) {
    console.error('[PATCH /api/complexes/[id]] fetch error:', fetchErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!existing) {
    return NextResponse.json(
      {
        error: { code: 'NOT_FOUND', message: 'Residential complex not found' },
      },
      { status: 404 }
    )
  }

  const patch: ComplexUpdate = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.address !== undefined) patch.address = parsed.data.address

  const { data: updated, error: updateErr } = (await supabase
    .from('residential_complexes')
    .update(patch as unknown as never)
    .eq('id', idParsed.data)
    .select('id, name, address, created_at, updated_at')
    .single()) as {
    data: Pick<
      ComplexRow,
      'id' | 'name' | 'address' | 'created_at' | 'updated_at'
    > | null
    error: PostgrestError | null
  }

  if (updateErr || !updated) {
    console.error('[PATCH /api/complexes/[id]] update error:', updateErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return NextResponse.json(updated)
}

// ---------------------------------------------------------------------------
// DELETE /api/complexes/[id]
// ---------------------------------------------------------------------------

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const { id } = await params
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid complex ID' } },
      { status: 422 }
    )
  }

  const supabase = await createServerClient()

  const { data: existing, error: fetchErr } = (await supabase
    .from('residential_complexes')
    .select('id')
    .eq('id', idParsed.data)
    .maybeSingle()) as {
    data: { id: string } | null
    error: PostgrestError | null
  }

  if (fetchErr) {
    console.error('[DELETE /api/complexes/[id]] fetch error:', fetchErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!existing) {
    return NextResponse.json(
      {
        error: { code: 'NOT_FOUND', message: 'Residential complex not found' },
      },
      { status: 404 }
    )
  }

  // Проверить нет ли квартир
  const { count, error: countErr } = await supabase
    .from('apartments')
    .select('id', { count: 'exact', head: true })
    .eq('complex_id', idParsed.data)

  if (countErr) {
    console.error('[DELETE /api/complexes/[id]] count error:', countErr)
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
          message: `Cannot delete complex with ${count} apartment(s)`,
        },
      },
      { status: 409 }
    )
  }

  const { error: deleteErr } = await supabase
    .from('residential_complexes')
    .delete()
    .eq('id', idParsed.data)

  if (deleteErr) {
    console.error('[DELETE /api/complexes/[id]] delete error:', deleteErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return new NextResponse(null, { status: 204 })
}

export const dynamic = 'force-dynamic'
