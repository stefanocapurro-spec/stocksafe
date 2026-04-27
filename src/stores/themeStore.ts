import { create } from 'zustand'
import { PALETTES, applyTheme, saveTheme, loadSavedTheme } from '../lib/theme'
import type { Palette, ThemeMode } from '../lib/theme'

interface ThemeState {
  palette: Palette
  mode: ThemeMode
  setPalette: (p: Palette) => void
  setMode: (m: ThemeMode) => void
  init: () => void
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  palette: PALETTES[0],
  mode: 'auto',

  init: () => {
    const { palette, mode } = loadSavedTheme()
    applyTheme(palette, mode)
    set({ palette, mode })

    // Reagisce al cambio sistema chiaro/scuro quando mode='auto'
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', () => {
      const { palette, mode } = get()
      if (mode === 'auto') applyTheme(palette, mode)
    })
  },

  setPalette: (palette) => {
    const { mode } = get()
    applyTheme(palette, mode)
    saveTheme(palette, mode)
    set({ palette })
  },

  setMode: (mode) => {
    const { palette } = get()
    applyTheme(palette, mode)
    saveTheme(palette, mode)
    set({ mode })
  },
}))
