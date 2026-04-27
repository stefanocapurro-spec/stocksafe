import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// IMPORTANTE: se in futuro colleghi un dominio custom (es. stocksafe.miosito.it)
// cambia VITE_BASE_URL in '/' nelle variabili d'ambiente GitHub
// e aggiorna qui: base: process.env.VITE_BASE_URL || '/stocksafe/'
const BASE = process.env.VITE_BASE_URL || '/stocksafe/'

export default defineConfig({
  base: BASE,

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'StockSafe – Gestione Scorte',
        short_name: 'StockSafe',
        description: 'Gestione sicura delle scorte domestiche con cifratura end-to-end',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: BASE,
        start_url: BASE,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        categories: ['productivity', 'utilities'],
        lang: 'it',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 31536000 } },
          },
          {
            urlPattern: /^https:\/\/world\.openfoodfacts\.org/,
            handler: 'NetworkFirst',
            options: { cacheName: 'barcode-cache', expiration: { maxEntries: 200, maxAgeSeconds: 604800 } },
          },
        ],
      },
    }),
  ],

  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('@zxing'))          return 'zxing'
          if (id.includes('xlsx'))            return 'xlsx'
          if (id.includes('@supabase'))       return 'supabase'
          if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('/react/')) return 'vendor'
        },
      },
    },
  },
})
