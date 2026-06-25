import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────
vi.mock('@/lib/auth', () => ({
  requireModulePermission: vi.fn(),
  isAuthError: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { requireModulePermission, isAuthError } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const mockRequireModulePermission = vi.mocked(requireModulePermission)
const mockIsAuthError             = vi.mocked(isAuthError)
const mockCreateAdminClient       = vi.mocked(createAdminClient)

// ── Supabase mock helpers ──────────────────────────────────────────────

function makeChain(result: { data?: unknown; error?: unknown }) {
  const r = { data: result.data ?? null, error: result.error ?? null }
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'insert', 'update']) {
    c[m] = () => c
  }
  c.maybeSingle = async () => r
  c.single      = async () => r
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(r).then(res, rej)
  return c
}

function makeAdmin(tableResponses: Record<string, Array<{ data?: unknown; error?: unknown }>>, rpcResult?: { data?: unknown; error?: unknown }) {
  const callCount: Record<string, number> = {}
  return {
    from: (table: string) => {
      const idx = callCount[table] ?? 0
      callCount[table] = idx + 1
      const responses = tableResponses[table] ?? []
      const r = responses[idx] ?? { data: null }
      return makeChain(r)
    },
    rpc: vi.fn().mockResolvedValue(rpcResult ?? { data: null, error: null }),
  }
}

// ── Valid body ─────────────────────────────────────────────────────────
const SESSION_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const BRAND_ID   = 'brand-test'

const VALID_ITEM = {
  id:         'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  ing_sku:    'ING-001',
  ing_name:   'طماطم',
  unit:       'kg',
  actual_qty: 5,
  unit_cost:  10,
  min_qty:    1,
}

function makeReq(body: unknown) {
  return new NextRequest(`http://localhost/api/stocktake/${SESSION_ID}/finalize`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeParams() {
  return { params: Promise.resolve({ id: SESSION_ID }) }
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('POST /api/stocktake/[id]/finalize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireModulePermission.mockResolvedValue({ id: 'user-123' } as never)
    mockIsAuthError.mockReturnValue(false)
  })

  // ── 1. Body validation ───────────────────────────────────────────────
  it('400: session_items فارغة', async () => {
    const { POST } = await import('@/app/api/stocktake/[id]/finalize/route')
    const res = await POST(makeReq({ brand_id: BRAND_ID, session_items: [] }), makeParams() as any)
    expect(res.status).toBe(400)
  })

  it('400: body بدون brand_id', async () => {
    const { POST } = await import('@/app/api/stocktake/[id]/finalize/route')
    const res = await POST(makeReq({ session_items: [VALID_ITEM] }), makeParams() as any)
    expect(res.status).toBe(400)
  })

  // ── 2. الجلسة غير موجودة ──────────────────────────────────────────
  it('404: الجلسة غير موجودة', async () => {
    mockCreateAdminClient.mockReturnValue(makeAdmin({
      stocktake_sessions: [{ data: null }],
    }) as never)

    const { POST } = await import('@/app/api/stocktake/[id]/finalize/route')
    const res = await POST(
      makeReq({ brand_id: BRAND_ID, session_items: [VALID_ITEM] }),
      makeParams() as any
    )
    expect(res.status).toBe(404)
  })

  // ── 3. الجلسة مكتملة مسبقاً ──────────────────────────────────────
  it('409: الجلسة ليست open', async () => {
    mockCreateAdminClient.mockReturnValue(makeAdmin({
      stocktake_sessions: [{ data: { id: SESSION_ID, brand_id: BRAND_ID, status: 'finalized', session_date: '2024-02-15' } }],
    }) as never)

    const { POST } = await import('@/app/api/stocktake/[id]/finalize/route')
    const res = await POST(
      makeReq({ brand_id: BRAND_ID, session_items: [VALID_ITEM] }),
      makeParams() as any
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('مكتملة')
  })

  // ── 4. فترة مغلقة ────────────────────────────────────────────────────
  it('423: الجرد في فترة مغلقة', async () => {
    mockCreateAdminClient.mockReturnValue(makeAdmin({
      stocktake_sessions: [{ data: { id: SESSION_ID, brand_id: BRAND_ID, status: 'open', session_date: '2024-01-20' } }],
      brands:             [{ data: { closed_up_to: '2024-01' } }],
    }) as never)

    const { POST } = await import('@/app/api/stocktake/[id]/finalize/route')
    const res = await POST(
      makeReq({ brand_id: BRAND_ID, session_items: [VALID_ITEM] }),
      makeParams() as any
    )
    expect(res.status).toBe(423)
    const body = await res.json()
    expect(body.error).toContain('مُغلقة')
  })

  // ── 5. نجاح كامل ─────────────────────────────────────────────────────
  it('200: إنهاء جرد ناجح', async () => {
    mockCreateAdminClient.mockReturnValue(makeAdmin(
      {
        stocktake_sessions: [{ data: { id: SESSION_ID, brand_id: BRAND_ID, status: 'open', session_date: '2024-02-15' } }],
        brands:             [{ data: { closed_up_to: null } }],
        stocktake_items:    [{ data: null }],
        stock_items:        [{ data: [{ ing_sku: 'ING-001', current_qty: 4 }] }],
      },
      { data: null, error: null }
    ) as never)

    const { POST } = await import('@/app/api/stocktake/[id]/finalize/route')
    const res = await POST(
      makeReq({ brand_id: BRAND_ID, session_items: [VALID_ITEM] }),
      makeParams() as any
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  // ── 6. RPC error ────────────────────────────────────────────────────
  it('500: apply_stocktake_writes يُرجع error', async () => {
    mockCreateAdminClient.mockReturnValue(makeAdmin(
      {
        stocktake_sessions: [{ data: { id: SESSION_ID, brand_id: BRAND_ID, status: 'open', session_date: '2024-02-15' } }],
        brands:             [{ data: { closed_up_to: null } }],
        stocktake_items:    [{ data: null }],
        stock_items:        [{ data: [] }],
      },
      { data: null, error: { message: 'DB error' } }
    ) as never)

    const { POST } = await import('@/app/api/stocktake/[id]/finalize/route')
    const res = await POST(
      makeReq({ brand_id: BRAND_ID, session_items: [VALID_ITEM] }),
      makeParams() as any
    )
    expect(res.status).toBe(500)
  })
})
