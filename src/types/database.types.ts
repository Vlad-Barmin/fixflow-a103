export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      residential_complexes: {
        Row: {
          id: string
          name: string
          address: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          address: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          address?: string
          created_at?: string
          updated_at?: string
        }
      }
      apartments: {
        Row: {
          id: string
          complex_id: string
          building: string
          number: string
          owner_name: string | null
          owner_phone: string | null
          owner_telegram_chat_id: number | null
          warranty_expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          complex_id: string
          building: string
          number: string
          owner_name?: string | null
          owner_phone?: string | null
          owner_telegram_chat_id?: number | null
          warranty_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          complex_id?: string
          building?: string
          number?: string
          owner_name?: string | null
          owner_phone?: string | null
          owner_telegram_chat_id?: number | null
          warranty_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      contractors: {
        Row: {
          id: string
          name: string
          telegram_channel_id: number | null
          categories: string[]
          phone: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          telegram_channel_id?: number | null
          categories: string[]
          phone?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          telegram_channel_id?: number | null
          categories?: string[]
          phone?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      apartment_contractors: {
        Row: {
          apartment_id: string
          category: string
          contractor_id: string
        }
        Insert: {
          apartment_id: string
          category: string
          contractor_id: string
        }
        Update: {
          apartment_id?: string
          category?: string
          contractor_id?: string
        }
      }
      requests: {
        Row: {
          id: string
          apartment_id: string
          description: string
          status:
            | 'new'
            | 'ai_processing'
            | 'routed'
            | 'accepted'
            | 'in_progress'
            | 'completed'
            | 'requires_manual_review'
          priority: 'low' | 'normal' | 'high' | 'urgent'
          category:
            | 'electrical'
            | 'plumbing'
            | 'hvac'
            | 'structural'
            | 'windows_doors'
            | 'finishing'
            | 'appliances'
            | 'other'
            | null
          ai_confidence: number | null
          ai_raw_response: Json | null
          contractor_id: string | null
          deadline: string | null
          telegram_message_id: number | null
          requires_manual_review: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          apartment_id: string
          description: string
          status?:
            | 'new'
            | 'ai_processing'
            | 'routed'
            | 'accepted'
            | 'in_progress'
            | 'completed'
            | 'requires_manual_review'
          priority?: 'low' | 'normal' | 'high' | 'urgent'
          category?:
            | 'electrical'
            | 'plumbing'
            | 'hvac'
            | 'structural'
            | 'windows_doors'
            | 'finishing'
            | 'appliances'
            | 'other'
            | null
          ai_confidence?: number | null
          ai_raw_response?: Json | null
          contractor_id?: string | null
          deadline?: string | null
          telegram_message_id?: number | null
          requires_manual_review?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          apartment_id?: string
          description?: string
          status?:
            | 'new'
            | 'ai_processing'
            | 'routed'
            | 'accepted'
            | 'in_progress'
            | 'completed'
            | 'requires_manual_review'
          priority?: 'low' | 'normal' | 'high' | 'urgent'
          category?:
            | 'electrical'
            | 'plumbing'
            | 'hvac'
            | 'structural'
            | 'windows_doors'
            | 'finishing'
            | 'appliances'
            | 'other'
            | null
          ai_confidence?: number | null
          ai_raw_response?: Json | null
          contractor_id?: string | null
          deadline?: string | null
          telegram_message_id?: number | null
          requires_manual_review?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      request_photos: {
        Row: {
          id: string
          request_id: string
          storage_path: string
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          storage_path: string
          created_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          storage_path?: string
          created_at?: string
        }
      }
      request_completion_photos: {
        Row: {
          id: string
          request_id: string
          storage_path: string
          uploaded_by_chat_id: number | null
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          storage_path: string
          uploaded_by_chat_id?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          storage_path?: string
          uploaded_by_chat_id?: number | null
          created_at?: string
        }
      }
      request_status_history: {
        Row: {
          id: string
          request_id: string
          old_status: string | null
          new_status: string
          changed_by: string | null
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          old_status?: string | null
          new_status: string
          changed_by?: string | null
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          old_status?: string | null
          new_status?: string
          changed_by?: string | null
          reason?: string | null
          created_at?: string
        }
      }
      manager_profiles: {
        Row: {
          id: string
          display_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      owner_consents: {
        Row: {
          id: string
          apartment_id: string
          consent_text: string
          consented_at: string
          revoked_at: string | null
          ip_address: string | null
        }
        Insert: {
          id?: string
          apartment_id: string
          consent_text: string
          consented_at?: string
          revoked_at?: string | null
          ip_address?: string | null
        }
        Update: {
          id?: string
          apartment_id?: string
          consent_text?: string
          consented_at?: string
          revoked_at?: string | null
          ip_address?: string | null
        }
      }
      ai_classification_log: {
        Row: {
          id: string
          request_id: string | null
          model: string
          input_tokens: number | null
          output_tokens: number | null
          cost_usd: number | null
          confidence: number | null
          category_result: string | null
          priority_result: string | null
          latency_ms: number | null
          error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          request_id?: string | null
          model: string
          input_tokens?: number | null
          output_tokens?: number | null
          cost_usd?: number | null
          confidence?: number | null
          category_result?: string | null
          priority_result?: string | null
          latency_ms?: number | null
          error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          request_id?: string | null
          model?: string
          input_tokens?: number | null
          output_tokens?: number | null
          cost_usd?: number | null
          confidence?: number | null
          category_result?: string | null
          priority_result?: string | null
          latency_ms?: number | null
          error?: string | null
          created_at?: string
        }
      }
      app_settings: {
        Row: {
          key: string
          value: string
          description: string | null
          updated_at: string
        }
        Insert: {
          key: string
          value: string
          description?: string | null
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string
          description?: string | null
          updated_at?: string
        }
      }
      telegram_bot_states: {
        Row: {
          chat_id: number
          state: string
          data: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          chat_id: number
          state: string
          data?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          chat_id?: number
          state?: string
          data?: Json
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: Record<never, never>
    Functions: {
      is_manager: {
        Args: Record<never, never>
        Returns: boolean
      }
    }
    Enums: Record<never, never>
  }
}
