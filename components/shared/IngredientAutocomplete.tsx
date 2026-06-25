'use client'
import type { BrandId } from '@/types'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import type { ComponentItem, Ingredient } from '@/types'

interface Props {
  onSelect: (item: ComponentItem) => void
  placeholder?: string
}

export default function IngredientAutocomplete({ onSelect, placeholder = 'أضف مكوّن...' }: Props) {
  const { brand } = useParams() as { brand: BrandId }
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ComponentItem[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const [mounted, setMounted] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestQueryRef = useRef('')

  useEffect(() => { setMounted(true) }, [])

  // ── Position calculator ───────────────────────────────────────
  const calcDropdownStyle = useCallback(() => {
    if (!inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const maxH = 256
    const spaceBelow = viewportHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8

    const style: React.CSSProperties = {
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    }

    if (spaceBelow >= 120 || spaceBelow >= spaceAbove) {
      // Open downward
      style.top = rect.bottom + 4
      style.maxHeight = Math.min(maxH, spaceBelow)
    } else {
      // Open upward (input is near the bottom of the screen)
      style.bottom = viewportHeight - rect.top + 4
      style.maxHeight = Math.min(maxH, spaceAbove)
    }

    setDropdownStyle(style)
  }, [])

  // Recalculate on open and on window resize/scroll
  useEffect(() => {
    if (!open) return
    calcDropdownStyle()
    window.addEventListener('resize', calcDropdownStyle)
    window.addEventListener('scroll', calcDropdownStyle, true)
    return () => {
      window.removeEventListener('resize', calcDropdownStyle)
      window.removeEventListener('scroll', calcDropdownStyle, true)
    }
  }, [open, calcDropdownStyle])

  // ── Search ────────────────────────────────────────────────────
  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setOpen(false)
      setLoading(false)
      return
    }

    latestQueryRef.current = q
    setLoading(true)

    const supabase = createClient()
    const [{ data: ings }, { data: batchProducts }, { data: batchRecipes }] = await Promise.all([
      (supabase.from('ingredients') as any)
        .select('sku, name, category, unit, cost')
        .eq('brand_id', brand as string)
        .ilike('name', `%${q}%`)
        .order('name')
        .limit(20),
      (supabase.from('batches') as any)
        .select('sku, name, unit')
        .eq('brand_id', brand as string)
        .ilike('name', `%${q}%`)
        .limit(10),
      (supabase.from('recipes') as any)
        .select('sku, yield_portions, total_cost')
        .eq('brand_id', brand as string)
        .eq('is_semi', true)
        .limit(200),
    ])

    if (latestQueryRef.current !== q) return

    // Build a cost map from saved recipes: sku → cost per portion
    const recipeCostMap = new Map<string, number>()
    for (const r of (batchRecipes as any[]) || []) {
      recipeCostMap.set(r.sku, r.yield_portions > 0 ? r.total_cost / r.yield_portions : 0)
    }

    const ingItems: ComponentItem[] = ((ings as Ingredient[]) || []).map(i => ({
      sku: i.sku,
      name: i.name,
      unit: i.unit,
      cost: i.cost,
      category: i.category,
      is_semi: false,
    }))

    const semiItems: ComponentItem[] = ((batchProducts as any[]) || []).map(p => ({
      sku: p.sku,
      name: p.name,
      unit: p.unit ?? 'وحدة',
      cost: recipeCostMap.get(p.sku) ?? 0,
      category: 'Batch',
      is_semi: true,
    }))

    setResults([...semiItems, ...ingItems])
    setOpen(true)
    setLoading(false)
  }, [brand])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  // ── Handlers ──────────────────────────────────────────────────
  function handleSelect(item: ComponentItem) {
    onSelect(item)
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  function handleBlur() {
    // Fallback: close if user clicks truly outside the component.
    // The portal's onMouseDown + preventDefault prevents this from
    // firing during normal item selection.
    setTimeout(() => setOpen(false), 200)
  }

  // ── Dropdown (rendered via portal to escape overflow:hidden) ──
  const dropdown = mounted && open && results.length > 0
    ? createPortal(
        <div
          style={dropdownStyle}
          className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-y-auto"
          // Prevent input blur when interacting with the list
          onMouseDown={e => e.preventDefault()}
        >
          {results.map(item => (
            <button
              key={`${item.sku}-${item.is_semi}`}
              onMouseDown={() => handleSelect(item)}
              className="w-full text-right px-3 py-2.5 hover:bg-gray-50 flex items-center justify-between gap-2 border-b border-gray-100 last:border-0 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 truncate">{item.name}</div>
                <div className="text-xs text-gray-400 font-mono">{item.sku}</div>
              </div>
              <div className="flex-shrink-0 text-left space-y-0.5">
                <div className="text-xs text-gray-500">{item.unit}</div>
                <div className={`text-xs px-1.5 py-0.5 rounded-full text-center ${
                  item.is_semi
                    ? 'bg-purple-50 text-purple-600'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {item.is_semi ? '⚙ Batch' : item.category}
                </div>
                {item.is_semi && item.cost === 0 && (
                  <div className="text-xs text-amber-500 text-center">لا تكلفة</div>
                )}
              </div>
            </button>
          ))}
        </div>,
        document.body,
      )
    : null

  // ── Loading (also via portal, same position) ──────────────────
  const loadingPortal = mounted && loading && !open
    ? createPortal(
        <div
          style={dropdownStyle}
          className="bg-white border border-gray-200 rounded-lg shadow-xl px-3 py-2.5 flex items-center gap-2"
          onMouseDown={e => e.preventDefault()}
        >
          <span className="w-3 h-3 border border-gray-300 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
          <span className="text-xs text-gray-500">جارٍ البحث...</span>
        </div>,
        document.body,
      )
    : null

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => { if (query && results.length > 0) { calcDropdownStyle(); setOpen(true) } }}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-400"
      />
      {dropdown}
      {loadingPortal}
    </div>
  )
}
