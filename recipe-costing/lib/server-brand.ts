import { cookies } from 'next/headers'
import type { BrandId } from '@/types'

export async function getServerBrand(): Promise<BrandId> {
  const store = await cookies()
  return (store.get('brand')?.value as BrandId) ?? 'ti'
}
