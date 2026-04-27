/**
 * StockSafe – AuthStore (variante PASSWORD UNICA)
 *
 * La chiave di cifratura è derivata da email + password account.
 * L'utente inserisce UN SOLO set di credenziali.
 *
 * Rischio: reset password via email invalida i dati cifrati.
 * Mitigazione: avviso obbligatorio prima del reset.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import {
  generateSalt, deriveKey, encrypt, decrypt,
  encryptVerificationToken, verifyKey,
  setSessionKey, clearSessionKey,
  isDisposableEmail,
} from '../lib/crypto'
import type { User } from '@supabase/supabase-js'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined

interface AuthState {
  user:            User | null
  isAuthenticated: boolean
  cryptoReady:     boolean
  isAdmin:         boolean
  loading:         boolean
  error:           string | null
  // Credenziali tenute in memoria per sblocco sessione
  _email:    string
  _password: string

  register:             (email: string, password: string) => Promise<void>
  login:                (email: string, password: string) => Promise<void>
  logout:               () => Promise<void>
  unlockWithCredentials:(email: string, password: string) => Promise<void>
  resetAccountPassword: (email: string) => Promise<void>
  changeCryptoPassword: (email: string, oldPwd: string, newPwd: string) => Promise<{ reencrypted: number }>
  emergencyResetCrypto:  (email: string, newPwd: string) => Promise<void>
  requestAccountDeletion: (email: string) => Promise<void>
  deleteMyAccount:        () => Promise<void>
  initSession:          () => Promise<void>
  clearError:           () => void
}

async function reencryptAllItems(userId: string, oldKey: CryptoKey, newKey: CryptoKey): Promise<number> {
  const { data: items } = await supabase
    .from('items').select('id,encrypted_data,iv_hex,encrypted_value,iv_value_hex').eq('user_id', userId)
  if (!items?.length) return 0
  let count = 0
  for (const item of items) {
    try {
      const plain  = await decrypt({ ciphertext: item.encrypted_data, ivHex: item.iv_hex }, oldKey)
      const newEnc = await encrypt(plain, newKey)
      const patch: Record<string, string> = { encrypted_data: newEnc.ciphertext, iv_hex: newEnc.ivHex }
      if (item.encrypted_value && item.iv_value_hex) {
        const pv = await decrypt({ ciphertext: item.encrypted_value, ivHex: item.iv_value_hex }, oldKey)
        const nv = await encrypt(pv, newKey)
        patch.encrypted_value = nv.ciphertext; patch.iv_value_hex = nv.ivHex
      }
      await supabase.from('items').update(patch).eq('id', item.id)
      count++
    } catch { /* item corrotto */ }
  }
  return count
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null, isAuthenticated: false, cryptoReady: false,
      isAdmin: false, loading: false, error: null,
      _email: '', _password: '',

      clearError: () => set({ error: null }),

      // ── REGISTRAZIONE ──────────────────────────────────────────────────────
      register: async (email, password) => {
        set({ loading: true, error: null })
        try {
          if (isDisposableEmail(email)) throw new Error('Email usa-e-getta non consentita.')
          if (password.length < 8) throw new Error('Password minimo 8 caratteri.')

          const { data, error } = await supabase.auth.signUp({ email, password })
          if (error) throw new Error(error.message)
          if (!data.user) throw new Error('Registrazione fallita.')

          const saltHex = generateSalt()
          const key     = await deriveKey(email, password, saltHex)
          const token   = await encryptVerificationToken(key)

          const { error: rpcErr } = await supabase.rpc('setup_new_user_crypto', {
            p_user_id:     data.user.id,
            p_salt_hex:    saltHex,
            p_iv_base_hex: JSON.stringify(token),
          })
          if (rpcErr) throw new Error('Errore setup cifratura: ' + rpcErr.message)

          if (data.session) {
            setSessionKey(key)
            const isAdmin = !!ADMIN_EMAIL && email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
            set({ user: data.user, isAuthenticated: true, cryptoReady: true,
              isAdmin, _email: email, _password: password, loading: false })
          } else {
            set({ loading: false, error: '📧 Controlla la tua email e clicca il link di conferma, poi accedi.' })
          }
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
        }
      },

      // ── LOGIN ──────────────────────────────────────────────────────────────
      login: async (email, password) => {
        set({ loading: true, error: null })
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password })
          if (error) throw new Error('Credenziali errate.')
          if (!data.user) throw new Error('Login fallito.')

          const { data: cfg, error: cfgErr } = await supabase
            .from('user_crypto_config').select('*').eq('user_id', data.user.id).single()
          if (cfgErr || !cfg) throw new Error('Configurazione cifratura non trovata.')
          if (!cfg.salt_hex?.trim()) throw new Error('Setup cifratura incompleto. Contatta l\'amministratore.')

          const key = await deriveKey(email, password, cfg.salt_hex)

          if (cfg.iv_base_hex?.trim()) {
            const ok = await verifyKey(cfg.iv_base_hex, key)
            if (!ok) throw new Error('Password errata o dati cifrati con credenziali diverse.')
          }

          setSessionKey(key)
          const isAdmin = !!ADMIN_EMAIL && email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
          set({ user: data.user, isAuthenticated: true, cryptoReady: true,
            isAdmin, _email: email, _password: password, loading: false })
        } catch (e) {
          await supabase.auth.signOut()
          set({ error: (e as Error).message, loading: false, isAuthenticated: false, cryptoReady: false })
        }
      },

      // ── SBLOCCO SESSIONE (dopo refresh) ────────────────────────────────────
      // Chiede di reinserire email+password per rigenerare la chiave
      unlockWithCredentials: async (email, password) => {
        set({ loading: true, error: null })
        try {
          const { user } = get()
          if (!user) throw new Error('Nessuna sessione attiva.')
          const { data: cfg } = await supabase
            .from('user_crypto_config').select('*').eq('user_id', user.id).single()
          if (!cfg) throw new Error('Config cifratura non trovata.')
          const key = await deriveKey(email, password, cfg.salt_hex)
          if (cfg.iv_base_hex?.trim()) {
            const ok = await verifyKey(cfg.iv_base_hex, key)
            if (!ok) throw new Error('Credenziali errate.')
          }
          setSessionKey(key)
          const isAdmin = !!ADMIN_EMAIL && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
          set({ cryptoReady: true, isAdmin, _email: email, _password: password, loading: false })
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
        }
      },

      // ── LOGOUT ─────────────────────────────────────────────────────────────
      logout: async () => {
        clearSessionKey()
        await supabase.auth.signOut()
        set({ user: null, isAuthenticated: false, cryptoReady: false,
          isAdmin: false, _email: '', _password: '' })
      },

      // ── RESET PASSWORD ACCOUNT ─────────────────────────────────────────────
      // ATTENZIONE: cambia la password → cambia la chiave → dati inaccessibili
      resetAccountPassword: async (email) => {
        set({ loading: true, error: null })
        try {
          if (isDisposableEmail(email)) throw new Error('Email non valida.')
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
          })
          if (error) throw new Error(error.message)
          set({ loading: false })
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
        }
      },

      // ── CAMBIO PASSWORD (ri-cifra tutti gli item) ─────────────────────────
      changeCryptoPassword: async (email, oldPwd, newPwd) => {
        set({ loading: true, error: null })
        try {
          const { user } = get()
          if (!user) throw new Error('Non autenticato.')
          const { data: cfg } = await supabase
            .from('user_crypto_config').select('*').eq('user_id', user.id).single()
          if (!cfg) throw new Error('Config non trovata.')

          const oldKey = await deriveKey(email, oldPwd, cfg.salt_hex)
          if (cfg.iv_base_hex?.trim()) {
            const ok = await verifyKey(cfg.iv_base_hex, oldKey)
            if (!ok) throw new Error('Password attuale errata.')
          }

          const newSalt = generateSalt()
          const newKey  = await deriveKey(email, newPwd, newSalt)
          const reencrypted = await reencryptAllItems(user.id, oldKey, newKey)

          const newToken = await encryptVerificationToken(newKey)
          await supabase.rpc('update_my_crypto_config', {
            p_salt_hex:    newSalt,
            p_iv_base_hex: JSON.stringify(newToken),
          })

          setSessionKey(newKey)
          set({ _password: newPwd, loading: false })
          return { reencrypted }
        } catch (e) {
          set({ error: (e as Error).message, loading: false }); throw e
        }
      },

      // ── RESET EMERGENZA ─────────────────────────────────────────────────────
      emergencyResetCrypto: async (email, newPwd) => {
        set({ loading: true, error: null })
        try {
          const { user } = get()
          if (!user) throw new Error('Non autenticato.')
          await supabase.from('items').delete().eq('user_id', user.id)
          const newSalt  = generateSalt()
          const newKey   = await deriveKey(email, newPwd, newSalt)
          const newToken = await encryptVerificationToken(newKey)
          await supabase.rpc('update_my_crypto_config', {
            p_salt_hex: newSalt, p_iv_base_hex: JSON.stringify(newToken),
          })
          setSessionKey(newKey)
          set({ cryptoReady: true, _email: email, _password: newPwd, loading: false })
        } catch (e) {
          set({ error: (e as Error).message, loading: false }); throw e
        }
      },

      // ── ELIMINAZIONE ACCOUNT ───────────────────────────────────────────────
      requestAccountDeletion: async (email) => {
        set({ loading: true, error: null })
        try {
          if (isDisposableEmail(email)) throw new Error('Email non valida.')
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/delete-account`,
          })
          if (error) throw new Error(error.message)
          set({ loading: false })
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
        }
      },

      deleteMyAccount: async () => {
        set({ loading: true, error: null })
        try {
          const { error } = await supabase.rpc('delete_my_account')
          if (error) throw new Error(error.message)
          clearSessionKey()
          await supabase.auth.signOut()
          set({ user: null, isAuthenticated: false, cryptoReady: false,
            isAdmin: false, _email: '', _password: '', loading: false })
        } catch (e) {
          set({ error: (e as Error).message, loading: false })
        }
      },

      // ── INIT SESSIONE ───────────────────────────────────────────────────────
      initSession: async () => {
        const { data } = await supabase.auth.getSession()
        if (data.session?.user) {
          const isAdmin = !!ADMIN_EMAIL &&
            data.session.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
          // cryptoReady rimane false: serve reinserire la password per rigenerare la chiave
          set({ user: data.session.user, isAuthenticated: true, cryptoReady: false, isAdmin })
        }
      },
    }),
    {
      name: 'ss_auth_unified',
      partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }),
    }
  )
)
