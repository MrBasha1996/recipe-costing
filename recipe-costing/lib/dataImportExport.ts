// Data import/export for ingredients, products, and batches
let _xlsx: typeof import('xlsx') | null = null
async function xlsx() {
  if (!_xlsx) _xlsx = await import('xlsx')
  return _xlsx
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrandId } from '@/types'

// ── Templates ─────────────────────────────────────────────────────

export async function downloadIngredientsTemplate(): Promise<void> {
  const X = await xlsx()
  const ws = X.utils.json_to_sheet([
    { 'SKU': 'i-001', 'الاسم': 'زيت نباتي', 'الفئة': 'زيوت', 'الوحدة': 'لتر', 'التكلفة': 8.50 },
    { 'SKU': 'i-002', 'الاسم': 'دقيق', 'الفئة': 'بقوليات', 'الوحدة': 'كيلو', 'التكلفة': 3.25 },
  ])
  ws['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 18 }, { wch: 12 }, { wch: 12 }]
  const wb = X.utils.book_new()
  X.utils.book_append_sheet(wb, ws, 'مواد خام')
  X.writeFile(wb, 'قالب_مواد_خام.xlsx')
}

export async function downloadProductsTemplate(): Promise<void> {
  const X = await xlsx()
  const ws = X.utils.json_to_sheet([
    { 'SKU': 'p-001', 'الاسم': 'فول جرة كبير', 'سعر البيع': 17.25, 'سعر التطبيق': 20.00, 'SKU التطبيق': '' },
    { 'SKU': 'p-002', 'الاسم': 'شاورما دجاج', 'سعر البيع': 23.00, 'سعر التطبيق': '', 'SKU التطبيق': '' },
  ])
  ws['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
  const wb = X.utils.book_new()
  X.utils.book_append_sheet(wb, ws, 'منتجات')
  X.writeFile(wb, 'قالب_منتجات.xlsx')
}

export async function downloadBatchesTemplate(): Promise<void> {
  const X = await xlsx()
  const ws = X.utils.json_to_sheet([
    { 'SKU': 'sk-001', 'الاسم': 'صوص الفول', 'الوحدة': 'كيلو' },
    { 'SKU': 'sk-002', 'الاسم': 'خلطة البهارات', 'الوحدة': 'جرام' },
  ])
  ws['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 12 }]
  const wb = X.utils.book_new()
  X.utils.book_append_sheet(wb, ws, 'باتشات')
  X.writeFile(wb, 'قالب_باتشات.xlsx')
}

// ── Export ────────────────────────────────────────────────────────

export async function exportIngredients(brand: BrandId, supabase: SupabaseClient): Promise<void> {
  const { data, error } = await (supabase.from('ingredients') as any)
    .select('sku, name, category, unit, cost')
    .eq('brand_id', brand)
    .order('name')
  if (error) throw error

  const X = await xlsx()
  const ws = X.utils.json_to_sheet(
    (data || []).map((r: any) => ({
      'SKU': r.sku,
      'الاسم': r.name,
      'الفئة': r.category,
      'الوحدة': r.unit,
      'التكلفة': r.cost,
    }))
  )
  ws['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 18 }, { wch: 12 }, { wch: 12 }]
  const wb = X.utils.book_new()
  X.utils.book_append_sheet(wb, ws, 'مواد خام')
  X.writeFile(wb, `مواد_خام_${brand}.xlsx`)
}

export async function exportProducts(brand: BrandId, supabase: SupabaseClient): Promise<void> {
  const { data, error } = await (supabase.from('products') as any)
    .select('sku, name, category, price, app_price, app_sku, unit')
    .eq('brand_id', brand)
    .order('name')
  if (error) throw error

  const X = await xlsx()
  const ws = X.utils.json_to_sheet(
    (data || []).map((r: any) => ({
      'SKU': r.sku,
      'الاسم': r.name,
      'الفئة': r.category,
      'سعر البيع': r.price,
      'سعر التطبيق': r.app_price ?? '',
      'SKU التطبيق': r.app_sku ?? '',
      'الوحدة': r.unit ?? '',
    }))
  )
  ws['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 }]
  const wb = X.utils.book_new()
  X.utils.book_append_sheet(wb, ws, 'منتجات')
  X.writeFile(wb, `منتجات_${brand}.xlsx`)
}

export async function exportBatches(brand: BrandId, supabase: SupabaseClient): Promise<void> {
  const { data, error } = await (supabase.from('batches') as any)
    .select('sku, name, unit')
    .eq('brand_id', brand)
    .order('name')
  if (error) throw error

  const X = await xlsx()
  const ws = X.utils.json_to_sheet(
    (data || []).map((r: any) => ({
      'SKU': r.sku,
      'الاسم': r.name,
      'الوحدة': r.unit,
    }))
  )
  ws['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 12 }]
  const wb = X.utils.book_new()
  X.utils.book_append_sheet(wb, ws, 'باتشات')
  X.writeFile(wb, `باتشات_${brand}.xlsx`)
}

// ── Import result types ───────────────────────────────────────────

export interface ImportRow {
  sku: string
  name: string
  [key: string]: any
}

export interface DataImportResult {
  inserted: number
  updated: number
  errors: { sku: string; message: string }[]
}

// ── Import: ingredients ───────────────────────────────────────────

export async function importIngredients(
  file: File,
  brand: BrandId,
  supabase: SupabaseClient,
): Promise<DataImportResult> {
  const rows = await parseSheet(file)
  const result: DataImportResult = { inserted: 0, updated: 0, errors: [] }

  for (const r of rows) {
    const sku  = String(r['SKU'] ?? '').trim()
    const name = String(r['الاسم'] ?? '').trim()
    if (!sku || !name) { result.errors.push({ sku: sku || '?', message: 'SKU أو الاسم مفقود' }); continue }

    const payload = {
      sku,
      brand_id: brand,
      name,
      category: String(r['الفئة'] ?? '').trim() || 'عام',
      unit:     String(r['الوحدة'] ?? '').trim() || 'وحدة',
      cost:     parseFloat(r['التكلفة']) || 0,
    }

    const { data: existing } = await (supabase.from('ingredients') as any)
      .select('sku').eq('sku', sku).eq('brand_id', brand).maybeSingle()

    if (existing) {
      const { error } = await (supabase.from('ingredients') as any)
        .update({ name: payload.name, category: payload.category, unit: payload.unit, cost: payload.cost })
        .eq('sku', sku).eq('brand_id', brand)
      if (error) result.errors.push({ sku, message: error.message })
      else result.updated++
    } else {
      const { error } = await (supabase.from('ingredients') as any).insert(payload)
      if (error) result.errors.push({ sku, message: error.message })
      else result.inserted++
    }
  }

  return result
}

// ── Import: products ──────────────────────────────────────────────

export async function importProducts(
  file: File,
  brand: BrandId,
  supabase: SupabaseClient,
): Promise<DataImportResult> {
  const rows = await parseSheet(file)
  const result: DataImportResult = { inserted: 0, updated: 0, errors: [] }

  for (const r of rows) {
    const sku  = String(r['SKU'] ?? '').trim()
    const name = String(r['الاسم'] ?? '').trim()
    if (!sku || !name) { result.errors.push({ sku: sku || '?', message: 'SKU أو الاسم مفقود' }); continue }

    const price    = parseFloat(r['سعر البيع']) || 0
    const appPrice = r['سعر التطبيق'] != null && String(r['سعر التطبيق']).trim() !== ''
      ? parseFloat(r['سعر التطبيق']) : null
    const appSku   = String(r['SKU التطبيق'] ?? '').trim() || null
    const unit     = String(r['الوحدة'] ?? '').trim() || null

    const { data: existing } = await (supabase.from('products') as any)
      .select('sku').eq('sku', sku).eq('brand_id', brand).maybeSingle()

    if (existing) {
      const { error } = await (supabase.from('products') as any)
        .update({ name, price, app_price: appPrice, app_sku: appSku, unit })
        .eq('sku', sku).eq('brand_id', brand)
      if (error) result.errors.push({ sku, message: error.message })
      else result.updated++
    } else {
      const { error } = await (supabase.from('products') as any)
        .insert({ sku, brand_id: brand, name, category: 'Meal', price, app_price: appPrice, app_sku: appSku, unit, is_base: false })
      if (error) result.errors.push({ sku, message: error.message })
      else result.inserted++
    }
  }

  return result
}

// ── Import: batches ───────────────────────────────────────────────

export async function importBatches(
  file: File,
  brand: BrandId,
  supabase: SupabaseClient,
): Promise<DataImportResult> {
  const rows = await parseSheet(file)
  const result: DataImportResult = { inserted: 0, updated: 0, errors: [] }

  for (const r of rows) {
    const sku  = String(r['SKU'] ?? '').trim()
    const name = String(r['الاسم'] ?? '').trim()
    if (!sku || !name) { result.errors.push({ sku: sku || '?', message: 'SKU أو الاسم مفقود' }); continue }

    const unit = String(r['الوحدة'] ?? '').trim() || 'وحدة'

    const { data: existing } = await (supabase.from('batches') as any)
      .select('sku').eq('sku', sku).eq('brand_id', brand).maybeSingle()

    if (existing) {
      const { error } = await (supabase.from('batches') as any)
        .update({ name, unit })
        .eq('sku', sku).eq('brand_id', brand)
      if (error) result.errors.push({ sku, message: error.message })
      else result.updated++
    } else {
      const { error } = await (supabase.from('batches') as any)
        .insert({ sku, brand_id: brand, name, unit })
      if (error) result.errors.push({ sku, message: error.message })
      else result.inserted++
    }
  }

  return result
}

// ── Shared helpers ────────────────────────────────────────────────

async function parseSheet(file: File): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('فشل قراءة الملف'))
    reader.onload = async e => {
      try {
        const X = await xlsx()
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = X.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        resolve(X.utils.sheet_to_json(ws))
      } catch (err: any) {
        reject(new Error(`خطأ في قراءة الملف: ${err.message}`))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}
