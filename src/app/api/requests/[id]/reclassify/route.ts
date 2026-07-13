import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { requireAuth, isAuthError } from '@/lib/auth'
import { classifyRequest } from '@/lib/ai/classifier'
import { dispatchRequest, markClassificationFailed } from '@/lib/ai/dispatcher'
import type { Database } from '@/types/database.types'

type RequestRow = Database['public']['Tables']['requests']['Row']
type StatusHistoryInsert =
  Database['public']['Tables']['request_status_history']['Insert']

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/requests/[id]/reclassify
 *
 * Повторный запуск AI-классификации для заявки.
 * Возвращает 200 немедленно, обработка идёт асинхронно.
 */
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth.response

  const { id } = await params
  const idParsed = z.string().uuid().safeParse(id)
  if (!idParsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid request ID' } },
      { status: 422 }
    )
  }

  const supabase = await createServerClient()

  const { data: current, error: fetchErr } = (await supabase
    .from('requests')
    .select('id, status, apartment_id')
    .eq('id', idParsed.data)
    .maybeSingle()) as {
    data: Pick<RequestRow, 'id' | 'status' | 'apartment_id'> | null
    error: PostgrestError | null
  }

  if (fetchErr) {
    console.error('[POST /reclassify] fetch error:', fetchErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  if (!current) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Request not found' } },
      { status: 404 }
    )
  }

  if (current.status === 'completed') {
    return NextResponse.json(
      {
        error: {
          code: 'CONFLICT',
          message: 'Cannot reclassify a completed request',
        },
      },
      { status: 409 }
    )
  }

  // Установить статус ai_processing
  const { error: updateErr } = await supabase
    .from('requests')
    .update({ status: 'ai_processing' } as unknown as never)
    .eq('id', idParsed.data)

  if (updateErr) {
    console.error('[POST /reclassify] status update error:', updateErr)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Database operation failed' } },
      { status: 500 }
    )
  }

  const historyRecord: StatusHistoryInsert = {
    request_id: idParsed.data,
    old_status: current.status,
    new_status: 'ai_processing',
    changed_by: 'manager',
    reason: 'Manual reclassification triggered',
  }
  await supabase
    .from('request_status_history')
    .insert(historyRecord as unknown as never)

  // Запустить классификацию после отправки ответа. after() гарантирует, что
  // Vercel не заморозит функцию до завершения фоновой работы — обычный
  // fire-and-forget (.catch() без await) такой гарантии не даёт.
  after(async () => {
    try {
      await runReclassification(idParsed.data, current.apartment_id)
    } catch (err) {
      console.error('[POST /reclassify] classification error:', err)
    }
  })

  return NextResponse.json({ message: 'Classification started' })
}

async function runReclassification(
  requestId: string,
  apartmentId: string
): Promise<void> {
  const supabase = createServiceRoleClient()

  try {
    const { data: requestData } = (await supabase
      .from('requests')
      .select('description, apartments(building, number, residential_complexes(name))')
      .eq('id', requestId)
      .maybeSingle()) as {
      data: {
        description: string
        apartments: {
          building: string
          number: string
          residential_complexes: { name: string } | null
        } | null
      } | null
      error: PostgrestError | null
    }

    if (!requestData || !requestData.apartments) {
      console.error('[runReclassification] Failed to load request data')
      await markClassificationFailed(
        requestId,
        'Failed to load request data for classification'
      )
      return
    }

    const { data: photos } = (await supabase
      .from('request_photos')
      .select('storage_path')
      .eq('request_id', requestId)) as {
      data: { storage_path: string }[] | null
      error: PostgrestError | null
    }

    const complexName =
      requestData.apartments.residential_complexes?.name ?? 'Неизвестный ЖК'

    const output = await classifyRequest({
      requestId,
      description: requestData.description,
      complexName,
      building: requestData.apartments.building,
      apartmentNumber: requestData.apartments.number,
      photoBase64: [],
    })

    if (!output.success) {
      // AI не смог классифицировать (лимит, retry исчерпаны) — на ручную проверку
      await markClassificationFailed(requestId, output.error)
      return
    }

    await dispatchRequest(requestId, output.result, apartmentId)
  } catch (err) {
    // Любое неожиданное исключение — заявка не должна зависнуть молча
    console.error('[runReclassification] unexpected error:', err)
    await markClassificationFailed(
      requestId,
      err instanceof Error ? err.message : String(err)
    )
  }
}

export const dynamic = 'force-dynamic'
