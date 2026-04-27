import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

type Step = 'loading' | 'confirm' | 'done' | 'error'

export function DeleteAccountPage() {
  const [step, setStep]     = useState<Step>('loading')
  const [email, setEmail]   = useState('')
  const [errMsg, setErrMsg] = useState('')
  const { deleteMyAccount, logout } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase SDK elabora il token OTP dall'URL hash automaticamente
    const checkSession = async () => {
      // Aspetta che Supabase processi il token nell'URL
      await new Promise(r => setTimeout(r, 1000))
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setEmail(session.user.email ?? '')
        setStep('confirm')
      } else {
        setErrMsg('Link non valido o scaduto. Torna al login e riprova.')
        setStep('error')
      }
    }
    checkSession()
  }, [])

  const handleDelete = async () => {
    try {
      await deleteMyAccount()
      setStep('done')
    } catch (e) {
      setErrMsg((e as Error).message)
      setStep('error')
    }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      padding:'24px 16px',
      background:'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(239,68,68,0.08) 0%, transparent 70%), var(--bg-base)',
    }}>
      <div style={{ width:'100%', maxWidth:400, display:'flex', flexDirection:'column', gap:16 }} className="fade-in">

        {/* Icona */}
        <div style={{ textAlign:'center', marginBottom:8 }}>
          <span style={{ fontSize:'3rem', display:'block', marginBottom:8 }}>
            {step === 'done' ? '✓' : step === 'error' ? '⚠️' : '🗑️'}
          </span>
          <h2 style={{ fontSize:'1.4rem' }}>
            {step === 'loading' && 'Verifica in corso...'}
            {step === 'confirm' && 'Elimina account'}
            {step === 'done'    && 'Account eliminato'}
            {step === 'error'   && 'Errore'}
          </h2>
        </div>

        {/* Loading */}
        {step === 'loading' && (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <span className="spinner" style={{ width:28, height:28 }}/>
            <p style={{ marginTop:12, fontSize:'0.88rem' }}>Verifica del link in corso...</p>
          </div>
        )}

        {/* Conferma */}
        {step === 'confirm' && (
          <>
            <div className="card" style={{ borderColor:'rgba(239,68,68,.3)', background:'rgba(239,68,68,.05)' }}>
              <p style={{ fontSize:'0.88rem', lineHeight:1.7 }}>
                Stai per eliminare definitivamente l'account associato a:
              </p>
              <p style={{ fontWeight:700, color:'var(--accent)', margin:'8px 0', wordBreak:'break-all' }}>
                {email}
              </p>
              <p style={{ fontSize:'0.85rem', lineHeight:1.7, color:'var(--text-secondary)' }}>
                Questa operazione è <strong>irreversibile</strong> e comporta l'eliminazione di:
              </p>
              <ul style={{ margin:'8px 0 0 16px', fontSize:'0.83rem', color:'var(--text-muted)', lineHeight:1.8 }}>
                <li>Tutti gli articoli e le categorie</li>
                <li>La configurazione di cifratura</li>
                <li>L'account e l'indirizzo email</li>
              </ul>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <Link to="/login" className="btn btn-ghost" style={{ flex:1 }}>
                ← Annulla
              </Link>
              <button className="btn btn-danger" style={{ flex:1 }} onClick={handleDelete}>
                🗑 Elimina tutto
              </button>
            </div>
          </>
        )}

        {/* Completato */}
        {step === 'done' && (
          <>
            <div className="alert alert-success" style={{ textAlign:'center' }}>
              Account eliminato con successo. Tutti i tuoi dati sono stati cancellati in modo permanente.
            </div>
            <Link to="/login" className="btn btn-primary btn-full">
              Torna alla home
            </Link>
          </>
        )}

        {/* Errore */}
        {step === 'error' && (
          <>
            <div className="alert alert-error">{errMsg}</div>
            <Link to="/login" className="btn btn-ghost btn-full">← Torna al login</Link>
          </>
        )}
      </div>
    </div>
  )
}
