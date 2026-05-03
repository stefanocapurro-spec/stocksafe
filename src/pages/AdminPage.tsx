import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminStore, type AdminUser } from '../stores/adminStore'
import { useAuthStore } from '../stores/authStore'

export function AdminPage() {
  const { users, loading, error, fetchUsers, deleteUserData, resetUserCrypto } = useAdminStore()
  const { user: me, logout } = useAuthStore()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState<{ id: string; action: 'delete' | 'reset' } | null>(null)
  const [done, setDone] = useState('')

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleAction = async () => {
    if (!confirm) return
    try {
      if (confirm.action === 'delete') {
        await deleteUserData(confirm.id)
        setDone('Dati utente eliminati.')
      } else {
        await resetUserCrypto(confirm.id)
        setDone('Config cifratura resettata. L\'utente potrà impostare una nuova password di cifratura.')
      }
    } catch {}
    setConfirm(null)
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-base)', padding:'0 0 80px' }}>
      {/* Header */}
      <div style={{ background:'var(--bg-surface)', borderBottom:'1px solid var(--border)', padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>←</button>
        <div style={{ flex:1 }}>
          <h2 style={{ fontSize:'1.1rem', marginBottom:2 }}>🛡 Pannello Admin</h2>
          <p style={{ fontSize:'0.78rem', color:'var(--accent)' }}>{me?.email}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate('/login') }}>Esci</button>
      </div>

      <div className="page-container" style={{ paddingTop:24 }}>
        {error && <div className="alert alert-error" style={{ marginBottom:16 }}>⚠ {error}</div>}
        {done  && <div className="alert alert-success" style={{ marginBottom:16 }}>✓ {done}</div>}

        <div className="alert alert-warn" style={{ marginBottom:20, fontSize:'0.82rem' }}>
          ⚠️ Pannello riservato all'amministratore. Le azioni qui sono irreversibili.
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h3>Utenti registrati ({users.length})</h3>
          <button className="btn btn-ghost btn-sm" onClick={fetchUsers} disabled={loading}>
            {loading ? <span className="spinner"/> : '↺ Aggiorna'}
          </button>
        </div>

        {loading && !users.length && (
          <div style={{ textAlign:'center', padding:'40px 0' }}>
            <span className="spinner" style={{ width:28, height:28 }}/>
          </div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {users.map(u => (
            <UserCard key={u.id} user={u} isMe={u.id === me?.id}
              onDelete={() => setConfirm({ id: u.id, action: 'delete' })}
              onReset={() =>  setConfirm({ id: u.id, action: 'reset' })} />
          ))}
        </div>

        {/* Modale conferma */}
        {confirm && (
          <div style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,0.7)',
            display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20
          }}>
            <div className="card" style={{ maxWidth:380, width:'100%' }}>
              <h3 style={{ marginBottom:12 }}>
                {confirm.action === 'delete' ? '🗑 Elimina dati utente' : '🔑 Reset cifratura'}
              </h3>
              <p style={{ marginBottom:20, fontSize:'0.88rem' }}>
                {confirm.action === 'delete'
                  ? 'Verranno eliminati TUTTI i dati dell\'utente (articoli, categorie, config). L\'account Supabase rimarrà attivo.'
                  : 'Verrà resettata la configurazione di cifratura. L\'utente perderà l\'accesso ai suoi dati cifrati ma potrà impostare una nuova password.'}
              </p>
              <div style={{ display:'flex', gap:10 }}>
                <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => setConfirm(null)}>Annulla</button>
                <button className={`btn ${confirm.action === 'delete' ? 'btn-danger' : 'btn-primary'}`}
                  style={{ flex:1 }} onClick={handleAction}>
                  Conferma
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function UserCard({ user, isMe, onDelete, onReset }: {
  user: AdminUser; isMe: boolean
  onDelete: () => void; onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card fade-in" style={{ borderColor: isMe ? 'var(--accent-border)' : 'var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:'var(--bg-raised)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', flexShrink:0 }}>
          {isMe ? '👑' : '👤'}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:'0.9rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {user.email} {isMe && <span className="badge badge-accent">Tu</span>}
          </div>
          <div style={{ fontSize:'0.74rem', color:'var(--text-muted)', marginTop:2 }}>
            Registrato: {new Date(user.created_at).toLocaleDateString('it-IT')}
            {user.last_sign_in_at && ` · Ultimo accesso: ${new Date(user.last_sign_in_at).toLocaleDateString('it-IT')}`}
          </div>
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <span className="badge badge-muted mono">{user.itemCount} art.</span>
          <span className={`badge ${user.hasCryptoConfig ? 'badge-green' : 'badge-red'}`}>
            {user.hasCryptoConfig ? '🔐' : '⚠️'}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}>
            {open ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {open && !isMe && (
        <div style={{ display:'flex', gap:8, marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)' }}>
          <button className="btn btn-ghost btn-sm" style={{ flex:1 }} onClick={onReset}>
            🔑 Reset cifratura
          </button>
          <button className="btn btn-danger btn-sm" style={{ flex:1 }} onClick={onDelete}>
            🗑 Elimina dati
          </button>
        </div>
      )}
      {open && isMe && (
        <p style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)', fontSize:'0.8rem', color:'var(--text-muted)' }}>
          Non puoi eliminare il tuo account admin da qui.
        </p>
      )}
    </div>
  )
}
