/**
 * StockSafe – Libreria di Cifratura (variante PASSWORD UNICA)
 *
 * La chiave di cifratura viene derivata da:
 *   email + ":" + password_account  →  PBKDF2  →  AES-256-GCM key
 *
 * Vantaggi: una sola password da ricordare.
 * Rischio accettato: se si fa il reset della password via email,
 *   i dati cifrati diventano inaccessibili (la chiave cambia).
 *   Il reset mostra un avviso obbligatorio prima di procedere.
 */

const PBKDF2_ITERATIONS = 600_000
const KEY_LENGTH = 256

export function bufferToHex(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function hexToBuffer(hex: string): Uint8Array {
  if (!hex || hex.length % 2 !== 0) return new Uint8Array(0)
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2)
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return bytes
}

function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const CHUNK = 8192
  for (let i = 0; i < bytes.length; i += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlToBuffer(b64: string): ArrayBuffer {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/')
  const padded = s + '=='.slice(0, (4 - s.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function generateSalt(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return bufferToHex(arr)
}

/**
 * Deriva la chiave AES-256 da email + password.
 * Il separatore ":" evita collisioni banali tra
 * (email="a", pwd="bc") e (email="a:b", pwd="c").
 */
export async function deriveKey(email: string, password: string, saltHex: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const input = `${email.toLowerCase().trim()}:${password}`
  const saltBytes = hexToBuffer(saltHex)
  const saltBuf   = saltBytes.buffer.slice(saltBytes.byteOffset, saltBytes.byteOffset + saltBytes.byteLength) as ArrayBuffer
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(input), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuf, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

export interface EncryptedPayload { ciphertext: string; ivHex: string }

export async function encrypt(plaintext: string, key: CryptoKey): Promise<EncryptedPayload> {
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const ivBuf: ArrayBuffer = iv.buffer.slice(0) as ArrayBuffer
  const enc = new TextEncoder()
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuf }, key, enc.encode(plaintext))
  return { ciphertext: bufferToBase64url(cipherBuf), ivHex: bufferToHex(iv) }
}

export async function decrypt(payload: EncryptedPayload, key: CryptoKey): Promise<string> {
  const iv = hexToBuffer(payload.ivHex)
  const ivBuf    = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer
  const cipherBuf = base64urlToBuffer(payload.ciphertext)
  const plainBuf  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, key, cipherBuf)
  return new TextDecoder().decode(plainBuf)
}

const VERIFY_TOKEN = 'STOCKSAFE_VERIFY_OK_V2'

export async function encryptVerificationToken(key: CryptoKey): Promise<EncryptedPayload> {
  return encrypt(VERIFY_TOKEN, key)
}

export async function verifyKey(tokenJson: string, key: CryptoKey): Promise<boolean> {
  try {
    if (!tokenJson?.trim()) return false
    const token: EncryptedPayload = JSON.parse(tokenJson)
    const result = await decrypt(token, key)
    return result === VERIFY_TOKEN || result === 'STOCKSAFE_VERIFY_OK'
  } catch { return false }
}

let _sessionKey: CryptoKey | null = null
export const setSessionKey   = (k: CryptoKey) => { _sessionKey = k }
export const getSessionKey   = ()              => _sessionKey
export const clearSessionKey = ()              => { _sessionKey = null }

const DISPOSABLE = new Set([
  'mailinator.com','guerrillamail.com','tempmail.com','throwaway.email',
  '10minutemail.com','yopmail.com','sharklasers.com','grr.la',
  'guerrillamail.info','guerrillamail.biz','guerrillamail.de','guerrillamail.net',
  'guerrillamail.org','spam4.me','trashmail.com','trashmail.me','trashmail.at',
  'dispostable.com','mailnull.com','spamgourmet.com','fakeinbox.com',
  'maildrop.cc','discard.email','spamfree24.org','spam.la','spamspot.com',
  'tempr.email','throwam.com','mailnesia.com','mohmal.com','mailcatch.com',
  'getnada.com','anonbox.net','spamthisplease.com',
])
export const isDisposableEmail = (email: string) =>
  DISPOSABLE.has(email.split('@')[1]?.toLowerCase() ?? '')
