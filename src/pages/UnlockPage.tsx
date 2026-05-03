import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export function UnlockPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showEmergency, setShowEmergency] = useState(false)
  const [newPwd, setNewPwd]     = useState('')
  const [confPwd, setConfPwd]   = useState('')
  const [localErr, setLocalErr] = useState('')
  const [done, setDone]         = useState(false)

  const { user, unlockWithCredentials, emergencyResetCrypto, logout, loading, error, clearError } = useAuthStore()
  const navigate = useNavigate()

  // Pre-compila l'email se la conosciamo già
  const defaultEmail = user?.email ?? ''

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault(); clearError()
    await unlockWithCredentials(email || defaultEmail, password)
    if (!useAuthStore.getState().error) navigate('/', { replace: true })
  }

  const handleEmergency = async (e: React.FormEvent) => {
    e.preventDefault(); setLocalErr('')
    if (newPwd.length < 8)        { setLocalErr('Minimo 8 caratteri.'); return }
    if (newPwd !== confPwd)        { setLocalErr('Le password non coincidono.'); return }
    if (!email && !defaultEmail)   { setLocalErr('Inserisci la tua email.'); return }
    try {
      await emergencyResetCrypto(email || defaultEmail, newPwd)
      setDone(true)
    } catch (err) { setLocalErr((err as Error).message) }
  }

  const displayError = error || localErr

  return (
    <div className="auth-page"><div className="auth-container fade-in">
      <div className="auth-brand">
        <span style={{ fontSize:'3rem', display:'block', marginBottom:8 }}>🔒</span>
        <h2>Sessione bloccata</h2>
        <p style={{ fontSize:'0.85rem' }}>Reinserisci le credenziali per sbloccare i dati</p>
        {user && <p style={{ marginTop:6, fontSize:'0.8rem', color:'var(--accent)' }}>{user.email}</p>}
      </div>

      {displayError && <div className="alert alert-error"><span>⚠</span> {displayError}</div>}

      {!showEmergency ? (
        <>
          <form onSubmit={handleUnlock} style={{ display:'flex', flexDirection:'column', gap:13 }}>
            {!defaultEmail && (
              <div className="field">
                <label>Email</label>
                <input type="email" className="input" value={email}
                  onChange={e => setEmail(e.target.value)} required autoComplete="email"/>
              </div>
            )}
            <div className="field">
              <label>Password</label>
              <input type="password" className="input" value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password" required autoFocus/>
            </div>
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
              {loading ? <span className="spinner"/> : '🔓 Sblocca'}
            </button>
          </form>
          <div className="divider" style={{ margin:'16px 0' }}>password dimenticata?</div>
          <button className="btn btn-ghost btn-full btn-sm"
            onClick={() => { clearError(); setShowEmergency(true) }}
            style={{ color:'var(--red)', borderColor:'rgba(239,68,68,.3)' }}>
            ⚠️ Reset emergenza (elimina tutti i dati)
          </button>
          <button className="btn btn-ghost btn-full" onClick={logout} style={{ marginTop:6 }}>
            Esci dall'account
          </button>
        </>
      ) : done ? (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="alert alert-success">✓ Reset completato. I dati precedenti sono stati eliminati.</div>
          <button className="btn btn-primary btn-full" onClick={() => navigate('/', { replace:true })}>Accedi all'app</button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="alert alert-error" style={{ fontSize:'0.82rem' }}>
            ⚠️ Il reset elimina <strong>tutti i dati</strong> in modo irreversibile. La nuova password diventerà anche la nuova chiave di cifratura.
          </div>
          <form onSubmit={handleEmergency} style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {!defaultEmail && (
              <div className="field">
                <label>Email</label>
                <input type="email" className="input" value={email}
                  onChange={e => setEmail(e.target.value)} required/>
              </div>
            )}
            <div className="field">
              <label>Nuova password (min. 8 caratteri)</label>
              <input type="password" className="input" value={newPwd}
                onChange={e => setNewPwd(e.target.value)} required minLength={8} autoComplete="off"/>
            </div>
            <div className="field">
              <label>Conferma nuova password</label>
              <input type="password" className="input" value={confPwd}
                onChange={e => setConfPwd(e.target.value)} required minLength={8} autoComplete="off"/>
            </div>
            <button type="submit" className="btn btn-danger btn-full" disabled={loading}>
              {loading ? <span className="spinner"/> : '🗑 Elimina tutto e reimposta'}
            </button>
          </form>
          <button className="btn btn-ghost btn-full" onClick={() => { setShowEmergency(false); setLocalErr('') }}>← Annulla</button>
        </div>
      )}
    </div>
    <style>{`
      .auth-page { min-height:100vh; display:flex; align-items:center; justify-content:center;
        padding:24px 16px;
        background: radial-gradient(ellipse 60% 40% at 50% 0%, var(--accent-glow) 0%, transparent 70%), var(--bg-base); }
      .auth-container { width:100%; max-width:400px; display:flex; flex-direction:column; gap:10px; }
      .auth-brand { text-align:center; margin-bottom:8px; }
    `}</style>
    </div>
  )
}
