import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useInventoryStore } from '../stores/inventoryStore'

const ICONS = ['📦','🥫','💊','🔋','👕','💳','🍎','🥩','🧴','🧹','🔧','📚','🧸','💡','❄️','🌿','🐾','🎮','⚽','🎵']
const COLORS = ['#F59E0B','#EF4444','#10B981','#8B5CF6','#3B82F6','#EC4899','#06B6D4','#84CC16','#F97316','#6366F1']

export function CategoriesPage() {
  const { user } = useAuthStore()
  const { categories, items, addCategory, deleteCategory } = useInventoryStore()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('📦')
  const [color, setColor] = useState('#F59E0B')
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Inserisci un nome per la categoria.'); return }
    if (!user) return
    if (categories.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
      setError('Questa categoria esiste già.'); return
    }
    await addCategory(user.id, name.trim(), icon, color)
    setName(''); setAdding(false)
  }

  const countItems = (catId: string) => items.filter(i => i.categoryId === catId).length

  return (
    <div className="page-container" style={{ paddingTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2>Categorie</h2>
          <p style={{ fontSize: '0.8rem', marginTop: 2 }}>{categories.length} categorie</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(a => !a)}>
          {adding ? '✕ Annulla' : '+ Nuova'}
        </button>
      </div>

      {/* Form nuova categoria */}
      {adding && (
        <form onSubmit={handleAdd} className="card fade-in" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 14, fontSize: '0.9rem' }}>Nuova categoria</h3>

          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

          <div className="field" style={{ marginBottom: 12 }}>
            <label>Nome *</label>
            <input type="text" className="input" value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Es. Bevande, Snack, Pulizia casa..." autoFocus />
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label>Icona</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ICONS.map(ic => (
                <button key={ic} type="button"
                  style={{
                    width: 36, height: 36, fontSize: '1.2rem', borderRadius: 8,
                    background: icon === ic ? 'var(--amber-glow)' : 'var(--bg-raised)',
                    border: `1px solid ${icon === ic ? 'var(--amber)' : 'var(--border)'}`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  onClick={() => setIcon(ic)}>{ic}</button>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>Colore</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COLORS.map(c => (
                <button key={c} type="button"
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: `2px solid ${color === c ? '#fff' : 'transparent'}`,
                    outline: color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: 2, transition: 'all 0.15s',
                  }}
                  onClick={() => setColor(c)} />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
            padding: '10px 14px', background: 'var(--bg-base)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '1.4rem' }}>{icon}</span>
            <span style={{ fontWeight: 600, color }}>{name || 'Anteprima'}</span>
          </div>

          <button type="submit" className="btn btn-primary btn-full">Crea categoria</button>
        </form>
      )}

      {/* Default categories notice */}
      <div className="alert alert-info" style={{ marginBottom: 16, fontSize: '0.82rem' }}>
        Le categorie predefinite (create alla registrazione) non possono essere eliminate se contengono articoli.
      </div>

      {/* Categories list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {categories.map(cat => {
          const count = countItems(cat.id)
          const isDeletable = !cat.isDefault || count === 0
          return (
            <div key={cat.id} className="card fade-in"
              style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${cat.color}18`, border: `1px solid ${cat.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.3rem',
              }}>
                {cat.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: cat.color }}>{cat.name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {count} {count === 1 ? 'articolo' : 'articoli'}
                  {cat.isDefault && ' · predefinita'}
                </div>
              </div>

              {confirmDelete === cat.id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Annulla</button>
                  <button className="btn btn-danger btn-sm" onClick={async () => {
                    await deleteCategory(cat.id); setConfirmDelete(null)
                  }}>Elimina</button>
                </div>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--red)', opacity: isDeletable ? 1 : 0.3 }}
                  disabled={!isDeletable}
                  title={!isDeletable ? 'Rimuovi prima gli articoli da questa categoria' : 'Elimina categoria'}
                  onClick={() => setConfirmDelete(cat.id)}>
                  🗑
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ height: 24 }} />
    </div>
  )
}
