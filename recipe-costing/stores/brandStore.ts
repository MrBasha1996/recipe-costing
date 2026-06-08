import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BrandId } from '@/types'

type NavTab = 'costing' | 'products' | 'ingredients' | 'dashboard' | 'users'

interface BrandStore {
  brand: BrandId
  brandPicked: boolean
  nav: NavTab
  /** true after localStorage has been read — prevents data-fetch with wrong default brand */
  hydrated: boolean
  setBrand: (b: BrandId) => void
  pickBrand: (b: BrandId) => void
  setNav: (n: NavTab) => void
  resetPick: () => void
  setHydrated: (v: boolean) => void
}

export const useBrandStore = create<BrandStore>()(
  persist(
    (set) => ({
      brand: 'ti',
      brandPicked: false,
      nav: 'costing',
      hydrated: false,
      setBrand: (brand) => {
        if (typeof document !== 'undefined')
          document.cookie = `brand=${brand}; path=/; max-age=31536000; SameSite=Lax`
        set({ brand })
      },
      pickBrand: (brand) => {
        if (typeof document !== 'undefined')
          document.cookie = `brand=${brand}; path=/; max-age=31536000; SameSite=Lax`
        set({ brand, brandPicked: true })
      },
      setNav: (nav) => set({ nav }),
      resetPick: () => set({ brandPicked: false }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: 'brand-store',
      skipHydration: true,
      // Only persist brand selection — not the hydrated flag
      partialize: (state) => ({
        brand: state.brand,
        brandPicked: state.brandPicked,
        nav: state.nav,
      }),
    }
  )
)
