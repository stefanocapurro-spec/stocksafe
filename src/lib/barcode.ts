/**
 * StockSafe – Barcode Scanner v3
 *
 * Scanner:
 *  1. getUserMedia (stream cached → nessun repermesso)
 *  2. BarcodeDetector nativo (Chrome 83+/Edge) se disponibile → più veloce
 *  3. Fallback: ZXing decodeContinuously (Firefox, Safari)
 *
 * Lookup prodotto (cascata):
 *  1. Open Food Facts world → campi estesi (nome, brand, categoria, peso/volume, immagine)
 *  2. Open Food Facts IT    → endpoint italiano per prodotti locali
 *  3. UPC Item DB           → fallback per prodotti non-food
 */

// ── Stream caching ────────────────────────────────────────────────────────────

let cachedStream: MediaStream | null = null

async function getStream(): Promise<MediaStream> {
  if (cachedStream?.active) return cachedStream
  cachedStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width:  { ideal: 1280 },
      height: { ideal: 720 },
    },
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

// ── Scanner principale ────────────────────────────────────────────────────────

export async function startScanner(
  videoEl: HTMLVideoElement,
  onDetect: (code: string) => void,
  onError?: (err: Error) => void
): Promise<() => void> {
  let stopped = false
  let rafId: number | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let zxingReader: any = null

  try {
    const stream = await getStream()

    // Attacca stream e aspetta che il video sia pronto
    videoEl.srcObject = stream
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout avvio fotocamera (8s)')), 8000)
      videoEl.onloadedmetadata = () => {
        clearTimeout(timeout)
        videoEl.play().then(resolve).catch(reject)
      }
      videoEl.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Errore caricamento video'))
      }
    })

    const nativeDetector = await getNativeDetector()

    if (nativeDetector) {
      // ── Percorso 1: BarcodeDetector nativo ──────────────────────────────
      const tick = async () => {
        if (stopped) return
        try {
          if (videoEl.readyState >= 2) {
            const hits = await nativeDetector.detect(videoEl)
            if (hits[0]?.rawValue) {
              onDetect(hits[0].rawValue)
              return
            }
          }
        } catch { /* frame non decodificabile */ }
        rafId = requestAnimationFrame(tick)
      }
      tick()

    } else {
      // ── Percorso 2: ZXing decodeContinuously ────────────────────────────
      const { BrowserMultiFormatReader } = await import('@zxing/library')
      zxingReader = new BrowserMultiFormatReader()

      zxingReader.decodeContinuously(videoEl, (result: unknown, err: unknown) => {
        if (stopped) return
        if (result) {
          const r = result as { getText(): string }
          const code = r.getText()
          if (code) onDetect(code)
        }
        void err
      })
    }

  } catch (e) {
    onError?.(e as Error)
  }

  // Stop: mette in pausa ma NON rilascia lo stream → permesso non richiesto di nuovo
  return () => {
    stopped = true
    if (rafId !== null) cancelAnimationFrame(rafId)
    if (zxingReader) {
      try { zxingReader.stopContinuousDecode() } catch { /* già fermo */ }
      try { zxingReader.reset() } catch { /* già resettato */ }
    }
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
  // Peso / volume estratti dal packaging
  weightValue: number | null   // valore numerico
  weightUnit:  string | null   // unità: g, kg, ml, l, cl, mg, pz
}

/** Converte la stringa "quantity" di Open Food Facts in valore + unità */
function parseQuantityString(raw: string | null | undefined): { val: number | null; unit: string | null } {
  if (!raw) return { val: null, unit: null }
  const s = raw.toLowerCase().replace(',', '.').trim()

  // Pattern principale: "500 g", "1.5 kg", "250 ml", "1 l", "33 cl", "200 mg"
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|cl|mg|pz|oz|lb)\b/)
  if (m) {
    let val  = parseFloat(m[1])
    let unit = m[2]
    if (unit === 'oz') { val = parseFloat((val * 28.35).toFixed(1)); unit = 'g' }
    if (unit === 'lb') { val = parseFloat((val * 0.4536).toFixed(3)); unit = 'kg' }
    return { val, unit }
  }

  // Pattern multiplo: "6 x 33 cl" → 6 pz
  const multi = s.match(/^(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(g|kg|ml|l|cl|mg)/)
  if (multi) return { val: parseInt(multi[1]), unit: 'pz' }

  return { val: null, unit: null }
}

const empty = (barcode: string): ProductInfo => ({
  name:'', brand:'', category:'', imageUrl:'', barcode, found:false,
  weightValue: null, weightUnit: null,
})

/** Open Food Facts – endpoint configurabile */
async function fetchOFF(barcode: string, host = 'world'): Promise<ProductInfo | null> {
  try {
    const url = `https://${host}.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=product_name,product_name_it,brands,categories_tags,image_front_small_url,quantity,product_quantity,product_quantity_unit`
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== 1 || !data.product) return null

    const p    = data.product
    const name = (p.product_name_it || p.product_name || '').trim()
    if (!name) return null

    const catTag: string = (p.categories_tags as string[] ?? [])
      .find((t: string) => t.startsWith('it:')) ?? (p.categories_tags as string[])?.[0] ?? ''
    const category = catTag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')

    const { val: weightValue, unit: weightUnit } =
      parseQuantityString(p.quantity ?? p.product_quantity)

    return {
      name, brand: (p.brands || '').split(',')[0].trim(),
      category, imageUrl: p.image_front_small_url || '',
      barcode, found: true, weightValue, weightUnit,
    }
  } catch { return null }
}

/** UPC Item DB – fallback gratuito, no API key */
async function fetchUpcItemDb(barcode: string): Promise<ProductInfo | null> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const item = data?.items?.[0]
    if (!item) return null

    const titleLower: string = (item.title ?? '').toLowerCase()
    const wm = titleLower.match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l|cl|mg)\b/)
    const weightValue = wm ? parseFloat(wm[1]) : null
    const weightUnit  = wm ? wm[2] : null

    return {
      name:        item.title    || '',
      brand:       item.brand    || '',
      category:    item.category || '',
      imageUrl:    item.images?.[0] || '',
      barcode, found: true,
      weightValue, weightUnit,
    }
  } catch { return null }
}

/**
 * Lookup barcode: cascata su più sorgenti.
 * 1. Open Food Facts world
 * 2. Open Food Facts IT
 * 3. UPC Item DB
 */
export async function lookupBarcode(barcode: string): Promise<ProductInfo> {
  const world = await fetchOFF(barcode, 'world')
  if (world) return world

  const it = await fetchOFF(barcode, 'it')
  if (it) return it

  const upc = await fetchUpcItemDb(barcode)
  if (upc) return upc

  return empty(barcode)
}
