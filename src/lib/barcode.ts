/**
 * Barcode Scanner – ZXing + Open Food Facts API
 */

import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library'

let reader: BrowserMultiFormatReader | null = null

export async function startScanner(
  videoEl: HTMLVideoElement,
  onDetect: (code: string) => void,
  onError?: (err: Error) => void
): Promise<() => void> {
  if (!reader) reader = new BrowserMultiFormatReader()

  try {
    const devices = await reader.listVideoInputDevices()
    // Preferisce la fotocamera posteriore
    const device = devices.find((d: MediaDeviceInfo) =>
      d.label.toLowerCase().includes('back') ||
      d.label.toLowerCase().includes('rear') ||
      d.label.toLowerCase().includes('environment')
    ) || devices[0]

    const deviceId = device?.deviceId

    reader.decodeFromVideoDevice(deviceId ?? null, videoEl, (result, err) => {
      if (result) {
        onDetect(result.getText())
      } else if (err && !(err instanceof NotFoundException)) {
        onError?.(err as Error)
      }
    })
  } catch (e) {
    onError?.(e as Error)
  }

  return () => {
    reader?.reset()
    reader = null
  }
}

export function stopScanner() {
  reader?.reset()
  reader = null
}

// ── Open Food Facts lookup ──────────────────────────────────────────────────

export interface ProductInfo {
  name: string
  brand: string
  category: string
  imageUrl: string
  barcode: string
  found: boolean
}

export async function lookupBarcode(barcode: string): Promise<ProductInfo> {
  const base: ProductInfo = { name: '', brand: '', category: '', imageUrl: '', barcode, found: false }

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=product_name,brands,categories_tags,image_front_small_url`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return base
    const data = await res.json()
    if (data.status !== 1 || !data.product) return base

    const p = data.product
    const category = (p.categories_tags?.[0] ?? '')
      .replace(/^[a-z]{2}:/, '')
      .replace(/-/g, ' ')

    return {
      name: p.product_name || '',
      brand: p.brands || '',
      category,
      imageUrl: p.image_front_small_url || '',
      barcode,
      found: true,
    }
  } catch {
    return base
  }
}
