import type { BrandId } from '@/types'
import { createClient } from '@/lib/supabase/server'

/** Returns the list of valid brand IDs from the database. */
export async function getValidBrands(): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await (supabase.from('brands') as any).select('id')
  return (data ?? []).map((b: any) => b.id as string)
}

/** Validate a brand param from the URL route segment against the DB. Returns 'bb' as fallback. */
export async function brandFromParam(param: string | undefined): Promise<BrandId> {
  if (!param) return 'bb'
  const valid = await getValidBrands()
  return valid.includes(param) ? param : (valid[0] ?? 'bb')
}
