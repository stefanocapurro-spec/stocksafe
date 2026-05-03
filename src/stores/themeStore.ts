/**
 * StockSafe – Theme Store
 * Wrappa la libreria theme.ts con uno store Zustand.
 */

import { create } from 'zustand'
import {
  applyTheme, PALETTES, loadSavedTheme, saveTheme,
  type Palette, type ThemeMode,
} from '../lib/theme'

interface ThemeState {
  palette: Palette
  mode:    ThemeMode
  init:       () => void
  setPalette: (palette: Palette) => void
  setMode:    (mode: ThemeMode) => void
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  palette: PALETTES[0],
  mode:    'auto',

  init: () => {
    const { palette, mode } = loadSavedTheme()
    applyTheme(palette, mode)
    set({ palette, mode })
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
