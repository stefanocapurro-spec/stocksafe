import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const COMMUNITY_SALT = 'stocksafe_community_v1_2026'

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(COMMUNITY_SALT), iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2)
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return bytes
}

function base64urlToBuffer(b64: string): ArrayBuffer {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/')
  const padded = s + '=='.slice(0, (4 - s.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function bufferToHex(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const communitySecret = Deno.env.get('COMMUNITY_KEY')
    if (!communitySecret) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { action, barcode, data, userId } = await req.json()

    const key = await deriveKey(communitySecret)

    // ── LOOKUP ──────────────────────────────────────────────────────
    if (action === 'lookup') {
      if (!barcode) return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

      const { data: row } = await supabase
        .from('community_barcodes')
        .select('encrypted_data, iv_hex')
        .eq('barcode', barcode)
        .maybeSingle()

      if (!row) return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

      const iv = hexToBuffer(row.iv_hex)
      const ivBuf = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength)
      const cipherBuf = base64urlToBuffer(row.encrypted_data)
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, key, cipherBuf)
      const parsed = JSON.parse(new TextDecoder().decode(plainBuf))

      return new Response(JSON.stringify({ found: true, ...parsed, barcode }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── CONTRIBUTE ──────────────────────────────────────────────────
    if (action === 'contribute') {
      if (!barcode || !data?.name) {
        return new Response(JSON.stringify({ ok: false, message: 'barcode e name obbligatori' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const payload = {
        name:        data.name.trim(),
        brand:       data.brand?.trim()    ?? '',
        category:    data.category?.trim() ?? '',
        imageUrl:    data.imageUrl?.trim() ?? '',
        weightValue: data.weightValue ?? null,
        weightUnit:  data.weightUnit  ?? null,
      }

      const iv = new Uint8Array(12)
      crypto.getRandomValues(iv)
      const ivBuf = iv.buffer.slice(0) as ArrayBuffer
      const enc = new TextEncoder()
      const cipherBuf = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: ivBuf }, key, enc.encode(JSON.stringify(payload))
      )
      const ciphertext = bufferToBase64url(cipherBuf)
      const ivHex = bufferToHex(iv)

      const { data: existing } = await supabase
        .from('community_barcodes')
        .select('barcode')
        .eq('barcode', barcode)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('community_barcodes')
          .update({ encrypted_data: ciphertext, iv_hex: ivHex, updated_at: new Date().toISOString() })
          .eq('barcode', barcode)
        if (error) throw new Error(error.message)
        return new Response(JSON.stringify({ ok: true, message: 'Prodotto aggiornato.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } else {
        const { error } = await supabase
          .from('community_barcodes')
          .insert({ barcode, encrypted_data: ciphertext, iv_hex: ivHex, contributed_by: userId })
        if (error) throw new Error(error.message)
        return new Response(JSON.stringify({ ok: true, message: 'Prodotto contribuito. Grazie!' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    return new Response(JSON.stringify({ error: 'action non valida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})