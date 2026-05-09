import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth, isAuthError } from '@/lib/auth'
import { REQUEST_CATEGORIES } from '@/lib/constants'
import type { Database } from '@/types/database.types'

type ContractorRow = Database['public']['Tables']['contractors']['Row']
type ContractorUpdate = Database['public']['Tables']['contractors']['Update']

const UpdateContractorSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  telegram_channel_id: z.number().int().nullable().optional(),
  categories: z.array(z.enum(REQUEST_CATEGORIES)).optional(),
  phone: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

// ---------------------------------------------------------------------------
// GET /api/contractors/[id]
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const { id } = await params
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid contractor ID' } },
      { status: 422 }
    )
  }

  const supabase = await createServerClient()

  const { data, error } = (await supabase
    .from('contractors')
    .select(
      'id, name, telegram_channel_id, categories, phone, is_active, created_at, updated_at'
    )
    .eq('id', idParsed.data)
    .maybeSingle()) as {
    data: Pick<
      ContractorRow,
      | 'id'
      | 'name'
      | 'telegram_channel_id'
      | 'categories'
      | 'phone'
      | 'is_active'
      | 'created_at'
      | 'updated_at'
    > | null
    error: PostgrestError | null
  }

  if (error) {
    console.error('[GET /api/contractors/[id]] DB error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Contractor not found' } },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}

// ---------------------------------------------------------------------------
// PATCH /api/contractors/[id]
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const { id } = await params
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid contractor ID' } },
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

  const parsed = UpdateContractorSchema.safeParse(body)
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

  // Проверить что подрядчик существует
  const { data: existing, error: fetchErr } = (await supabase
    .from('contractors')
    .select('id')
    .eq('id', idParsed.data)
    .maybeSingle()) as {
    data: { id: string } | null
    error: PostgrestError | null
  }

  if (fetchErr) {
    console.error('[PATCH /api/contractors/[id]] fetch error:', fetchErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Contractor not found' } },
      { status: 404 }
    )
  }

  const patch: ContractorUpdate = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.telegram_channel_id !== undefined)
    patch.telegram_channel_id = parsed.data.telegram_channel_id
  if (parsed.data.categories !== undefined)
    patch.categories = parsed.data.categories
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active

  const { data: updated, error: updateErr } = (await supabase
    .from('contractors')
    .update(patch as unknown as never)
    .eq('id', idParsed.data)
    .select(
      'id, name, telegram_channel_id, categories, phone, is_active, created_at, updated_at'
    )
    .single()) as {
    data: Pick<
      ContractorRow,
      | 'id'
      | 'name'
      | 'telegram_channel_id'
      | 'categories'
      | 'phone'
      | 'is_active'
      | 'created_at'
      | 'updated_at'
    > | null
    error: PostgrestError | null
  }

  if (updateErr || !updated) {
    console.error('[PATCH /api/contractors/[id]] update error:', updateErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return NextResponse.json(updated)
}

// ---------------------------------------------------------------------------
// DELETE /api/contractors/[id]
// ---------------------------------------------------------------------------

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const { id } = await params
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid contractor ID' } },
      { status: 422 }
    )
  }

  const supabase = await createServerClient()

  // Проверить что подрядчик существует
  const { data: existing, error: fetchErr } = (await supabase
    .from('contractors')
    .select('id')
    .eq('id', idParsed.data)
    .maybeSingle()) as {
    data: { id: string } | null
    error: PostgrestError | null
  }

  if (fetchErr) {
    console.error('[DELETE /api/contractors/[id]] fetch error:', fetchErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Contractor not found' } },
      { status: 404 }
    )
  }

  // Проверить нет ли активных заявок
  const { count, error: countErr } = await supabase
    .from('requests')
    .select('id', { count: 'exact', head: true })
    .eq('contractor_id', idParsed.data)
    .not('status', 'in', '("completed","requires_manual_review")')

  if (countErr) {
    console.error('[DELETE /api/contractors/[id]] count error:', countErr)
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
          message: `Cannot delete contractor with ${count} active request(s)`,
        },
      },
      { status: 409 }
    )
  }

  const { error: deleteErr } = await supabase
    .from('contractors')
    .delete()
    .eq('id', idParsed.data)

  if (deleteErr) {
    console.error('[DELETE /api/contractors/[id]] delete error:', deleteErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return new NextResponse(null, { status: 204 })
}

export const dynamic = 'force-dynamic'
