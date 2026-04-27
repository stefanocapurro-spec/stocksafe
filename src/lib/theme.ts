/**
 * StockSafe – Sistema Tema / Palette
 * 6 palette × 3 modalità (chiaro / scuro / auto)
 */

export type ThemeMode = 'light' | 'dark' | 'auto'
export type PaletteId = 'amber' | 'ocean' | 'forest' | 'sunset' | 'slate' | 'lavender'

export interface Palette {
  id: PaletteId
  name: string
  emoji: string
  // Colori base (usati in entrambe le modalità, tonalità differente)
  accent: string
  accentDim: string
  accentGlow: string
}

export const PALETTES: Palette[] = [
  { id: 'amber',   name: 'Ambra',     emoji: '🟡', accent: '#F59E0B', accentDim: '#92400E', accentGlow: 'rgba(245,158,11,0.15)' },
  { id: 'ocean',   name: 'Oceano',    emoji: '🔵', accent: '#0EA5E9', accentDim: '#075985', accentGlow: 'rgba(14,165,233,0.15)' },
  { id: 'forest',  name: 'Foresta',   emoji: '🟢', accent: '#10B981', accentDim: '#065F46', accentGlow: 'rgba(16,185,129,0.15)' },
  { id: 'sunset',  name: 'Tramonto',  emoji: '🔴', accent: '#F43F5E', accentDim: '#881337', accentGlow: 'rgba(244,63,94,0.15)' },
  { id: 'slate',   name: 'Ardesia',   emoji: '⚫', accent: '#94A3B8', accentDim: '#334155', accentGlow: 'rgba(148,163,184,0.15)' },
  { id: 'lavender',name: 'Lavanda',   emoji: '🟣', accent: '#A78BFA', accentDim: '#5B21B6', accentGlow: 'rgba(167,139,250,0.15)' },
]

// Variabili CSS per modalità chiara
const lightVars = {
  '--bg-base':      '#F8FAFC',
  '--bg-surface':   '#FFFFFF',
  '--bg-raised':    '#F1F5F9',
  '--bg-overlay':   '#E2E8F0',
  '--text-primary': '#0F172A',
  '--text-secondary':'#475569',
  '--text-muted':   '#94A3B8',
  '--border':       'rgba(0,0,0,0.08)',
  '--border-hover': 'rgba(0,0,0,0.15)',
  '--green':        '#059669',
  '--red':          '#DC2626',
  '--blue':         '#2563EB',
  '--purple':       '#7C3AED',
}

// Variabili CSS per modalità scura
const darkVars = {
  '--bg-base':      '#0a0c10',
  '--bg-surface':   '#111318',
  '--bg-raised':    '#1a1d26',
  '--bg-overlay':   '#21252f',
  '--text-primary': '#F0F2F7',
  '--text-secondary':'#8892a4',
  '--text-muted':   '#4d5566',
  '--border':       'rgba(255,255,255,0.07)',
  '--border-hover': 'rgba(255,255,255,0.14)',
  '--green':        '#10B981',
  '--red':          '#EF4444',
  '--blue':         '#3B82F6',
  '--purple':       '#8B5CF6',
}

export function applyTheme(palette: Palette, mode: ThemeMode) {
  const root = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = mode === 'dark' || (mode === 'auto' && prefersDark)

  const base = isDark ? darkVars : lightVars
  for (const [k, v] of Object.entries(base)) root.style.setProperty(k, v)

  // Accent vars from palette
  root.style.setProperty('--accent',       palette.accent)
  root.style.setProperty('--accent-dim',   palette.accentDim)
  root.style.setProperty('--accent-glow',  palette.accentGlow)
  root.style.setProperty('--accent-border',palette.accent + '55')

  // Shadow
  const shadowAlpha = isDark ? '0.5' : '0.15'
  root.style.setProperty('--shadow-md',    `0 4px 16px rgba(0,0,0,${shadowAlpha})`)
  root.style.setProperty('--shadow-accent',`0 0 20px ${palette.accentGlow}`)

  // Data attribute for CSS selectors
  root.setAttribute('data-theme', isDark ? 'dark' : 'light')
  root.setAttribute('data-palette', palette.id)
}

export const STORAGE_KEY_PALETTE = 'ss_palette'
export const STORAGE_KEY_MODE    = 'ss_mode'

export function loadSavedTheme(): { palette: Palette; mode: ThemeMode } {
  const pid = (localStorage.getItem(STORAGE_KEY_PALETTE) ?? 'amber') as PaletteId
  const mode = (localStorage.getItem(STORAGE_KEY_MODE) ?? 'auto') as ThemeMode
  const palette = PALETTES.find(p => p.id === pid) ?? PALETTES[0]
  return { palette, mode }
}

export function saveTheme(palette: Palette, mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY_PALETTE, palette.id)
  localStorage.setItem(STORAGE_KEY_MODE, mode)
}
