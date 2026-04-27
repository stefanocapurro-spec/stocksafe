import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'

export interface Location {
  id: string
  name: string
  icon: string
  color: string
  description: string
  sortOrder: number
  isDefault: boolean
}

interface LocationState {
  locations: Location[]
  activeLocationId: string | null   // null = mostra tutti
  loading: boolean
  error: string | null

  fetchLocations:   (userId: string) => Promise<void>
  setActiveLocation: (id: string | null) => void
  addLocation:      (userId: string, name: string, icon: string, color: string, description?: string) => Promise<void>
  updateLocation:   (id: string, patch: Partial<Pick<Location, 'name' | 'icon' | 'color' | 'description'>>) => Promise<void>
  deleteLocation:   (id: string) => Promise<void>
  reorderLocation:  (id: string, dir: 'up' | 'down') => Promise<void>
  clearError:       () => void
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set, get) => ({
      locations: [],
      activeLocationId: null,
      loading: false,
      error: null,
      clearError: () => set({ error: null }),

      reorderLocation: async (id, dir) => {
        const { locations } = get()
        const idx = locations.findIndex(l => l.id === id)
        if (idx < 0) return
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1
        if (swapIdx < 0 || swapIdx >= locations.length) return

        const a = locations[idx]
        const b = locations[swapIdx]

        // Swap sort_order in DB
        await supabase.from('locations').update({ sort_order: b.sortOrder }).eq('id', a.id)
        await supabase.from('locations').update({ sort_order: a.sortOrder }).eq('id', b.id)

        // Update local state
        const updated = [...locations]
        updated[idx]     = { ...a, sortOrder: b.sortOrder }
        updated[swapIdx] = { ...b, sortOrder: a.sortOrder }
        updated.sort((x, y) => x.sortOrder - y.sortOrder)
        set({ locations: updated })
      },

      fetchLocations: async (userId) => {
        set({ loading: true, error: null })
        const { data, error } = await supabase
          .from('locations')
          .select('*')
          .eq('user_id', userId)
          .order('sort_order')
        if (error) { set({ error: error.message, loading: false }); return }
        const locations: Location[] = (data ?? []).map(r => ({
          id: r.id, name: r.name, icon: r.icon, color: r.color,
          description: r.description ?? '', sortOrder: r.sort_order,
          isDefault: r.is_default,
        }))
        set({ locations, loading: false })
        // Se non c'è un deposito attivo valido, seleziona il default
        const { activeLocationId } = get()
        if (!activeLocationId || !locations.find(l => l.id === activeLocationId)) {
          const def = locations.find(l => l.isDefault) ?? locations[0]
          if (def) set({ activeLocationId: def.id })
        }
      },

      setActiveLocation: (id) => set({ activeLocationId: id }),

      addLocation: async (userId, name, icon, color, description = '') => {
        const maxOrder = Math.max(0, ...get().locations.map(l => l.sortOrder))
        const { data, error } = await supabase.from('locations')
          .insert({ user_id: userId, name, icon, color, description, sort_order: maxOrder + 1 })
          .select().single()
        if (error) { set({ error: error.message }); return }
        const loc: Location = {
          id: data.id, name: data.name, icon: data.icon, color: data.color,
          description: data.description ?? '', sortOrder: data.sort_order, isDefault: false,
        }
        set(s => ({ locations: [...s.locations, loc] }))
      },

      updateLocation: async (id, patch) => {
        const dbPatch: Record<string, string> = {}
        if (patch.name)        dbPatch.name        = patch.name
        if (patch.icon)        dbPatch.icon        = patch.icon
        if (patch.color)       dbPatch.color       = patch.color
        if (patch.description !== undefined) dbPatch.description = patch.description
        const { error } = await supabase.from('locations').update(dbPatch).eq('id', id)
        if (error) { set({ error: error.message }); return }
        set(s => ({ locations: s.locations.map(l => l.id === id ? { ...l, ...patch } : l) }))
      },

      deleteLocation: async (id) => {
        const { locations, activeLocationId } = get()
        if (locations.length <= 1) { set({ error: 'Devi avere almeno un deposito.' }); return }
        const { error } = await supabase.from('locations').delete().eq('id', id)
        if (error) { set({ error: error.message }); return }
        const remaining = locations.filter(l => l.id !== id)
        const nextActive = activeLocationId === id
          ? (remaining.find(l => l.isDefault) ?? remaining[0])?.id ?? null
          : activeLocationId
        set({ locations: remaining, activeLocationId: nextActive })
      },
    }),
    {
      name: 'ss_location',
      partialize: s => ({ activeLocationId: s.activeLocationId }),
    }
  )
)
