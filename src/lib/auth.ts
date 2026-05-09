import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

export interface AuthResult {
  user: User
}

export interface AuthError {
  response: NextResponse
}

/**
 * Проверяет авторизацию менеджера через Supabase Auth JWT (httpOnly cookie).
 *
 * Использует getUser() (не getSession()) — он проверяет JWT на сервере,
 * а не только локально.
 *
 * Возвращает либо { user } при успехе, либо { response } с 401.
 */
export async function requireAuth(): Promise<AuthResult | AuthError> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      response: NextResponse.json(
        { error: { code: 'AUTH_ERROR', message: 'Unauthorized' } },
        { status: 401 }
      ),
    }
  }

  return { user }
}

export function isAuthError(result: AuthResult | AuthError): result is AuthError {
  return 'response' in result
}
