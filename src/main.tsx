import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { loadSavedTheme, applyTheme } from './lib/theme'

// Applica tema prima del render (evita flash)
const { palette, mode } = loadSavedTheme()
applyTheme(palette, mode)

// Ripristina il path dopo redirect da 404.html
const savedPath = sessionStorage.getItem('spa_path')
if (savedPath) {
  sessionStorage.removeItem('spa_path')
  const base = import.meta.env.BASE_URL || '/stocksafe/'
  const full = base.replace(/\/$/, '') + savedPath
  window.history.replaceState(null, '', full)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
