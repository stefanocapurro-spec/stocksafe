/**
 * UnassignedPage – "Da assegnare"
 * Articoli senza deposito. Supporta:
 *  - selezione multipla con checkbox
 *  - drag & drop verso i depositi (desktop)
 *  - bottone "Sposta in..." per mobile
 */
import { useState, useMemo, useRef } from 'react'
import { useNavigate }        from 'react-router-dom'
import { useInventoryStore }  from '../stores/inventoryStore'
import { useLocationStore }   from '../stores/locationStore'
import type { ItemDecrypted } from '../stores/inventoryStore'

export function UnassignedPage() {
  const { items, moveItems, loading }    = useInventoryStore()
  const { locations, setActiveLocation } = useLocationStore()
  const navigate                         = useNavigate()

  const unassigned = useMemo(() =>
    [...items.filter(i => !i.locationId)]
      .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }))
  , [items])

  // ── Selezione multipla ─────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastClicked, setLastClicked] = useState<string | null>(null)

  const toggleSelect = (id: string, shiftKey = false) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (shiftKey && lastClicked) {
        // Seleziona range
        const ids = unassigned.map(i => i.id)
        const from = ids.indexOf(lastClicked)
        const to   = ids.indexOf(id)
        const [lo, hi] = from < to ? [from, to] : [to, from]
        for (let k = lo; k <= hi; k++) next.add(ids[k])
      } else {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      }
      return next
    })
    setLastClicked(id)
  }

  const selectAll   = () => setSelected(new Set(unassigned.map(i => i.id)))
  const deselectAll = () => setSelected(new Set())
  const selectedArr = Array.from(selected)

  // ── Sposta items selezionati ───────────────────────────────────────────────
  const [showMovePanel, setShowMovePanel] = useState(false)
  const [moving, setMoving] = useState(false)

  const handleMove = async (locationId: string | null) => {
    const ids = selectedArr.length > 0 ? selectedArr : unassigned.map(i => i.id)
    setMoving(true)
    await moveItems(ids, locationId)
    setMoving(false)
    setSelected(new Set())
    setShowMovePanel(false)
    if (locationId) {
      setActiveLocation(locationId)
      navigate('/inventory')
    }
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const draggingIds = useRef<string[]>([])
  const [dragOver, setDragOver] = useState<string | null>(null)   // locationId

  const handleDragStart = (e: React.DragEvent, item: ItemDecrypted) => {
    // Se l'item è tra i selezionati, trascina tutti i selezionati; altrimenti solo questo
    const ids = selected.has(item.id) && selectedArr.length > 0
      ? selectedArr
      : [item.id]
    draggingIds.current = ids
    e.dataTransfer.setData('text/plain', ids.join(','))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDropOnLocation = async (e: React.DragEvent, locationId: string) => {
    e.preventDefault()
    setDragOver(null)
    const ids = draggingIds.current.length > 0
      ? draggingIds.current
      : (e.dataTransfer.getData('text/plain') || '').split(',').filter(Boolean)
    if (!ids.length) return
    await moveItems(ids, locationId)
    setSelected(new Set())
    setActiveLocation(locationId)
  }

  const today  = new Date().toISOString().slice(0, 10)
  const fmtCur = (v: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v)

  return (
    <div className="page-container" style={{ paddingTop: 20 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>←</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.3rem' }}>📋 Da assegnare</h2>
          <p style={{ fontSize: '0.76rem', marginTop: 2 }}>
            {unassigned.length} articoli senza deposito
          </p>
        </div>
      </div>

      {/* ── Zona drop depositi (sempre visibile se ci sono items) ── */}
      {unassigned.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8,
            textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>
            Trascina qui per assegnare al deposito
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {locations.map(loc => (
              <div key={loc.id}
                onDragOver={e => { e.preventDefault(); setDragOver(loc.id) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => handleDropOnLocation(e, loc.id)}
                style={{
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '10px 16px', borderRadius: 'var(--radius-md)',
                  border: `2px dashed ${dragOver === loc.id ? loc.color : loc.color + '50'}`,
                  background: dragOver === loc.id ? `${loc.color}20` : `${loc.color}08`,
                  transition: 'all 0.15s', cursor: 'copy',
                  transform: dragOver === loc.id ? 'scale(1.04)' : 'scale(1)',
                }}>
                <span style={{ fontSize: '1.2rem' }}>{loc.icon}</span>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: loc.color }}>{loc.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Barra selezione ── */}
      {unassigned.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm"
            onClick={selected.size === unassigned.length ? deselectAll : selectAll}>
            {selected.size === unassigned.length ? '☑ Deseleziona tutti' : '☐ Seleziona tutti'}
          </button>
          {selected.size > 0 && (
            <>
              <span className="badge badge-accent">{selected.size} selezionati</span>
              <button className="btn btn-primary btn-sm"
                onClick={() => setShowMovePanel(true)}>
                📍 Sposta in...
              </button>
              <button className="btn btn-ghost btn-sm"
                style={{ color: 'var(--text-muted)' }} onClick={deselectAll}>
                ✕
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Lista articoli ── */}
      {unassigned.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ fontSize: '3rem', marginBottom: 16 }}>✅</p>
          <h3 style={{ marginBottom: 8 }}>Tutti gli articoli sono assegnati</h3>
          <p>Non ci sono articoli senza deposito.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {unassigned.map(item => {
            const isExpired = item.expiryDate ? item.expiryDate < today : false
            const daysLeft  = item.expiryDate
              ? Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000)
              : null
            const isSelected = selected.has(item.id)

            return (
              <div key={item.id}
                draggable
                onDragStart={e => handleDragStart(e, item)}
                className="card fade-in"
                onClick={e => toggleSelect(item.id, e.shiftKey)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  cursor: 'grab', transition: 'all 0.15s',
                  borderColor: isSelected ? 'var(--accent)' : isExpired ? 'rgba(239,68,68,.3)' : 'var(--border)',
                  background: isSelected ? 'var(--accent-glow)' : 'var(--bg-surface)',
                  boxShadow: isSelected ? '0 0 0 1px var(--accent)' : 'none',
                }}>

                {/* Checkbox */}
                <div style={{ flexShrink: 0, paddingTop: 2 }}
                  onClick={e => { e.stopPropagation(); toggleSelect(item.id, e.shiftKey) }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 4, border: `2px solid`,
                    borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s', flexShrink: 0,
                  }}>
                    {isSelected && <span style={{ color: '#000', fontSize: '0.7rem', fontWeight: 800 }}>✓</span>}
                  </div>
                </div>

                {/* Drag handle */}
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', paddingTop: 2,
                  cursor: 'grab', flexShrink: 0, userSelect: 'none' }}>⠿</span>

                {/* Info articolo */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.name}</span>
                    {isExpired && <span className="badge badge-red">Scaduto</span>}
                    {!isExpired && daysLeft !== null && daysLeft <= 7 && (
                      <span className="badge badge-accent">{daysLeft}gg</span>
                    )}
                  </div>
                  {item.brand && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 3 }}>{item.brand}</div>}
                  <div style={{ display: 'flex', gap: 10, fontSize: '0.76rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                    <span className="mono">{item.quantity} {item.unit}</span>
                    {item.expiryDate && <span>Scade: <span className="mono">{item.expiryDate}</span></span>}
                    {item.totalValue > 0 && <span style={{ color: 'var(--green)' }}>{fmtCur(item.totalValue)}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal "Sposta in..." ── */}
      {showMovePanel && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 200, padding: '0 0 env(safe-area-inset-bottom,0)',
        }}
          onClick={() => setShowMovePanel(false)}>
          <div className="card fade-in"
            style={{ width: '100%', maxWidth: 480, borderRadius: '20px 20px 0 0',
              borderBottom: 'none', padding: 24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
              Sposta {selectedArr.length} {selectedArr.length === 1 ? 'articolo' : 'articoli'} in...
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 18 }}>
              Tocca un deposito per assegnare gli articoli selezionati.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {locations.map(loc => (
                <button key={loc.id}
                  className="btn btn-ghost"
                  disabled={moving}
                  onClick={() => handleMove(loc.id)}
                  style={{
                    justifyContent: 'flex-start', gap: 12,
                    border: `1.5px solid ${loc.color}40`,
                    background: `${loc.color}10`,
                  }}>
                  {moving
                    ? <span className="spinner" style={{ width: 16, height: 16 }} />
                    : <span style={{ fontSize: '1.3rem' }}>{loc.icon}</span>}
                  <span style={{ fontWeight: 700, color: loc.color }}>{loc.name}</span>
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-full" style={{ marginTop: 12 }}
              onClick={() => setShowMovePanel(false)}>
              Annulla
            </button>
          </div>
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  )
}
