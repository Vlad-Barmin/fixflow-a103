import type { Database } from './database.types'

// ---------------------------------------------------------------------------
// Алиасы строк таблиц
// ---------------------------------------------------------------------------

export type ResidentialComplex =
  Database['public']['Tables']['residential_complexes']['Row']

export type Apartment = Database['public']['Tables']['apartments']['Row']

export type Contractor = Database['public']['Tables']['contractors']['Row']

export type ApartmentContractor =
  Database['public']['Tables']['apartment_contractors']['Row']

export type Request = Database['public']['Tables']['requests']['Row']

export type RequestPhoto =
  Database['public']['Tables']['request_photos']['Row']

export type RequestCompletionPhoto =
  Database['public']['Tables']['request_completion_photos']['Row']

export type RequestStatusHistory =
  Database['public']['Tables']['request_status_history']['Row']

export type ManagerProfile =
  Database['public']['Tables']['manager_profiles']['Row']

export type OwnerConsent = Database['public']['Tables']['owner_consents']['Row']

export type AiClassificationLog =
  Database['public']['Tables']['ai_classification_log']['Row']

export type AppSetting = Database['public']['Tables']['app_settings']['Row']

export type TelegramBotState =
  Database['public']['Tables']['telegram_bot_states']['Row']

// ---------------------------------------------------------------------------
// Литеральные типы
// ---------------------------------------------------------------------------

export type RequestStatus =
  | 'new'
  | 'ai_processing'
  | 'routed'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'requires_manual_review'

export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent'

export type RequestCategory =
  | 'electrical'
  | 'plumbing'
  | 'hvac'
  | 'structural'
  | 'windows_doors'
  | 'finishing'
  | 'appliances'
  | 'other'

// ---------------------------------------------------------------------------
// Request с вложенными данными (для dashboard)
// ---------------------------------------------------------------------------

export type RequestWithRelations = Request & {
  apartment: Apartment & { complex: ResidentialComplex }
  contractor: Contractor | null
  photos: RequestPhoto[]
}
