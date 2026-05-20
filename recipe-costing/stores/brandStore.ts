import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BrandId } from '@/types'

type NavTab = 'costing' | 'products' | 'ingredients' | 'dashboard' | 'users'

interface BrandStore {
  brand: BrandId
  nav: NavTab
  setBrand: (b: BrandId) => void
  setNav: (n: NavTab) => void
}

export const useBrandStore = create<BrandStore>()(
  persist(
    (set) => ({
      brand: 'ti',
      nav: 'costing',
      setBrand: (brand) => set({ brand }),
      setNav: (nav) => set({ nav }),
    }),
    { name: 'brand-store', skipHydration: true }
  )
)
