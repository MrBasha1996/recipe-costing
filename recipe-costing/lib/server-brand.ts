import type { BrandId } from '@/types'

const VALID_BRANDS: BrandId[] = ['ti', 'bb']

/** Validate a brand param from the URL route segment. Returns 'bb' as fallback. */
export function brandFromParam(param: string | undefined): BrandId {
  if (param && VALID_BRANDS.includes(param as BrandId)) return param as BrandId
  return 'bb'
}
