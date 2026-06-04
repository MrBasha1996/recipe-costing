import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BrandId } from '@/types'

type NavTab = 'costing' | 'products' | 'ingredients' | 'dashboard' | 'users'

interface BrandStore {
  brand: BrandId
  brandPicked: boolean
  nav: NavTab
  setBrand: (b: BrandId) => void
  pickBrand: (b: BrandId) => void
  setNav: (n: NavTab) => void
  resetPick: () => void
}

export const useBrandStore = create<BrandStore>()(
  persist(
    (set) => ({
      brand: 'ti',
      brandPicked: false,
      nav: 'costing',
      setBrand: (brand) => set({ brand }),
      pickBrand: (brand) => set({ brand, brandPicked: true }),
      setNav: (nav) => set({ nav }),
      resetPick: () => set({ brandPicked: false }),
    }),
    { name: 'brand-store', skipHydration: true }
  )
)
