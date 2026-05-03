/**
 * StockSafe – Location Store
 * Gestisce i depositi: CRUD, selezione attiva, riordinamento.
 * La colonna `sort_order` (integer) controlla l'ordine di visualizzazione.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'

export interface Location {
  id:          string
  userId:      string
  name:        string
  icon:        string
  color:       string
  description: string
  sortOrder:   number
  isDefault:   boolean
  createdAt:   string
}

interface LocationState {
  locations:        Location[]
  activeLocationId: string | null
  loading:          boolean
  error:            string | null

  fetchLocations:    (userId: string) => Promise<void>
  setActiveLocation: (id: string | null) => void
  addLocation:       (userId: string, name: string, icon: string, color: string, description: string) => Promise<void>
  updateLocation:    (id: string, updates: { name?: string; icon?: string; color?: string; description?: string }) => Promise<void>
  deleteLocation:    (id: string) => Promise<void>
  reorderLocation:   (id: string, direction: 'up' | 'down') => Promise<void>
  clearError:        () => void
}

function rowToLocation(r: Record<string, unknown>): Location {
  return {
    id:          r.id as string,
    userId:      r.user_id as string,
    name:        r.name as string,
    icon:        (r.icon as string) || '📦',
    color:       (r.color as string) || '#F59E0B',
    description: (r.description as string) || '',
    sortOrder:   (r.sort_order as number) ?? 0,
    isDefault:   (r.is_default as boolean) ?? false,
    createdAt:   r.created_at as string,
  }
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set, get) => ({
      locations:        [],
      activeLocationId: null,
      loading:          false,
      error:            null,

      clearError: () => set({ error: null }),

      fetchLocations: async (userId) => {
        set({ loading: true, error: null })
        try {
          const { data, error } = await supabase
            .from('locations')
            .select('*')
            .eq('user_id', userId)
            .order('sort_order', { ascending: true })
          if (error) throw new Error(error.message)

          const locations = (data ?? []).map(r => rowToLocation(r as Record<string, unknown>))

          if (locations.length === 0) {
            const defaults = [
              { user_id: userId, name: 'Dispensa', icon: '🏠', color: '#F59E0B', description: '', sort_order: 0, is_default: true },
              { user_id: userId, name: 'Zaino',    icon: '🎒', color: '#3B82F6', description: '', sort_order: 1, is_default: true },
            ]
            const { data: newLocs, error: insErr } = await supabase
              .from('locations').insert(defaults).select()
            if (!insErr && newLocs) {
              const created = newLocs.map(r => rowToLocation(r as Record<string, unknown>))
              set({ locations: created, activeLocationId: created[0]?.id ?? null, loading: false })
              return
            }
          }

          const { activeLocationId } = get()
          const stillValid = locations.some(l => l.id === activeLocationId)
          set({
            locations,
            activeLocationId: stillValid ? activeLocationId : (locations[0]?.id ?? null),
            loading: false,
          })
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
        }
      },

      setActiveLocation: (id) => set({ activeLocationId: id }),

      addLocation: async (userId, name, icon, color, description) => {
        set({ loading: true, error: null })
        try {
          const { locations } = get()
          const nextOrder = locations.length > 0
            ? Math.max(...locations.map(l => l.sortOrder)) + 1 : 0

          const { data, error } = await supabase
            .from('locations')
            .insert({ user_id: userId, name, icon, color, description: description || '', sort_order: nextOrder, is_default: false })
            .select().single()
          if (error) throw new Error(error.message)

          const loc = rowToLocation(data as Record<string, unknown>)
          set(s => ({ locations: [...s.locations, loc], loading: false }))
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
        }
      },

      updateLocation: async (id, updates) => {
        set({ loading: true, error: null })
        try {
          const patch: Record<string, unknown> = {}
          if (updates.name        !== undefined) patch.name        = updates.name
          if (updates.icon        !== undefined) patch.icon        = updates.icon
          if (updates.color       !== undefined) patch.color       = updates.color
          if (updates.description !== undefined) patch.description = updates.description

          const { data, error } = await supabase
            .from('locations').update(patch).eq('id', id).select().single()
          if (error) throw new Error(error.message)

          const updated = rowToLocation(data as Record<string, unknown>)
          set(s => ({ locations: s.locations.map(l => l.id === id ? updated : l), loading: false }))
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
        }
      },

      deleteLocation: async (id) => {
        set({ loading: true, error: null })
        try {
          const { error } = await supabase.from('locations').delete().eq('id', id)
          if (error) throw new Error(error.message)

          set(s => {
            const locations = s.locations.filter(l => l.id !== id)
            const activeLocationId = s.activeLocationId === id
              ? (locations[0]?.id ?? null) : s.activeLocationId
            return { locations, activeLocationId, loading: false }
          })
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
        }
      },

      reorderLocation: async (id, direction) => {
        const { locations } = get()
        const idx = locations.findIndex(l => l.id === id)
        if (idx === -1) return
        if (direction === 'up'   && idx === 0)                   return
        if (direction === 'down' && idx === locations.length - 1) return

        const swapIdx = direction === 'up' ? idx - 1 : idx + 1
        const newLocs = [...locations]
        const tempOrder = newLocs[idx].sortOrder
        newLocs[idx]     = { ...newLocs[idx],     sortOrder: newLocs[swapIdx].sortOrder }
        newLocs[swapIdx] = { ...newLocs[swapIdx], sortOrder: tempOrder }
        ;[newLocs[idx], newLocs[swapIdx]] = [newLocs[swapIdx], newLocs[idx]]

        set({ locations: newLocs })

        try {
          await Promise.all([
            supabase.from('locations').update({ sort_order: newLocs[idx].sortOrder    }).eq('id', newLocs[idx].id),
            supabase.from('locations').update({ sort_order: newLocs[swapIdx].sortOrder }).eq('id', newLocs[swapIdx].id),
          ])
        } catch (e) {
          set({ locations, error: (e as Error).message })
        }
      },
    }),
    {
      name: 'ss_location_v1',
      partialize: (s) => ({ activeLocationId: s.activeLocationId }),
    }
  )
)
