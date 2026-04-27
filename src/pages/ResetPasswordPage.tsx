import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isDisposableEmail } from '../lib/crypto'

type Step = 'warn' | 'request' | 'sent' | 'newpwd'

export function ResetPasswordPage() {
  const [step, setStep]           = useState<Step>('warn')
  const [email, setEmail]         = useState('')
  const [newPwd, setNewPwd]       = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery') || hash.includes('access_token')) setStep('newpwd')
  }, [])

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    if (isDisposableEmail(email)) { setError('Email non valida.'); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setStep('sent')
  }

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    if (newPwd !== confirmPwd) { setError('Le password non coincidono.'); return }
    if (newPwd.length < 8)     { setError('Minimo 8 caratteri.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSuccess('Password aggiornata. I dati cifrati precedenti sono ora inaccessibili. Accedi con la nuova password.')
    setTimeout(() => navigate('/login', { replace: true }), 3500)
  }

  return (
    <div className="auth-page"><div className="auth-container fade-in">
      <div style={{ textAlign:'center', marginBottom:16 }}>
        <span style={{ fontSize:'2.6rem', display:'block', marginBottom:8 }}>🔑</span>
        <h2>
          {step === 'warn'    && 'Attenzione prima di procedere'}
          {step === 'request' && 'Reset password'}
          {step === 'sent'    && 'Email inviata'}
          {step === 'newpwd'  && 'Nuova password'}
        </h2>
      </div>

      {error   && <div className="alert alert-error"><span>⚠</span> {error}</div>}
      {success && <div className="alert alert-success"><span>✓</span> {success}</div>}

      {/* ── AVVISO OBBLIGATORIO ── */}
      {step === 'warn' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="alert alert-error" style={{ fontSize:'0.85rem', flexDirection:'column', alignItems:'flex-start', gap:8 }}>
            <strong>⚠️ In questa versione di StockSafe (password unica), il reset password causa la perdita permanente dei dati cifrati.</strong>
            <span>Cambiare la password cambia la chiave di cifratura. I tuoi articoli, salvati con la vecchia chiave, diventano illeggibili.</span>
            <span style={{ color:'var(--red)', fontWeight:700 }}>Hai un backup JSON recente dei tuoi dati? Se no, esportalo prima da Impostazioni → Dati.</span>
          </div>
          <button className="btn btn-danger btn-full" onClick={() => setStep('request')}>
            Ho capito — procedi con il reset
          </button>
          <Link to="/login" className="btn btn-ghost btn-full">← Annulla — torna al login</Link>
        </div>
      )}

      {step === 'request' && (
        <form onSubmit={requestReset} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="field">
            <label>Email account</label>
            <input type="email" className="input" value={email}
              onChange={e => setEmail(e.target.value)} required placeholder="mario@esempio.it"/>
          </div>
          <button type="submit" className="btn btn-danger btn-full" disabled={loading}>
            {loading ? <span className="spinner"/> : 'Invia link di reset'}
          </button>
        </form>
      )}

      {step === 'sent' && (
        <div style={{ textAlign:'center', display:'flex', flexDirection:'column', gap:14 }}>
          <p>Controlla <strong style={{ color:'var(--accent)' }}>{email}</strong>.<br/>
            Hai ricevuto il link di reset. Dopo aver impostato la nuova password, i tuoi dati cifrati precedenti saranno inaccessibili.</p>
        </div>
      )}

      {step === 'newpwd' && (
        <form onSubmit={updatePassword} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="alert alert-warn" style={{ fontSize:'0.82rem' }}>
            La nuova password diventerà anche la nuova chiave di cifratura. I dati precedenti non saranno recuperabili.
          </div>
          <div className="field">
            <label>Nuova password</label>
            <input type="password" className="input" value={newPwd}
              onChange={e => setNewPwd(e.target.value)} required minLength={8} autoComplete="new-password"/>
          </div>
          <div className="field">
            <label>Conferma</label>
            <input type="password" className="input" value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)} required minLength={8} autoComplete="new-password"/>
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? <span className="spinner"/> : 'Imposta nuova password'}
          </button>
        </form>
      )}

      {step !== 'warn' && (
        <Link to="/login" className="btn btn-ghost btn-full" style={{ marginTop:6 }}>← Torna al login</Link>
      )}
    </div>
    <style>{`
      .auth-page { min-height:100vh; display:flex; align-items:center; justify-content:center;
        padding:24px 16px;
        background: radial-gradient(ellipse 60% 40% at 50% 0%, var(--accent-glow) 0%, transparent 70%), var(--bg-base); }
      .auth-container { width:100%; max-width:420px; display:flex; flex-direction:column; gap:10px; }
    `}</style>
    </div>
  )
}
