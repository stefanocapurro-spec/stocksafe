import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

function StrengthBar({ password }: { password: string }) {
  const score = [
    password.length>=8, password.length>=12,
    /[A-Z]/.test(password), /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length
  const colors = ['','#EF4444','#F59E0B','#F59E0B','#10B981','#10B981']
  const labels = ['','Debole','Sufficiente','Buona','Forte','Ottima']
  if (!password) return null
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <div style={{ display:'flex', gap:3 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ flex:1, height:4, borderRadius:2,
            background: i<=score ? colors[score] : 'var(--border)', transition:'background 0.3s' }}/>
        ))}
      </div>
      <span style={{ fontSize:'0.73rem', color:colors[score] }}>{labels[score]}</span>
    </div>
  )
}

export function RegisterPage() {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [localErr, setLocalErr]   = useState('')
  const [emailSent, setEmailSent] = useState(false)

  const { register, loading, error, isAuthenticated, cryptoReady, clearError } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated && cryptoReady) navigate('/', { replace: true })
  }, [isAuthenticated, cryptoReady, navigate])

  useEffect(() => { clearError() }, [])
  useEffect(() => { if (error?.startsWith('📧')) setEmailSent(true) }, [error])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLocalErr('')
    if (password !== confirmPwd) { setLocalErr('Le password non coincidono.'); return }
    if (password.length < 8) { setLocalErr('Password minimo 8 caratteri.'); return }
    await register(email, password)
  }

  if (emailSent) return (
    <div className="auth-page"><div className="auth-container fade-in">
      <div className="auth-brand">
        <span style={{ fontSize:'3rem', display:'block', marginBottom:12 }}>📧</span>
        <h2>Controlla la tua email</h2>
        <p style={{ marginTop:8, fontSize:'0.9rem' }}>
          Link di conferma inviato a<br/>
          <strong style={{ color:'var(--accent)' }}>{email}</strong>
        </p>
      </div>
      <div className="alert alert-info">Dopo aver confermato l'email, accedi con le tue credenziali.</div>
      <Link to="/login" className="btn btn-primary btn-full btn-lg">Vai al login</Link>
    </div><style>{AUTH_CSS}</style></div>
  )

  const displayErr = localErr || (error?.startsWith('📧') ? '' : error)

  return (
    <div className="auth-page"><div className="auth-container fade-in">
      <div className="auth-brand">
        <svg viewBox="0 0 64 64" width="60" style={{ display:'block', margin:'0 auto 10px' }}>
          <polygon points="32,2 62,32 32,62 2,32" fill="#F9A825"/>
          <polygon points="32,10 54,32 32,54 10,32" fill="#1565C0"/>
          <path d="M22 20 Q22 14 30 13 L36 13 Q44 13 44 20 Q44 27 36 30 L28 33 Q20 36 20 43 Q20 50 28 52 L36 52 Q44 52 44 45"
                fill="none" stroke="#C62828" strokeWidth="6" strokeLinecap="round"/>
          <path d="M22 20 Q22 14 30 13 L36 13 Q44 13 44 20 Q44 27 36 30 L28 33 Q20 36 20 43 Q20 50 28 52 L36 52 Q44 52 44 45"
                fill="none" stroke="#FFD600" strokeWidth="3.5" strokeLinecap="round"/>
        </svg>
        <h1 style={{ fontSize:'1.8rem' }}>StockSafe</h1>
        <p>Una sola password per tutto</p>
      </div>

      <div className="alert alert-warn" style={{ fontSize:'0.8rem' }}>
        🔐 La tua password serve anche per <strong>cifrare i dati</strong>.
        Sceglila robusta (almeno 12 caratteri) e <strong>non dimenticarla</strong> —
        il reset password invalida i dati cifrati.
      </div>

      {displayErr && <div className="alert alert-error"><span>⚠</span> {displayErr}</div>}

      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div className="field">
          <label>Email</label>
          <input type="email" className="input" value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email" required placeholder="mario@esempio.it"/>
        </div>
        <div className="field">
          <label>Password (min. 8 caratteri — usala come cifra i dati)</label>
          <input type="password" className="input" value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password" required minLength={8}/>
        </div>
        <StrengthBar password={password}/>
        <div className="field">
          <label>Conferma password</label>
          <input type="password" className="input" value={confirmPwd}
            onChange={e => setConfirmPwd(e.target.value)}
            autoComplete="new-password" required minLength={8}/>
        </div>
        <button type="submit" className="btn btn-primary btn-full btn-lg"
          style={{ marginTop:4 }} disabled={loading}>
          {loading ? <span className="spinner"/> : 'Crea account'}
        </button>
      </form>

      <div className="divider" style={{ margin:'14px 0' }}>hai già un account?</div>
      <Link to="/login" className="btn btn-ghost btn-full">Accedi</Link>
    </div><style>{AUTH_CSS}</style></div>
  )
}

const AUTH_CSS = `
.auth-page { min-height:100vh; display:flex; align-items:flex-start; justify-content:center;
  padding:24px 16px;
  background: radial-gradient(ellipse 60% 40% at 50% 0%, var(--accent-glow) 0%, transparent 70%), var(--bg-base); }
.auth-container { width:100%; max-width:440px; display:flex; flex-direction:column; gap:8px; padding-bottom:32px; }
.auth-brand { text-align:center; margin-bottom:12px; }
.auth-brand h1 { font-size:1.8rem; }
.auth-brand p { font-size:0.86rem; }
`
