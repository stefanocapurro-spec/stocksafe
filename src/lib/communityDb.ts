import { supabase } from './supabase'
import type { ProductInfo } from './barcode'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/community-lookup`

async function callCommunity(body: object): Promise<unknown> {
  const session = await supabase.auth.getSession()
  const token   = session.data.session?.access_token

  const res = await fetch(FUNCTION_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

export async function communityLookup(barcode: string): Promise<ProductInfo | null> {
  try {
    const data = await callCommunity({ action: 'lookup', barcode }) as Record<string, unknown>
    if (!data.found) return null
    return data as unknown as ProductInfo
  } catch { return null }
}

export interface CommunityContribution {
  name:        string
  brand:       string
  category:    string
  imageUrl:    string
  weightValue: number | null
  weightUnit:  string | null
}

export async function contributeBarcode(
  barcode: string,
  data:    CommunityContribution,
  userId:  string
): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await callCommunity({ action: 'contribute', barcode, data, userId }) as { ok: boolean; message: string }
    return result
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}