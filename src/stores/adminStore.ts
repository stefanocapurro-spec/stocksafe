import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export interface AdminUser {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  itemCount: number
  hasCryptoConfig: boolean
}

interface AdminState {
  users: AdminUser[]
  loading: boolean
  error: string | null
  fetchUsers: () => Promise<void>
  deleteUserData: (userId: string) => Promise<void>
  resetUserCrypto: (userId: string) => Promise<void>
  clearError: () => void
}

export const useAdminStore = create<AdminState>()((set) => ({
  users: [], loading: false, error: null,
  clearError: () => set({ error: null }),

  fetchUsers: async () => {
    set({ loading: true, error: null })
    try {
      // Ottiene utenti tramite RPC (funzione con SECURITY DEFINER definita nel SQL)
      const { data, error } = await supabase.rpc('admin_list_users')
      if (error) throw new Error(error.message)
      set({ users: (data as AdminUser[]) ?? [], loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  deleteUserData: async (userId) => {
    set({ loading: true, error: null })
    try {
      const { error } = await supabase.rpc('admin_delete_user_data', { target_user_id: userId })
      if (error) throw new Error(error.message)
      set(s => ({ users: s.users.filter(u => u.id !== userId), loading: false }))
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  resetUserCrypto: async (userId) => {
    set({ loading: true, error: null })
    try {
      const { error } = await supabase.rpc('admin_reset_user_crypto', { target_user_id: userId })
      if (error) throw new Error(error.message)
      await useAdminStore.getState().fetchUsers()
      set({ loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },
}))
