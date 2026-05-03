/**
 * Restituisce l'URL pubblico completo dell'app.
 * In produzione (GitHub Pages): https://user.github.io/stocksafe
 * In sviluppo locale:           http://localhost:5173
 *
 * import.meta.env.BASE_URL è impostato da Vite usando il campo `base`
 * in vite.config.ts, che legge VITE_BASE_URL dal workflow GitHub Actions.
 */
export function appBaseUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/'
  // window.location.origin = https://stefanocapurro-spec.github.io
  // base                   = /stocksafe/
  // risultato              = https://stefanocapurro-spec.github.io/stocksafe
  return window.location.origin + base.replace(/\/$/, '')
}

export function appUrl(path: string): string {
  // path deve iniziare con /
  const p = path.startsWith('/') ? path : '/' + path
  return appBaseUrl() + p
}
