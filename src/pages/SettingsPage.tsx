import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useInventoryStore, type ItemPayload } from '../stores/inventoryStore'
import { useThemeStore } from '../stores/themeStore'
import { PALETTES, type ThemeMode } from '../lib/theme'
import { downloadICS } from '../lib/calendar'
import { requestNotificationPermission } from '../lib/calendar'
import { readJsonFile, parseBackupFile, runImport, type BackupItem } from '../lib/importExport'

type Tab = 'account' | 'crypto' | 'tema' | 'notifiche' | 'dati'

export function SettingsPage() {
  const { user, logout, changeCryptoPassword, loading, error, clearError, isAdmin } = useAuthStore()
  const { items, categories, addItem } = useInventoryStore()
  const { palette, mode, setPalette, setMode } = useThemeStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('account')

  // Crypto
  const [oldCrypto, setOldCrypto]     = useState('')
  const [newCrypto, setNewCrypto]     = useState('')
  const [confCrypto, setConfCrypto]   = useState('')
  const [cryptoMsg, setCryptoMsg]     = useState('')
  const [cryptoErr, setCryptoErr]     = useState('')
  const [reencCount, setReencCount]   = useState<number | null>(null)

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting]         = useState(false)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)
  const [importResult, setImportResult]   = useState<{ imported:number; skipped:number; errors:string[]; warnings:string[] } | null>(null)
  const [importError, setImportError]     = useState('')

  const [notifGranted, setNotifGranted] = useState(
    typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false
  )

  const handleCryptoChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setCryptoErr(''); setCryptoMsg(''); clearError()
    if (newCrypto !== confCrypto) { setCryptoErr('Le password non coincidono.'); return }
    if (newCrypto.length < 8)    { setCryptoErr('Minimo 8 caratteri.'); return }
    try {
      const email = user?.email ?? ''
      const { reencrypted } = await changeCryptoPassword(email, oldCrypto, newCrypto)
      setCryptoMsg(`Password aggiornata. ${reencrypted} articoli ri-cifrati.`)
      setReencCount(reencrypted)
      setOldCrypto(''); setNewCrypto(''); setConfCrypto('')
    } catch (e) { setCryptoErr((e as Error).message) }
  }

  const handleExportICS = () => {
    const today = new Date().toISOString().slice(0, 10)
    const reminders = items.filter(i => i.expiryDate && i.expiryDate >= today).map(i => {
      const d = new Date(i.expiryDate!); d.setDate(1); d.setMonth(d.getMonth() - 1)
      return { id: i.id, itemName: i.name, expiryDate: i.expiryDate!, remindDate: d.toISOString().slice(0, 10) }
    })
    if (!reminders.length) return alert('Nessuna scadenza futura da esportare.')
    downloadICS(reminders)
  }

  const handleExportJSON = () => {
    const backup = {
      version: 1,
      appName: 'StockSafe',
      exported: new Date().toISOString(),
      itemCount: items.length,
      items: items.map(i => ({
        name: i.name, barcode: i.barcode, brand: i.brand, notes: i.notes,
        purchasePrice: i.purchasePrice, quantity: i.quantity, unit: i.unit,
        categoryName: categories.find(c => c.id === i.categoryId)?.name,
        purchaseDate: i.purchaseDate, expiryDate: i.expiryDate,
      })),
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `stocksafe-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportError(''); setImportResult(null); setImportProgress(null)

    try {
      const raw = await readJsonFile(file)
      const parsed = parseBackupFile(raw)
      if (!parsed.ok) { setImportError(parsed.error); return }

      setImporting(true)

      // Mappa nomi categoria → id
      const catMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]))

      const result = await runImport(
        parsed.data.items,
        async (item: BackupItem) => {
          if (!user) throw new Error('Non autenticato')
          const payload: ItemPayload = {
            name:          item.name,
            barcode:       item.barcode,
            brand:         item.brand,
            notes:         item.notes,
            purchasePrice: item.purchasePrice,
            quantity:      item.quantity,
            unit:          item.unit as ItemPayload['unit'],
            categoryId:    item.categoryName ? catMap.get(item.categoryName.toLowerCase()) ?? null : null,
            purchaseDate:  item.purchaseDate ?? null,
            expiryDate:    item.expiryDate   ?? null,
          }
          await addItem(user.id, payload)
        },
        (done, total) => setImportProgress({ done, total })
      )

      setImportResult({ ...result, warnings: parsed.warnings })
    } catch (e) {
      setImportError((e as Error).message)
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key:'account',   label:'👤 Account' },
    { key:'crypto',    label:'🔐 Cifratura' },
    { key:'tema',      label:'🎨 Tema' },
    { key:'notifiche', label:'🔔 Notifiche' },
    { key:'dati',      label:'📤 Dati' },
  ]

  const MODES: { key: ThemeMode; label: string; icon: string }[] = [
    { key:'light', label:'Chiaro',     icon:'☀️' },
    { key:'dark',  label:'Scuro',      icon:'🌙' },
    { key:'auto',  label:'Automatico', icon:'⚙️' },
  ]

  return (
    <div className="page-container" style={{ paddingTop:24 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
        <h2>Impostazioni</h2>
        {isAdmin && (
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin')}
            style={{ color:'var(--accent)' }}>🛡 Admin</button>
        )}
      </div>

      {/* Tab nav */}
      <div style={{ display:'flex', gap:6, marginBottom:18, overflowX:'auto', paddingBottom:4 }}>
        {TABS.map(t => (
          <button key={t.key}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flexShrink:0 }} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ACCOUNT ── */}
      {tab === 'account' && (
        <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="card">
            <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.07em' }}>Account</div>
            <div style={{ fontWeight:700, fontSize:'1rem', marginBottom:3 }}>{user?.email}</div>
            <div className="mono" style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>
              ID: {user?.id?.slice(0, 16)}…
            </div>
            <div style={{ fontSize:'0.76rem', color:'var(--text-muted)', marginTop:6 }}>
              Registrato il: {user?.created_at ? new Date(user.created_at).toLocaleDateString('it-IT') : '—'}
            </div>
          </div>
          <div className="card">
            <div style={{ fontWeight:600, marginBottom:10 }}>Statistiche</div>
            {[
              ['Articoli', String(items.length)],
              ['Con scadenza', String(items.filter(i => i.expiryDate).length)],
              ['Valore totale', new Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR' })
                .format(items.reduce((s, i) => s + (i.totalValue || 0), 0))],
            ].map(([l, v]) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:'0.85rem' }}>
                <span style={{ color:'var(--text-muted)' }}>{l}</span>
                <span className="mono">{v}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-danger btn-full" onClick={logout}>Esci dall'account</button>
        </div>
      )}

      {/* ── CIFRATURA ── */}
      {tab === 'crypto' && (
        <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="alert alert-warn">
            ⚠️ In questa versione la password account È la chiave di cifratura. Cambiarla ri-cifra tutti gli articoli. Il reset via email invece invalida i dati — fai sempre un backup prima.
          </div>
          <div className="card">
            <div style={{ fontWeight:600, marginBottom:8 }}>Dettagli tecnici</div>
            {[['Algoritmo','AES-256-GCM'],['Derivazione','PBKDF2-SHA256'],['Iterazioni','600.000'],['Dove cifra','Browser (lato client)']].map(([l,v]) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:'0.82rem' }}>
                <span style={{ color:'var(--text-muted)' }}>{l}</span>
                <span className="mono" style={{ color:'var(--accent)' }}>{v}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <h3 style={{ marginBottom:14, fontSize:'0.95rem' }}>Cambia password di cifratura</h3>
            {(error || cryptoErr) && <div className="alert alert-error" style={{ marginBottom:12 }}>⚠ {error || cryptoErr}</div>}
            {cryptoMsg && (
              <div className="alert alert-success" style={{ marginBottom:12 }}>
                ✓ {cryptoMsg}
                {reencCount !== null && <><br/><small>{reencCount} articoli ri-cifrati con la nuova chiave.</small></>}
              </div>
            )}
            <form onSubmit={handleCryptoChange} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="field">
                <label>Password attuale</label>
                <input type="password" className="input" value={oldCrypto} onChange={e => setOldCrypto(e.target.value)} required autoComplete="off"/>
              </div>
              <div className="field">
                <label>Nuova password (min. 8 caratteri)</label>
                <input type="password" className="input" value={newCrypto} onChange={e => setNewCrypto(e.target.value)} required minLength={8} autoComplete="off"/>
              </div>
              <div className="field">
                <label>Conferma nuova password</label>
                <input type="password" className="input" value={confCrypto} onChange={e => setConfCrypto(e.target.value)} required minLength={8} autoComplete="off"/>
              </div>
              <div className="alert alert-info" style={{ fontSize:'0.8rem' }}>
                💡 Tutti gli articoli vengono ri-cifrati automaticamente. L'operazione può richiedere qualche secondo.
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <span className="spinner"/> : 'Aggiorna password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── TEMA ── */}
      {tab === 'tema' && (
        <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:18 }}>
          <div className="card">
            <h3 style={{ marginBottom:14, fontSize:'0.9rem' }}>Modalità</h3>
            <div className="grid-3">
              {MODES.map(m => (
                <button key={m.key} onClick={() => setMode(m.key)} style={{
                  padding:'14px 8px', borderRadius:'var(--radius-md)', border:'2px solid',
                  borderColor: mode === m.key ? 'var(--accent)' : 'var(--border)',
                  background:  mode === m.key ? 'var(--accent-glow)' : 'var(--bg-raised)',
                  cursor:'pointer', textAlign:'center', transition:'all 0.18s',
                }}>
                  <div style={{ fontSize:'1.6rem', marginBottom:6 }}>{m.icon}</div>
                  <div style={{ fontSize:'0.78rem', fontWeight:700, color: mode === m.key ? 'var(--accent)' : 'var(--text-secondary)' }}>{m.label}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom:4, fontSize:'0.9rem' }}>Palette colori</h3>
            <p style={{ fontSize:'0.8rem', marginBottom:14 }}>Scegli l'accento cromatico dell'interfaccia</p>
            <div className="grid-3" style={{ gap:10 }}>
              {PALETTES.map(p => (
                <button key={p.id} onClick={() => setPalette(p)} style={{
                  padding:'16px 8px', borderRadius:'var(--radius-md)', border:'2px solid',
                  borderColor: palette.id === p.id ? p.accent : 'var(--border)',
                  background:  palette.id === p.id ? p.accentGlow : 'var(--bg-raised)',
                  cursor:'pointer', textAlign:'center', transition:'all 0.18s',
                  boxShadow: palette.id === p.id ? `0 0 14px ${p.accentGlow}` : 'none',
                }}>
                  <div style={{ fontSize:'1.5rem', marginBottom:6 }}>{p.emoji}</div>
                  <div style={{ width:24, height:24, borderRadius:'50%', background:p.accent, margin:'0 auto 6px', border:'2px solid rgba(255,255,255,0.2)' }}/>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color: palette.id === p.id ? p.accent : 'var(--text-secondary)' }}>{p.name}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="card card-accent">
            <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.07em' }}>Anteprima</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button className="btn btn-primary btn-sm">Primario</button>
              <button className="btn btn-ghost btn-sm">Ghost</button>
              <span className="badge badge-accent">Accento</span>
              <span className="badge badge-green">Verde</span>
              <span className="badge badge-red">Rosso</span>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTIFICHE ── */}
      {tab === 'notifiche' && (
        <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="card">
            <div style={{ fontWeight:600, marginBottom:8 }}>Notifiche browser</div>
            <p style={{ fontSize:'0.85rem', marginBottom:14 }}>Ricevi notifiche per le scadenze imminenti (entro 7 giorni).</p>
            {notifGranted
              ? <div className="alert alert-success">✓ Notifiche attive</div>
              : <button className="btn btn-primary" onClick={async () => setNotifGranted(await requestNotificationPermission())}>Attiva notifiche</button>
            }
          </div>
          <div className="card">
            <div style={{ fontWeight:600, marginBottom:8 }}>Esporta scadenze nel calendario</div>
            <p style={{ fontSize:'0.85rem', marginBottom:14 }}>File .ics compatibile con Google Calendar, Apple Calendar e Outlook. Promemoria al 1° del mese precedente la scadenza.</p>
            <button className="btn btn-ghost" onClick={handleExportICS}>📅 Scarica .ics</button>
          </div>
        </div>
      )}

      {/* ── DATI ── */}
      {tab === 'dati' && (
        <div className="fade-in" style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Export JSON */}
          <div className="card">
            <div style={{ fontWeight:600, marginBottom:6 }}>💾 Esporta backup JSON</div>
            <p style={{ fontSize:'0.83rem', marginBottom:14 }}>
              Salva tutti gli articoli in un file JSON leggibile. Il file contiene dati in chiaro:
              conservalo in un posto sicuro.
            </p>
            <button className="btn btn-ghost" onClick={handleExportJSON}>
              ⬇ Scarica backup ({items.length} articoli)
            </button>
          </div>

          {/* Import JSON */}
          <div className="card">
            <div style={{ fontWeight:600, marginBottom:6 }}>📂 Importa da JSON</div>
            <p style={{ fontSize:'0.83rem', marginBottom:6 }}>
              Carica un file di backup StockSafe (.json) per reimportare gli articoli.
              Gli articoli esistenti non vengono eliminati — quelli importati si aggiungono.
            </p>
            <div className="alert alert-info" style={{ fontSize:'0.8rem', marginBottom:12 }}>
              💡 Le categorie vengono associate per nome. Se un articolo ha una categoria
              non presente, verrà importato senza categoria.
            </div>

            {importError && (
              <div className="alert alert-error" style={{ marginBottom:12 }}>⚠ {importError}</div>
            )}

            {importResult && (
              <div className="alert alert-success" style={{ marginBottom:12, flexDirection:'column', alignItems:'flex-start', gap:4 }}>
                <span>✓ Importazione completata</span>
                <span style={{ fontSize:'0.8rem' }}>
                  {importResult.imported} importati · {importResult.skipped} saltati
                </span>
                {importResult.warnings.map((w, i) => (
                  <span key={i} style={{ fontSize:'0.75rem', color:'var(--accent)' }}>⚠ {w}</span>
                ))}
                {importResult.errors.slice(0, 3).map((e, i) => (
                  <span key={i} style={{ fontSize:'0.75rem', color:'var(--red)' }}>✕ {e}</span>
                ))}
                {importResult.errors.length > 3 && (
                  <span style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>
                    ...e altri {importResult.errors.length - 3} errori
                  </span>
                )}
              </div>
            )}

            {importing && importProgress && (
              <div style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:6 }}>
                  <span>Importazione in corso...</span>
                  <span>{importProgress.done} / {importProgress.total}</span>
                </div>
                <div style={{ height:6, background:'var(--bg-raised)', borderRadius:99, overflow:'hidden' }}>
                  <div style={{
                    height:'100%', borderRadius:99,
                    background:'var(--accent)',
                    width:`${(importProgress.done / importProgress.total) * 100}%`,
                    transition:'width 0.3s',
                  }}/>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef} type="file" accept=".json,application/json"
              style={{ display:'none' }} onChange={handleImportFile}/>
            <button
              className="btn btn-ghost" disabled={importing}
              onClick={() => { setImportResult(null); setImportError(''); fileInputRef.current?.click() }}>
              {importing ? <><span className="spinner" style={{ width:16, height:16 }}/> Importazione...</> : '⬆ Scegli file .json'}
            </button>
          </div>

          <div className="alert alert-warn" style={{ fontSize:'0.82rem' }}>
            ⚠️ Il file JSON di backup contiene dati in chiaro. Conservalo in modo sicuro.
          </div>

          <div className="card">
            <div style={{ fontWeight:600, marginBottom:8 }}>Informazioni app</div>
            {[['Versione','1.2.0'],['Cifratura','AES-256-GCM'],['Backend','Supabase']].map(([l,v]) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:'0.85rem' }}>
                <span style={{ color:'var(--text-muted)' }}>{l}</span>
                <span className="mono">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ height:32 }}/>
    </div>
  )
}
