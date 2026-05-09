import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

/**
 * Service role клиент — обходит RLS.
 * Использовать ТОЛЬКО в:
 *   - Telegram webhook handlers (src/app/api/telegram/*)
 *   - Cron jobs (src/app/api/cron/*)
 *   - AI classifier (src/lib/ai/classifier.ts)
 */
export function createServiceRoleClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
