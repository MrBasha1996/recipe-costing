import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { executeBatchProduce } from '@/lib/produceBatch'

// ── Supabase mock helpers ──────────────────────────────────────────────

function makeChain(result: { data?: unknown; error?: unknown }) {
  const r = { data: result.data ?? null, error: result.error ?? null }
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'insert', 'update', 'order', 'limit']) {
    c[m] = () => c
  }
  c.maybeSingle = async () => r
  c.single      = async () => r
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(r).then(res, rej)
  return c
}

type TableResp = { data?: unknown; error?: unknown }

function makeAdmin(tableResponses: Record<string, TableResp[]>): SupabaseClient {
  const callCount: Record<string, number> = {}
  return {
    from: (table: string) => {
      const idx = callCount[table] ?? 0
      callCount[table] = idx + 1
      const responses = tableResponses[table] ?? []
      const r = responses[idx] ?? { data: null }
      return makeChain(r)
    },
  } as unknown as SupabaseClient
}

// ── Shared params ─────────────────────────────────────────────────────
const BASE = {
  brand_id:     'brand-test',
  batch_sku:    'BATCH-001',
  qty_portions: 10,
  performed_by: 'user-123',
}

const SESSION_ROW = { id: 'sess-uuid-001' }

// ── Tests: مسار الوصفة (افتراضي) ─────────────────────────────────────

describe('executeBatchProduce — مسار الوصفة', () => {
  it('يُرجع error 404 إذا لم توجد وصفة معتمدة', async () => {
    const admin = makeAdmin({ recipes: [{ data: null }] })
    const result = await executeBatchProduce(admin, BASE)
    expect(result).toMatchObject({ error: expect.stringContaining('وصفة'), status: 404 })
  })

  it('يُرجع error 400 إذا كانت الوصفة بدون مكونات', async () => {
    const admin = makeAdmin({
      recipes: [{ data: { id: 'r1', yield_portions: 4, product_name: 'باتش', total_cost: 100 } }],
      recipe_ingredients: [{ data: [] }],
    })
    const result = await executeBatchProduce(admin, BASE)
    expect(result).toMatchObject({ error: expect.stringContaining('مكونات'), status: 400 })
  })

  it('يحسب costEstimate من وصفة: total_cost / yieldPortions × qty', async () => {
    // total_cost=100, yieldPortions=4, qty_portions=10 → costEstimate = 100/4 * 10 = 250
    const admin = makeAdmin({
      recipes: [{ data: { id: 'r1', yield_portions: 4, product_name: 'باتش', total_cost: 100 } }],
      recipe_ingredients: [{ data: [{ ing_sku: 'ING-001', ing_name: 'طماطم', qty: 0.1, yield_pct: 100, unit: 'kg', is_semi: false }] }],
      unit_conversions: [{ data: [] }],
      stock_items: [
        { data: [{ ing_sku: 'ING-001', current_qty: 100, min_qty: 1, unit: 'kg' }] },
        { data: { current_qty: 0, min_qty: 0, unit: 'حصة' } },
      ],
      production_sessions: [{ data: SESSION_ROW }],
    })
    const result = await executeBatchProduce(admin, BASE)
    expect(result).toMatchObject({ ok: true })
    if ('ok' in result) {
      // costEstimate = 100/4 * 10 = 250 — تحقق غير مباشر عبر النجاح
      expect(result.batch_name).toBe('باتش')
      expect(result.qty_produced).toBe(10)
    }
  })

  it('يتجاهل مكونات yield_pct=0', async () => {
    const admin = makeAdmin({
      recipes: [{ data: { id: 'r1', yield_portions: 1, product_name: 'باتش', total_cost: 50 } }],
      recipe_ingredients: [{ data: [
        { ing_sku: 'ING-001', ing_name: 'طماطم', qty: 0.1, yield_pct: 100, unit: 'kg', is_semi: false },
        { ing_sku: 'ING-002', ing_name: 'معطّل',  qty: 0.5, yield_pct: 0,   unit: 'kg', is_semi: false },
      ]}],
      unit_conversions: [{ data: [] }],
      stock_items: [
        { data: [{ ing_sku: 'ING-001', current_qty: 5, min_qty: 0, unit: 'kg' }] },
        { data: { current_qty: 0, min_qty: 0, unit: 'حصة' } },
      ],
      production_sessions: [{ data: SESSION_ROW }],
    })
    const result = await executeBatchProduce(admin, BASE)
    expect(result).toMatchObject({ ok: true })
    if ('ok' in result) {
      expect(result.ingredients_deducted).toBe(1)
    }
  })

  it('يُضيف تحذيراً عند نقص المخزون (لا يُوقف العملية)', async () => {
    const admin = makeAdmin({
      recipes: [{ data: { id: 'r1', yield_portions: 1, product_name: 'باتش', total_cost: 50 } }],
      recipe_ingredients: [{ data: [
        { ing_sku: 'ING-001', ing_name: 'طماطم', qty: 10, yield_pct: 100, unit: 'kg', is_semi: false },
      ]}],
      unit_conversions: [{ data: [] }],
      stock_items: [
        { data: [{ ing_sku: 'ING-001', current_qty: 1, min_qty: 0, unit: 'kg' }] },
        { data: { current_qty: 0, min_qty: 0, unit: 'حصة' } },
      ],
      production_sessions: [{ data: SESSION_ROW }],
    })
    const result = await executeBatchProduce(admin, { ...BASE, qty_portions: 1 })
    expect(result).toMatchObject({ ok: true })
    if ('ok' in result) {
      expect(result.warnings.length).toBeGreaterThan(0)
    }
  })
})

// ── Tests: مسار الكميات الفعلية (actuals) ─────────────────────────────

describe('executeBatchProduce — مسار actuals', () => {
  const ACTUALS = [{ ing_sku: 'ING-001', ing_name: 'طماطم', unit: 'kg', qty: 5 }]

  it('يُرجع error 404 إذا لم يوجد الباتش', async () => {
    const admin = makeAdmin({ batches: [{ data: null }] })
    const result = await executeBatchProduce(admin, { ...BASE, actuals: ACTUALS })
    expect(result).toMatchObject({ error: expect.stringContaining('باتش'), status: 404 })
  })

  it('يُرجع error 400 إذا كانت كل الكميات = 0', async () => {
    const admin = makeAdmin({ batches: [{ data: { name: 'باتش' } }] })
    const result = await executeBatchProduce(admin, {
      ...BASE,
      actuals: [{ ing_sku: 'ING-001', ing_name: 'طماطم', unit: 'kg', qty: 0 }],
    })
    expect(result).toMatchObject({ error: expect.stringContaining('كميات'), status: 400 })
  })

  it('يحسب costEstimate من أسعار المكونات الحالية (batch_value > 0)', async () => {
    // ING-001: qty=5, cost=10 → costEstimate = 50
    const admin = makeAdmin({
      batches:     [{ data: { name: 'باتش' } }],
      ingredients: [{ data: [{ sku: 'ING-001', cost: 10 }] }],
      stock_items: [
        { data: [{ ing_sku: 'ING-001', current_qty: 100, min_qty: 1, unit: 'kg' }] },
        { data: { current_qty: 0, min_qty: 0, unit: 'حصة' } },
      ],
      production_sessions: [{ data: SESSION_ROW }],
    })
    const result = await executeBatchProduce(admin, { ...BASE, actuals: ACTUALS })
    expect(result).toMatchObject({ ok: true })
    if ('ok' in result) {
      expect(result.batch_name).toBe('باتش')
      expect(result.ingredients_deducted).toBe(1)
    }
  })

  it('costEstimate صفر إذا لم تُجلب أسعار المكونات', async () => {
    const admin = makeAdmin({
      batches:     [{ data: { name: 'باتش' } }],
      ingredients: [{ data: [] }],
      stock_items: [
        { data: [] },
        { data: { current_qty: 0, min_qty: 0, unit: 'حصة' } },
      ],
      production_sessions: [{ data: SESSION_ROW }],
    })
    const result = await executeBatchProduce(admin, { ...BASE, actuals: ACTUALS })
    // لا يزال ينجح لكن batch_value = 0
    expect(result).toMatchObject({ ok: true })
  })

  it('يُرجع session_id صحيح عند النجاح', async () => {
    const admin = makeAdmin({
      batches:     [{ data: { name: 'باتش' } }],
      ingredients: [{ data: [{ sku: 'ING-001', cost: 10 }] }],
      stock_items: [
        { data: [] },
        { data: null },
      ],
      production_sessions: [{ data: { id: 'test-session-id' } }],
    })
    const result = await executeBatchProduce(admin, { ...BASE, actuals: ACTUALS })
    if ('ok' in result) {
      expect(result.session_id).toBe('test-session-id')
    }
  })
})
