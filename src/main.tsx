import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { loadSavedTheme, applyTheme } from './lib/theme'

// Applica tema prima del render per evitare flash
const { palette, mode } = loadSavedTheme()
applyTheme(palette, mode)

// GitHub Pages SPA routing: ripristina il path originale
;(function () {
  const query = window.location.search
  if (query.startsWith('?p=')) {
    const path = decodeURIComponent(query.slice(3))
    window.history.replaceState(null, '', (import.meta.env.BASE_URL || '/stocksafe/') + path.replace(/^\//, ''))
  }
})()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
