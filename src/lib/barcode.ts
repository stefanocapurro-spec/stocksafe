/**
 * StockSafe – Barcode Scanner
 *
 * Strategia:
 * 1. getUserMedia diretto → stream assegnato al <video> manualmente
 *    (evita schermo nero e race condition di ZXing)
 * 2. BarcodeDetector nativo (Chrome 83+/Edge/Samsung) se disponibile
 * 3. Fallback: @zxing/library su canvas con polling RAF
 *
 * Lo stream viene messo in pausa ma NON rilasciato tra una scansione
 * e l'altra: il browser non chiede nuovamente il permesso.
 */

let cachedStream: MediaStream | null = null

async function getStream(): Promise<MediaStream> {
  if (cachedStream && cachedStream.active) return cachedStream
  cachedStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  })
  return cachedStream
}

export function releaseStream() {
  cachedStream?.getTracks().forEach(t => t.stop())
  cachedStream = null
}

// ── BarcodeDetector nativo ────────────────────────────────────────────────────

type NativeDetector = {
  detect(src: HTMLVideoElement | HTMLCanvasElement): Promise<{ rawValue: string }[]>
}

async function getNativeDetector(): Promise<NativeDetector | null> {
  const BD = (window as unknown as Record<string, unknown>).BarcodeDetector as {
    getSupportedFormats(): Promise<string[]>
    new(opts: { formats: string[] }): NativeDetector
  } | undefined
  if (!BD) return null
  try {
    const supported = await BD.getSupportedFormats()
    const want = ['ean_13','ean_8','upc_a','upc_e','qr_code','code_128','code_39','itf','codabar']
    return new BD({ formats: want.filter(f => supported.includes(f)) })
  } catch { return null }
}

// ── ZXing fallback ────────────────────────────────────────────────────────────

async function zxingDecodeCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const zxing = await import('@zxing/library')
  const { BrowserMultiFormatReader } = zxing
  const reader = new BrowserMultiFormatReader()
  try {
    // Convert canvas to data URL then decode as image
    const dataUrl = canvas.toDataURL('image/png')
    const img = new Image()
    img.src = dataUrl
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej })
    const result = reader.decodeFromImageElement(img)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return result ? (result as unknown as { getText(): string }).getText() : null
  } catch {
    return null
  }
}

// ── Scanner principale ────────────────────────────────────────────────────────

export async function startScanner(
  videoEl: HTMLVideoElement,
  onDetect: (code: string) => void,
  onError?: (err: Error) => void
): Promise<() => void> {
  let stopped = false
  let rafId: number | null = null

  try {
    const stream = await getStream()
    videoEl.srcObject = stream

    // Aspetta che il video sia pronto
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout avvio fotocamera')), 8000)
      videoEl.onloadedmetadata = () => {
        clearTimeout(timeout)
        videoEl.play().then(resolve).catch(reject)
      }
      videoEl.onerror = () => { clearTimeout(timeout); reject(new Error('Errore video')) }
    })

    const nativeDetector = await getNativeDetector()

    if (nativeDetector) {
      // ── Percorso nativo ──
      const tick = async () => {
        if (stopped) return
        try {
          if (videoEl.readyState >= 2) {
            const results = await nativeDetector.detect(videoEl)
            if (results[0]?.rawValue) { onDetect(results[0].rawValue); return }
          }
        } catch { /* frame non leggibile */ }
        rafId = requestAnimationFrame(tick)
      }
      tick()

    } else {
      // ── Percorso ZXing su canvas ──
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!

      const tick = async () => {
        if (stopped) return
        try {
          if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
            canvas.width  = videoEl.videoWidth
            canvas.height = videoEl.videoHeight
            ctx.drawImage(videoEl, 0, 0)
            const code = await zxingDecodeCanvas(canvas)
            if (code) { onDetect(code); return }
          }
        } catch { /* nessun codice nel frame */ }
        rafId = requestAnimationFrame(tick)
      }
      tick()
    }

  } catch (e) {
    onError?.(e as Error)
  }

  return () => {
    stopped = true
    if (rafId !== null) cancelAnimationFrame(rafId)
    // Mette in pausa ma non rilascia lo stream → permesso non viene richiesto di nuovo
    videoEl.pause()
    videoEl.srcObject = null
  }
}

export function stopScanner() {
  releaseStream()
}

// ── Open Food Facts ───────────────────────────────────────────────────────────

export interface ProductInfo {
  name: string; brand: string; category: string
  imageUrl: string; barcode: string; found: boolean
}

export async function lookupBarcode(barcode: string): Promise<ProductInfo> {
  const base: ProductInfo = { name:'', brand:'', category:'', imageUrl:'', barcode, found:false }
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=product_name,brands,categories_tags,image_front_small_url`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return base
    const data = await res.json()
    if (data.status !== 1 || !data.product) return base
    const p = data.product
    return {
      name:     p.product_name || '',
      brand:    p.brands || '',
      category: (p.categories_tags?.[0] ?? '').replace(/^[a-z]{2}:/, '').replace(/-/g,' '),
      imageUrl: p.image_front_small_url || '',
      barcode, found: true,
    }
  } catch { return base }
}
