import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL e Anon Key mancanti. Configura .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'stocksafe_session',
  },
})

export type Database = {
  public: {
    Tables: {
      user_crypto_config: {
        Row: { id: string; user_id: string; salt_hex: string; created_at: string }
        Insert: { user_id: string; salt_hex: string }
        Update: { salt_hex?: string }
      }
      categories: {
        Row: { id: string; user_id: string; name: string; icon: string; color: string; is_default: boolean; created_at: string }
        Insert: { user_id: string; name: string; icon?: string; color?: string; is_default?: boolean }
        Update: { name?: string; icon?: string; color?: string }
      }
      items: {
        Row: {
          id: string; user_id: string; category_id: string | null
          encrypted_data: string; iv_hex: string
          quantity: number; unit: string
          purchase_date: string | null; expiry_date: string | null
          encrypted_value: string | null; iv_value_hex: string | null
          reminder_sent: boolean; created_at: string; updated_at: string
        }
        Insert: {
          user_id: string; category_id?: string | null
          encrypted_data: string; iv_hex: string
          quantity?: number; unit?: string
          purchase_date?: string | null; expiry_date?: string | null
          encrypted_value?: string | null; iv_value_hex?: string | null
        }
        Update: {
          category_id?: string | null
          encrypted_data?: string; iv_hex?: string
          quantity?: number; unit?: string
          purchase_date?: string | null; expiry_date?: string | null
          encrypted_value?: string | null; iv_value_hex?: string | null
        }
      }
      reminders: {
        Row: { id: string; user_id: string; item_id: string; remind_date: string; expiry_date: string; notified: boolean }
      }
    }
  }
}
