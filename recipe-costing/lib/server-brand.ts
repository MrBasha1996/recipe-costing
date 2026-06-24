import type { BrandId } from '@/types'
import { createClient } from '@/lib/supabase/server'

/** Returns the list of valid brand IDs from the database. */
export async function getValidBrands(): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await (supabase.from('brands') as any).select('id').eq('is_standalone', false)
  return (data ?? []).map((b: any) => b.id as string)
}

/** Validate a brand param from the URL route segment against the DB. Returns first valid brand as fallback. */
export async function brandFromParam(param: string | undefined): Promise<BrandId> {
  const valid = await getValidBrands()
  if (param && valid.includes(param)) return param as BrandId
  return (valid[0] ?? '') as BrandId
}
