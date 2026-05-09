import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { requireAuth, isAuthError } from '@/lib/auth'
import { REQUEST_CATEGORIES } from '@/lib/constants'
import type { Database } from '@/types/database.types'

type ContractorRow = Database['public']['Tables']['contractors']['Row']
type ContractorInsert = Database['public']['Tables']['contractors']['Insert']

const CreateContractorSchema = z.object({
  name: z.string().min(1).max(200),
  telegram_channel_id: z.number().int().optional(),
  categories: z.array(z.enum(REQUEST_CATEGORIES)).default([]),
  phone: z.string().optional(),
})

// ---------------------------------------------------------------------------
// GET /api/contractors
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const supabase = await createServerClient()

  const { data, error } = (await supabase
    .from('contractors')
    .select(
      'id, name, telegram_channel_id, categories, phone, is_active, created_at'
    )
    .order('name', { ascending: true })) as {
    data: Pick<
      ContractorRow,
      | 'id'
      | 'name'
      | 'telegram_channel_id'
      | 'categories'
      | 'phone'
      | 'is_active'
      | 'created_at'
    >[] | null
    error: PostgrestError | null
  }

  if (error) {
    console.error('[GET /api/contractors] DB error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: data ?? [] })
}

// ---------------------------------------------------------------------------
// POST /api/contractors
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

  const parsed = CreateContractorSchema.safeParse(body)
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

  const newContractor: ContractorInsert = {
    name: parsed.data.name,
    telegram_channel_id: parsed.data.telegram_channel_id ?? null,
    categories: parsed.data.categories,
    phone: parsed.data.phone ?? null,
    is_active: true,
  }

  const { data: created, error } = (await supabase
    .from('contractors')
    .insert(newContractor as unknown as never)
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

  if (error || !created) {
    console.error('[POST /api/contractors] insert error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  return NextResponse.json(created, { status: 201 })
}

export const dynamic = 'force-dynamic'
