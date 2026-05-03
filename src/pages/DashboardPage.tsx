import { useMemo } from 'react'
import { useNavigate }       from 'react-router-dom'
import { useAuthStore }      from '../stores/authStore'
import { useInventoryStore } from '../stores/inventoryStore'
import { useLocationStore }  from '../stores/locationStore'

export function DashboardPage() {
  const { user }                           = useAuthStore()
  const { items, categories }              = useInventoryStore()
  const { locations, setActiveLocation }   = useLocationStore()
  const navigate                           = useNavigate()

  const today   = new Date().toISOString().slice(0, 10)
  const next30  = new Date(); next30.setDate(next30.getDate() + 30)
  const n30str  = next30.toISOString().slice(0, 10)

  // ── Statistiche globali ────────────────────────────────────────────────────
  const global = useMemo(() => ({
    total:      items.length,
    totalValue: items.reduce((s, i) => s + (i.totalValue || 0), 0),
    expired:    items.filter(i => i.expiryDate && i.expiryDate < today).length,
    expiring:   items.filter(i => i.expiryDate && i.expiryDate >= today && i.expiryDate <= n30str).length,
    unassigned: items.filter(i => !i.locationId).length,
  }), [items, today, n30str])

  // ── Statistiche per deposito ───────────────────────────────────────────────
  const locStats = useMemo(() => locations.map(loc => {
    const locItems = items.filter(i => i.locationId === loc.id)
    return {
      ...loc,
      count:    locItems.length,
      value:    locItems.reduce((s, i) => s + (i.totalValue || 0), 0),
      expired:  locItems.filter(i => i.expiryDate && i.expiryDate < today).length,
      expiring: locItems.filter(i => i.expiryDate && i.expiryDate >= today && i.expiryDate <= n30str).length,
    }
  }), [locations, items, today, n30str])

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v)

  const goToLocation = (locId: string) => {
    setActiveLocation(locId)
    navigate('/inventory')
  }

  const goToUnassigned = () => {
    navigate('/unassigned')
  }

  return (
    <div className="page-container" style={{ paddingTop: 20 }}>

      {/* ── Intestazione ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 4 }}>Vista generale</div>
        <h1 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Tutti i depositi</h1>
        {user && <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{user.email}</p>}
      </div>

      {/* ── Statistiche globali ── */}
      <div className="grid-2" style={{ marginBottom: 10 }}>
        <StatCard icon="▦" label="Totale articoli"  value={global.total}               color="var(--accent)" />
        <StatCard icon="€" label="Valore complessivo" value={fmtCurrency(global.totalValue)} color="var(--green)" />
      </div>
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <StatCard icon="⏳" label="In scadenza 30gg" value={global.expiring}
          color={global.expiring > 0 ? 'var(--accent)' : 'var(--text-muted)'} />
        <StatCard icon="⚠" label="Scaduti"           value={global.expired}
          color={global.expired  > 0 ? 'var(--red)'   : 'var(--text-muted)'} />
      </div>

      {/* ── Sezione "Da assegnare" (se esistono articoli senza deposito) ── */}
      {global.unassigned > 0 && (
        <button
          onClick={goToUnassigned}
          style={{
            width: '100%', textAlign: 'left', marginBottom: 16,
            background: 'rgba(239,68,68,.07)',
            border: '1.5px dashed rgba(239,68,68,.4)',
            borderRadius: 'var(--radius-lg)', padding: '14px 16px',
            cursor: 'pointer', transition: 'all 0.18s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,.12)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,.07)')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.6rem' }}>📋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: 2 }}>
                Da assegnare
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {global.unassigned} {global.unassigned === 1 ? 'articolo non assegnato a nessun deposito' : 'articoli non assegnati a nessun deposito'}
              </div>
            </div>
            <span style={{ color: 'var(--red)', fontSize: '1.2rem' }}>›</span>
          </div>
        </button>
      )}

      {/* ── Depositi ── */}
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 12 }}>
          Depositi ({locations.length})
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {locStats.map(loc => (
            <button key={loc.id} onClick={() => goToLocation(loc.id)}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer',
                background: 'var(--bg-surface)',
                border: `1px solid var(--border)`,
                borderRadius: 'var(--radius-lg)', padding: 0,
                transition: 'all 0.18s', overflow: 'hidden',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = `${loc.color}60`
                e.currentTarget.style.boxShadow = `0 0 12px ${loc.color}20`
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.boxShadow = 'none'
              }}>

              {/* Striscia colore in cima */}
              <div style={{ height: 4, background: loc.color, width: '100%' }} />

              <div style={{ padding: '14px 16px' }}>
                {/* Header deposito */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                    background: `${loc.color}18`, border: `1px solid ${loc.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem',
                  }}>
                    {loc.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{loc.name}</div>
                    {loc.description && (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>{loc.description}</div>
                    )}
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem', flexShrink: 0 }}>›</span>
                </div>

                {/* Statistiche deposito */}
                <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <LocStat label="Articoli" value={String(loc.count)}         color="var(--text-primary)" />
                  <LocStat label="Valore"   value={fmtCurrency(loc.value)}    color="var(--green)" />
                  {loc.expiring > 0 && <LocStat label="In scad." value={String(loc.expiring)} color="var(--accent)" />}
                  {loc.expired  > 0 && <LocStat label="Scaduti"  value={String(loc.expired)}  color="var(--red)" />}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '44px 24px', marginTop: 12 }}>
          <p style={{ fontSize: '3rem', marginBottom: 16 }}>📦</p>
          <h3 style={{ marginBottom: 8 }}>Nessun articolo ancora</h3>
          <p style={{ marginBottom: 20 }}>Aggiungi il primo prodotto con il pulsante +</p>
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
        <span style={{ color, fontSize: '1rem' }}>{icon}</span>
        <span style={{ fontSize: '0.67rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  )
}

function LocStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, borderRight: '1px solid var(--border)', padding: '0 12px' }}
      className="locstat-cell">
      <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  )
}
