/**
 * StockSafe – Barcode Scanner v4 (iOS Safari compatible)
 *
 * Strategia scanner:
 *  1. getUserMedia diretto con facingMode (NON deviceId → compatibile iOS)
 *  2. Video element configurato con playsInline + muted prima del play
 *  3. BarcodeDetector nativo (Chrome/Edge) → RAF loop
 *  4. Fallback ZXing: canvas polling con MultiFormatReader (affidabile su Safari)
 *
 * Lookup prodotto (cascata):
 *  1. Open Food Facts world (nome IT, brand, categoria, peso, immagine)
 *  2. Open Food Facts IT   (prodotti locali italiani)
 *  3. UPC Item DB          (prodotti non-food)
 */

// ── Stream caching ────────────────────────────────────────────────────────────

let cachedStream: MediaStream | null = null

async function getStream(): Promise<MediaStream> {
  if (cachedStream?.active) return cachedStream

  // Prima tenta la fotocamera posteriore esatta, poi ideal, poi qualsiasi
  const attempts: MediaStreamConstraints['video'][] = [
    { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    { facingMode: 'environment' },
    true,
  ]

  let lastErr: unknown
  for (const video of attempts) {
    try {
      cachedStream = await navigator.mediaDevices.getUserMedia({ video, audio: false })
      return cachedStream
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

export function releaseStream() {
  cachedStream?.getTracks().forEach(t => t.stop())
  cachedStream = null
}

// ── BarcodeDetector nativo (Chrome 83+/Edge — NON Safari) ────────────────────

type NativeDetector = {
  detect(src: HTMLVideoElement | HTMLCanvasElement): Promise<{ rawValue: string }[]>
}

async function getNativeDetector(): Promise<NativeDetector | null> {
  const BD = (window as unknown as Record<string, unknown>).BarcodeDetector as
    | { getSupportedFormats(): Promise<string[]>; new(opts: { formats: string[] }): NativeDetector }
    | undefined
  if (!BD) return null
  try {
    const supported = await BD.getSupportedFormats()
    const want = ['ean_13','ean_8','upc_a','upc_e','qr_code','code_128','code_39','itf','codabar']
    return new BD({ formats: want.filter(f => supported.includes(f)) })
  } catch { return null }
}

// ── ZXing canvas polling (Safari / Firefox) ───────────────────────────────────

type ZXingReader = {
  decode(bmp: unknown): { getText(): string }
}

async function makeZxingReader(): Promise<ZXingReader | null> {
  try {
    const zx = await import('@zxing/library')
    return new (zx.MultiFormatReader as new () => ZXingReader)()
  } catch { return null }
}

async function decodeFrame(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  videoEl: HTMLVideoElement,
  reader: ZXingReader
): Promise<string | null> {
  if (videoEl.readyState < 2 || videoEl.videoWidth === 0) return null
  canvas.width  = videoEl.videoWidth
  canvas.height = videoEl.videoHeight
  ctx.drawImage(videoEl, 0, 0)
  try {
    const zx = await import('@zxing/library')
    const source = new zx.HTMLCanvasElementLuminanceSource(canvas)
    const bmp    = new zx.BinaryBitmap(new zx.HybridBinarizer(source))
    const result = reader.decode(bmp)
    return result?.getText() ?? null
  } catch { return null }
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

    // Configurazione critica per iOS Safari
    videoEl.srcObject  = stream
    videoEl.muted      = true
    videoEl.playsInline = true

    // Aspetta che il video sia pronto (iOS emette loadedmetadata più lentamente)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timeout avvio fotocamera — verifica i permessi nelle Impostazioni iPhone.')),
        10000
      )
      const tryPlay = () => {
        clearTimeout(timeout)
        videoEl.play()
          .then(resolve)
          .catch(reject)
      }
      if (videoEl.readyState >= 2) { tryPlay(); return }
      videoEl.onloadedmetadata = tryPlay
      videoEl.onerror = () => { clearTimeout(timeout); reject(new Error('Errore stream video')) }
    })

    const nativeDetector = await getNativeDetector()

    if (nativeDetector) {
      // ── BarcodeDetector nativo (Chrome/Edge) ──────────────────────────────
      const tick = async () => {
        if (stopped) return
        try {
          if (videoEl.readyState >= 2) {
            const hits = await nativeDetector.detect(videoEl)
            if (hits[0]?.rawValue) { onDetect(hits[0].rawValue); return }
          }
        } catch { /* frame non decodificabile */ }
        rafId = requestAnimationFrame(tick)
      }
      tick()

    } else {
      // ── ZXing canvas polling (Safari / Firefox) ────────────────────────────
      const zxingReader = await makeZxingReader()
      if (!zxingReader) {
        onError?.(new Error('Libreria barcode non disponibile.'))
        return () => { stopped = true }
      }

      const canvas = document.createElement('canvas')
      const ctx    = canvas.getContext('2d')!
      // Poll ogni ~150ms (6-7 fps) — sufficiente per barcode, non drena la batteria
      let lastTime = 0
      const INTERVAL = 150

      const tick = (now: number) => {
        if (stopped) return
        rafId = requestAnimationFrame(tick)
        if (now - lastTime < INTERVAL) return
        lastTime = now
        decodeFrame(canvas, ctx, videoEl, zxingReader).then(code => {
          if (code && !stopped) { onDetect(code) }
        })
      }
      rafId = requestAnimationFrame(tick)
    }

  } catch (e) {
    onError?.(e as Error)
  }

  // Stop: pausa stream senza rilasciarlo → iOS non chiede nuovamente il permesso
  return () => {
    stopped = true
    if (rafId !== null) cancelAnimationFrame(rafId)
    videoEl.pause()
    videoEl.srcObject = null
  }
}

export function stopScanner() {
  releaseStream()
}

// ── Product lookup ────────────────────────────────────────────────────────────

export interface ProductInfo {
  name:        string
  brand:       string
  category:    string
  imageUrl:    string
  barcode:     string
  found:       boolean
  weightValue: number | null
  weightUnit:  string | null
}

function parseQuantityString(raw: string | null | undefined): { val: number | null; unit: string | null } {
  if (!raw) return { val: null, unit: null }
  const s = raw.toLowerCase().replace(',', '.').trim()

  const m = s.match(/^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|cl|mg|pz|oz|lb)\b/)
  if (m) {
    let val  = parseFloat(m[1])
    let unit = m[2]
    if (unit === 'oz') { val = parseFloat((val * 28.35).toFixed(1)); unit = 'g' }
    if (unit === 'lb') { val = parseFloat((val * 0.4536).toFixed(3)); unit = 'kg' }
    return { val, unit }
  }
  const multi = s.match(/^(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(g|kg|ml|l|cl|mg)/)
  if (multi) return { val: parseInt(multi[1]), unit: 'pz' }
  return { val: null, unit: null }
}

const empty = (barcode: string): ProductInfo => ({
  name:'', brand:'', category:'', imageUrl:'', barcode, found:false,
  weightValue: null, weightUnit: null,
})

async function fetchOFF(barcode: string, host = 'world'): Promise<ProductInfo | null> {
  try {
    const url = `https://${host}.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=product_name,product_name_it,brands,categories_tags,image_front_small_url,quantity,product_quantity`
    const res  = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== 1 || !data.product) return null

    const p    = data.product
    const name = (p.product_name_it || p.product_name || '').trim()
    if (!name) return null

    const catTag: string = (p.categories_tags as string[] ?? [])
      .find((t: string) => t.startsWith('it:')) ?? (p.categories_tags as string[])?.[0] ?? ''

    const { val: weightValue, unit: weightUnit } =
      parseQuantityString(p.quantity ?? p.product_quantity)

    return {
      name,
      brand:    (p.brands || '').split(',')[0].trim(),
      category: catTag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '),
      imageUrl: p.image_front_small_url || '',
      barcode, found: true, weightValue, weightUnit,
    }
  } catch { return null }
}

async function fetchUpcItemDb(barcode: string): Promise<ProductInfo | null> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      { signal: AbortSignal.timeout(7000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const item = data?.items?.[0]
    if (!item) return null
    const wm = (item.title ?? '').toLowerCase().match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l|cl|mg)\b/)
    return {
      name:        item.title    || '',
      brand:       item.brand    || '',
      category:    item.category || '',
      imageUrl:    item.images?.[0] || '',
      barcode, found: true,
      weightValue: wm ? parseFloat(wm[1]) : null,
      weightUnit:  wm ? wm[2] : null,
    }
  } catch { return null }
}

export async function lookupBarcode(barcode: string): Promise<ProductInfo> {
  const world = await fetchOFF(barcode, 'world')
  if (world) return world
  const it = await fetchOFF(barcode, 'it')
  if (it) return it
  const upc = await fetchUpcItemDb(barcode)
  if (upc) return upc
  return empty(barcode)
}
