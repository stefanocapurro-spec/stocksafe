/**
 * StockSafe – Importazione / Esportazione JSON
 */

export interface BackupItem {
  name: string
  barcode?: string
  brand?: string
  notes?: string
  purchasePrice?: number
  quantity: number
  unit: string
  categoryName?: string
  purchaseDate?: string | null
  expiryDate?: string | null
}

export interface BackupFile {
  version: 1
  exported: string
  appName: 'StockSafe'
  itemCount: number
  items: BackupItem[]
}

export interface ImportResult {
  imported: number
  skipped:  number
  errors:   string[]
  warnings: string[]
}

// ── Validazione ──────────────────────────────────────────────────────────────

export type ParseResult =
  | { ok: true;  data: BackupFile; warnings: string[] }
  | { ok: false; error: string }

export function parseBackupFile(raw: unknown): ParseResult {
  const warnings: string[] = []

  if (typeof raw !== 'object' || raw === null)
    return { ok: false, error: 'File non valido: non è un oggetto JSON.' }

  const obj = raw as Record<string, unknown>

  if (obj.version !== undefined && obj.version !== 1)
    return { ok: false, error: `Versione backup non supportata: ${obj.version}.` }

  if (!Array.isArray(obj.items))
    return { ok: false, error: 'File non valido: campo "items" mancante o non è un array.' }

  if (obj.items.length === 0)
    return { ok: false, error: 'Il file non contiene articoli da importare.' }

  const rawItems = obj.items as unknown[]

  if (rawItems.length > 5000) {
    warnings.push(`Il file contiene ${rawItems.length} articoli. Vengono importati al massimo 5000.`)
    rawItems.splice(5000)
  }

  const validItems: BackupItem[] = []
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i] as Record<string, unknown>
    if (!item || typeof item !== 'object') { warnings.push(`Riga ${i + 1}: non è un oggetto, ignorata.`); continue }
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) { warnings.push(`Riga ${i + 1}: nome mancante, ignorata.`); continue }

    validItems.push({
      name:          name.slice(0, 200),
      barcode:       typeof item.barcode === 'string'  ? item.barcode.trim()  : undefined,
      brand:         typeof item.brand === 'string'    ? item.brand.trim()    : undefined,
      notes:         typeof item.notes === 'string'    ? item.notes.trim()    : undefined,
      purchasePrice: typeof item.purchasePrice === 'number' ? item.purchasePrice : undefined,
      quantity:      typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
      unit:          typeof item.unit === 'string'     ? item.unit.trim()     : 'pz',
      categoryName:  typeof item.categoryName === 'string' ? item.categoryName.trim()
                   : typeof item.category === 'string'     ? (item.category as string).trim()
                   : undefined,
      purchaseDate:  isISODate(item.purchaseDate)  ? String(item.purchaseDate)  : null,
      expiryDate:    isISODate(item.expiryDate)    ? String(item.expiryDate)    : null,
    })
  }

  if (validItems.length === 0)
    return { ok: false, error: 'Nessun articolo valido trovato nel file.' }

  return {
    ok: true,
    warnings,
    data: {
      version: 1,
      appName: 'StockSafe',
      exported: typeof obj.exported === 'string' ? obj.exported : new Date().toISOString(),
      itemCount: validItems.length,
      items: validItems,
    },
  }
}

function isISODate(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)
}

// ── Lettura file ──────────────────────────────────────────────────────────────

export function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!file.name.endsWith('.json') && file.type !== 'application/json')
      return reject(new Error('Il file deve essere in formato .json'))
    if (file.size > 10 * 1024 * 1024)
      return reject(new Error('File troppo grande (max 10 MB).'))
    const reader = new FileReader()
    reader.onload = (e) => {
      try { resolve(JSON.parse(String(e.target?.result ?? '{}'))) }
      catch { reject(new Error('File JSON non valido: controlla il formato.')) }
    }
    reader.onerror = () => reject(new Error('Errore di lettura del file.'))
    reader.readAsText(file)
  })
}

// ── Importazione ──────────────────────────────────────────────────────────────

export async function runImport(
  items: BackupItem[],
  insertOne: (item: BackupItem) => Promise<void>,
  onProgress?: (done: number, total: number) => void
): Promise<Omit<ImportResult, 'warnings'>> {
  const result = { imported: 0, skipped: 0, errors: [] as string[] }
  for (let i = 0; i < items.length; i++) {
    try {
      await insertOne(items[i])
      result.imported++
    } catch (e) {
      result.skipped++
      if (result.errors.length < 10)
        result.errors.push(`"${items[i].name}": ${(e as Error).message}`)
    }
    onProgress?.(i + 1, items.length)
  }
  return result
}
