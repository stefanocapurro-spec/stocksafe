/**
 * StockSafe – Generazione Checklist Deposito
 *
 * Logica numerazione:
 *   - Articoli ordinati per nome (case-insensitive)
 *   - Stessi nomi raggruppati: sub-lettera a,b,c... per scadenza crescente
 *     es. "Ziti" con 2 scadenze → 5a (più vicina), 5b (successiva)
 *   - Articolo unico per nome → numero semplice es. "5"
 */

import type { ItemDecrypted, Category } from '../stores/inventoryStore'
import type { Location }               from '../stores/locationStore'

export interface ChecklistRow {
  progressive: string      // "1", "2a", "2b", ...
  name:        string
  brand:       string
  quantity:    number
  unit:        string
  category:    string
  expiryDate:  string      // "gg/mm/aaaa" o "—"
  // checkmark e note sono campi vuoti da compilare a mano
}

export interface ChecklistData {
  location:    Location
  generatedAt: string
  rows:        ChecklistRow[]
}

// ── Costruisce le righe ordinate con numerazione n.a/n.b ─────────────────────

export function buildChecklist(
  items:      ItemDecrypted[],
  categories: Category[],
  location:   Location
): ChecklistData {
  const catMap = new Map(categories.map(c => [c.id, c.name]))

  // 1. Ordina per nome (case-insensitive), a parità per scadenza crescente
  const sorted = [...items].sort((a, b) => {
    const n = a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
    if (n !== 0) return n
    // Stessi nomi → scadenza crescente (null in fondo)
    if (!a.expiryDate && !b.expiryDate) return 0
    if (!a.expiryDate) return 1
    if (!b.expiryDate) return -1
    return a.expiryDate.localeCompare(b.expiryDate)
  })

  // 2. Identifica raggruppamenti per nome
  const nameCount = new Map<string, number>()
  for (const i of sorted) {
    const key = i.name.toLowerCase().trim()
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1)
  }

  // 3. Assegna progressivi
  let baseNum = 0
  let prevKey = ''
  let subIdx  = 0
  const rows: ChecklistRow[] = []

  for (const item of sorted) {
    const key = item.name.toLowerCase().trim()
    const count = nameCount.get(key) ?? 1

    if (key !== prevKey) {
      baseNum++
      subIdx = 0
      prevKey = key
    } else {
      subIdx++
    }

    const progressive = count > 1
      ? `${baseNum}${String.fromCharCode(97 + subIdx)}`   // 97 = 'a'
      : `${baseNum}`

    const expiry = item.expiryDate
      ? new Date(item.expiryDate).toLocaleDateString('it-IT')
      : '—'

    rows.push({
      progressive,
      name:       item.name,
      brand:      item.brand || '',
      quantity:   item.quantity,
      unit:       item.unit,
      category:   catMap.get(item.categoryId ?? '') ?? '—',
      expiryDate: expiry,
    })
  }

  return {
    location,
    generatedAt: new Date().toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }),
    rows,
  }
}

// ── Export Excel (.xlsx) via SheetJS ─────────────────────────────────────────

export async function exportXlsx(data: ChecklistData): Promise<void> {
  const XLSX = await import('xlsx')

  const HEADERS = ['#', 'Prodotto', 'Marca', 'Qtà', 'U.M.', 'Categoria', 'Scadenza', '✓ Integrità', 'Note']

  const sheetData = [
    HEADERS,
    ...data.rows.map(r => [
      r.progressive, r.name, r.brand, r.quantity, r.unit, r.category, r.expiryDate, '', '',
    ]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(sheetData)

  // Larghezze colonne
  ws['!cols'] = [
    { wch: 6 },   // #
    { wch: 30 },  // Prodotto
    { wch: 18 },  // Marca
    { wch: 8 },   // Qtà
    { wch: 7 },   // U.M.
    { wch: 18 },  // Categoria
    { wch: 13 },  // Scadenza
    { wch: 14 },  // Integrità
    { wch: 28 },  // Note
  ]

  // Stile intestazione (sfondo scuro, testo bianco)
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (!cell) continue
    cell.s = {
      font:      { bold: true, color: { rgb: 'FFFFFF' } },
      fill:      { fgColor: { rgb: '111827' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        bottom: { style: 'medium', color: { rgb: 'D97706' } },
      },
    }
  }

  // Bordi e altezza righe dati
  for (let r = 1; r <= data.rows.length; r++) {
    const isEven = r % 2 === 0
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      if (!ws[addr]) ws[addr] = { t: 's', v: '' }
      ws[addr].s = {
        fill:      { fgColor: { rgb: isEven ? 'F9FAFB' : 'FFFFFF' } },
        alignment: { vertical: 'center', wrapText: true },
        border: {
          top:    { style: 'thin', color: { rgb: 'E5E7EB' } },
          bottom: { style: 'thin', color: { rgb: 'E5E7EB' } },
          left:   { style: 'thin', color: { rgb: 'E5E7EB' } },
          right:  { style: 'thin', color: { rgb: 'E5E7EB' } },
        },
      }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, data.location.name.slice(0, 31))

  // Metadati foglio
  wb.Props = {
    Title:   `Checklist ${data.location.name}`,
    Subject: 'StockSafe – Controllo Inventario',
    Author:  'StockSafe',
    CreatedDate: new Date(),
  }

  const filename = `checklist-${data.location.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0,10)}.xlsx`
  XLSX.writeFile(wb, filename, { bookSST: false, type: 'binary', cellStyles: true })
}

// ── Export Word (.docx) ───────────────────────────────────────────────────────

export async function exportDocx(data: ChecklistData): Promise<void> {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, WidthType, ShadingType, PageNumber,
    Header, Footer, HeadingLevel,
  } = await import('docx')

  const C = {
    nero: '111827', bianco: 'FFFFFF', ambra: 'D97706',
    grigio: 'F9FAFB', bordo: 'E5E7EB', testo: '374151',
  }

  const brd = (col = C.bordo) => ({ style: BorderStyle.SINGLE, size: 1, color: col })
  const borders = (col?: string) => ({ top: brd(col), bottom: brd(col), left: brd(col), right: brd(col) })

  const COLS = ['#', 'Prodotto', 'Marca/Brand', 'Qtà', 'U.M.', 'Categoria', 'Scadenza', '✓ Integr.', 'Note']
  const WIDTHS = [600, 2200, 1600, 700, 600, 1500, 1100, 1100, 2100]   // dxa totale ~11500

  const makeCell = (text: string, isHeader = false, isEven = false): typeof TableCell.prototype => {
    return new TableCell({
      borders: borders(isHeader ? C.ambra : C.bordo),
      width: { size: 0, type: WidthType.AUTO },
      shading: { type: ShadingType.CLEAR, fill: isHeader ? C.nero : isEven ? C.grigio : C.bianco },
      margins: { top: 60, bottom: 60, left: 100, right: 60 },
      children: [new Paragraph({
        children: [new TextRun({
          text,
          font: 'Arial', size: isHeader ? 18 : 19,
          bold: isHeader,
          color: isHeader ? C.bianco : C.testo,
        })],
        alignment: AlignmentType.LEFT,
      })],
    })
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: COLS.map(h => makeCell(h, true)),
  })

  const dataRows = data.rows.map((r, idx) => {
    const isEven = idx % 2 === 1
    const cells = [
      r.progressive, r.name, r.brand, String(r.quantity), r.unit,
      r.category, r.expiryDate, '', '',
    ]
    return new TableRow({ children: cells.map(c => makeCell(c, false, isEven)) })
  })

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  })

  const doc = new Document({
    creator: 'StockSafe',
    title: `Checklist ${data.location.name}`,
    sections: [{
      properties: {
        page: {
          size: { width: 16838, height: 11906, orientation: 'landscape' as const },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      headers: { default: new Header({ children: [new Paragraph({
        children: [
          new TextRun({ text: `${data.location.icon}  ${data.location.name}`, font:'Arial', size:24, bold:true, color:C.ambra }),
          new TextRun({ text: `   —   Checklist di controllo   —   Generata il ${data.generatedAt}`, font:'Arial', size:18, color:'6B7280' }),
        ],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.ambra, space: 6 } },
      })] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        children: [
          new TextRun({ text: 'Pagina ', font:'Arial', size:16, color:'6B7280' }),
          new TextRun({ children: [PageNumber.CURRENT], font:'Arial', size:16, color:'6B7280' }),
          new TextRun({ text: ` di `, font:'Arial', size:16, color:'6B7280' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font:'Arial', size:16, color:'6B7280' }),
          new TextRun({ text: `     ${data.rows.length} articoli     StockSafe`, font:'Arial', size:16, color:'6B7280' }),
        ],
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB', space: 4 } },
      })] }) },
      children: [
        new Paragraph({
          children: [new TextRun({ text: `Controllo inventario — ${data.location.name}`, font:'Arial', size:28, bold:true, color:C.nero })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Data controllo: ______________________     Controllato da: ______________________     Firma: ______________________`, font:'Arial', size:18, color:'6B7280' })],
          spacing: { after: 300 },
        }),
        table,
        new Paragraph({
          children: [new TextRun({ text: 'Legenda: ✓ = confezione integra  ✗ = confezione danneggiata  ? = da verificare', font:'Arial', size:16, color:'6B7280' })],
          spacing: { before: 200 },
        }),
      ],
    }],
    styles: { default: { document: { run: { font: 'Arial' } } } },
  })

  const bufRaw = await Packer.toBuffer(doc)
  const buf = new Uint8Array(bufRaw)
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `checklist-${data.location.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0,10)}.docx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
