---
name: create-api-route
description: "Создаёт Next.js API-роут для FixFlow A103 по описанию эндпоинта. Генерирует route.ts с Zod-валидацией, обработкой ошибок, Supabase-запросами и правильными HTTP-кодами."
---

Создай Next.js App Router API-роут для FixFlow A103.

## Входные данные

Опиши:
1. Путь: `/api/...`
2. HTTP методы: GET / POST / PATCH / DELETE
3. Входные данные (тело, параметры)
4. Что делает (бизнес-логика)
5. Нужна ли auth менеджера

## Шаблон route.ts

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

// --- Схемы валидации ---

const QuerySchema = z.object({
  status: z.enum(['new', 'routed', 'completed']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
})

const CreateSchema = z.object({
  // ...поля...
})

// --- GET ---

export async function GET(req: NextRequest) {
  const supabase = createServerClient()

  // Auth проверка (если нужна)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: { code: 'AUTH_ERROR', message: 'Unauthorized' } },
      { status: 401 }
    )
  }

  // Валидация query params
  const query = req.nextUrl.searchParams
  const parsed = QuerySchema.safeParse(Object.fromEntries(query))
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid query params', details: parsed.error.flatten() } },
      { status: 422 }
    )
  }

  const { data, error } = await supabase
    .from('table')
    .select('id, field1, field2, related(*)')
    .order('created_at', { ascending: false })
    .limit(parsed.data.limit)

  if (error) {
    console.error('GET /api/route error:', error)
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Failed to fetch data' } },
      { status: 500 }
    )
  }

  return NextResponse.json(data)
}

// --- POST ---

export async function POST(req: NextRequest) {
  const supabase = createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: { code: 'AUTH_ERROR', message: 'Unauthorized' } },
      { status: 401 }
    )
  }

  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.flatten() } },
      { status: 422 }
    )
  }

  const { data, error } = await supabase
    .from('table')
    .insert(parsed.data)
    .select()
    .single()

  if (error) {
    console.error('POST /api/route error:', error)
    if (error.code === '23505') {  // unique violation
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'Already exists' } },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: 'Failed to create' } },
      { status: 500 }
    )
  }

  return NextResponse.json(data, { status: 201 })
}
```

## Шаблон для [id] роута

```typescript
// src/app/api/resource/[id]/route.ts

interface Context {
  params: { id: string }
}

export async function GET(req: NextRequest, { params }: Context) {
  const { data, error } = await supabase
    .from('table')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()  // не single() — не бросает ошибку при отсутствии

  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Not found' } },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}
```

## Правила

- Zod-валидация ПЕРЕД обращением к БД
- Auth проверка где нужна — `supabase.auth.getUser()`, НЕ `getSession()`
- `maybeSingle()` для одиночных записей (не бросает ошибку при null)
- Никаких сырых Supabase ошибок в ответ — только код + safe message
- `console.error` для внутренних ошибок (Vercel logs)
- Бизнес-логику выносить в `src/lib/` сервисы
