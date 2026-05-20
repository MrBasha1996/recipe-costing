import { create } from 'zustand'
import type { Product, RecipeRowDraft, Recipe, ServiceType } from '@/types'

interface CostingStore {
  currentProduct: Product | null
  rows: RecipeRowDraft[]
  savedRecipe: Recipe | null
  yieldPortions: number
  activeService: ServiceType
  setCurrentProduct: (p: Product | null) => void
  setRows: (rows: RecipeRowDraft[]) => void
  setSavedRecipe: (r: Recipe | null) => void
  setYieldPortions: (n: number) => void
  setActiveService: (s: ServiceType) => void
  addRow: (row: RecipeRowDraft) => void
  updateRow: (id: string, updates: Partial<RecipeRowDraft>) => void
  removeRow: (id: string) => void
  reset: () => void
}

export const useCostingStore = create<CostingStore>()((set) => ({
  currentProduct: null,
  rows: [],
  savedRecipe: null,
  yieldPortions: 1,
  activeService: 'dine_in',
  setCurrentProduct: (currentProduct) => set({ currentProduct }),
  setRows: (rows) => set({ rows }),
  setSavedRecipe: (savedRecipe) => set({ savedRecipe }),
  setYieldPortions: (yieldPortions) => set({ yieldPortions }),
  setActiveService: (activeService) => set({ activeService }),
  addRow: (row) => set((s) => ({ rows: [...s.rows, row] })),
  updateRow: (id, updates) =>
    set((s) => ({ rows: s.rows.map((r) => (r.id === id ? { ...r, ...updates } : r)) })),
  removeRow: (id) => set((s) => ({ rows: s.rows.filter((r) => r.id !== id) })),
  reset: () => set({ currentProduct: null, rows: [], savedRecipe: null, yieldPortions: 1, activeService: 'dine_in' }),
}))
