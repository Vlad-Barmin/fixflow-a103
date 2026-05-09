import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth, isAuthError } from '@/lib/auth'
import type { Database } from '@/types/database.types'

type ComplexRow = Database['public']['Tables']['residential_complexes']['Row']
type ComplexInsert =
  Database['public']['Tables']['residential_complexes']['Insert']

const CreateComplexSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
})

// ---------------------------------------------------------------------------
// GET /api/complexes
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const supabase = await createServerClient()

  const { data, error } = (await supabase
    .from('residential_complexes')
    .select('id, name, address, created_at, updated_at')
    .order('name', { ascending: true })) as {
    data: Pick<
      ComplexRow,
      'id' | 'name' | 'address' | 'created_at' | 'updated_at'
    >[] | null
    error: PostgrestError | null
  }

  if (error) {
    console.error('[GET /api/complexes] DB error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: data ?? [] })
}

// ---------------------------------------------------------------------------
// POST /api/complexes
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

  const parsed = CreateComplexSchema.safeParse(body)
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

  // Проверить уникальность по имени
  const { data: duplicate, error: dupErr } = (await supabase
    .from('residential_complexes')
    .select('id')
    .eq('name', parsed.data.name)
    .maybeSingle()) as {
    data: { id: string } | null
    error: PostgrestError | null
  }

  if (dupErr) {
    console.error('[POST /api/complexes] duplicate check error:', dupErr)
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
          message: 'Residential complex with this name already exists',
        },
      },
      { status: 409 }
    )
  }

  const newComplex: ComplexInsert = {
    name: parsed.data.name,
    address: parsed.data.address,
  }

  const { data: created, error: insertErr } = (await supabase
    .from('residential_complexes')
    .insert(newComplex as unknown as never)
    .select('id, name, address, created_at, updated_at')
    .single()) as {
    data: Pick<
      ComplexRow,
      'id' | 'name' | 'address' | 'created_at' | 'updated_at'
    > | null
    error: PostgrestError | null
  }

  if (insertErr || !created) {
    console.error('[POST /api/complexes] insert error:', insertErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return NextResponse.json(created, { status: 201 })
}

export const dynamic = 'force-dynamic'
