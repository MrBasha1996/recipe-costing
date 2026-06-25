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

// ── Valid body ────────────────────────────────────────────────────────
const VALID_BODY = {
  brand_id:     'brand-test',
  import_batch: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
}

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/purchases/apply', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('POST /api/purchases/apply', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireModulePermission.mockResolvedValue({ id: 'user-123' } as never)
    mockIsAuthError.mockReturnValue(false)
  })

  // ── 1. Body validation ───────────────────────────────────────────────
  it('400: body بدون brand_id', async () => {
    const { POST } = await import('@/app/api/purchases/apply/route')
    const res = await POST(makeReq({ import_batch: VALID_BODY.import_batch }))
    expect(res.status).toBe(400)
  })

  it('400: import_batch ليس UUID', async () => {
    const { POST } = await import('@/app/api/purchases/apply/route')
    const res = await POST(makeReq({ ...VALID_BODY, import_batch: 'not-a-uuid' }))
    expect(res.status).toBe(400)
  })

  // ── 2. فترة مغلقة ────────────────────────────────────────────────────
  it('423: تاريخ الشراء يقع في فترة مغلقة', async () => {
    mockCreateAdminClient.mockReturnValue(makeAdmin({
      brands:    [{ data: { closed_up_to: '2024-01' } }],
      purchases: [{ data: { purchase_date: '2024-01-10' } }],
    }) as never)

    const { POST } = await import('@/app/api/purchases/apply/route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(423)
    const body = await res.json()
    expect(body.error).toContain('مُغلقة')
  })

  // ── 3. WAC RPC يعيد ok: false ─────────────────────────────────────
  it('200 مع updated=0 عندما WAC يعيد ok=false', async () => {
    mockCreateAdminClient.mockReturnValue(makeAdmin(
      { brands: [{ data: { closed_up_to: null } }] },
      { data: { ok: false, updated: 0 }, error: null }
    ) as never)

    const { POST } = await import('@/app/api/purchases/apply/route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(0)
  })

  // ── 4. WAC RPC error ─────────────────────────────────────────────────
  it('500: WAC RPC يُرجع error', async () => {
    mockCreateAdminClient.mockReturnValue(makeAdmin(
      { brands: [{ data: { closed_up_to: null } }] },
      { data: null, error: { message: 'DB error' } }
    ) as never)

    const { POST } = await import('@/app/api/purchases/apply/route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(500)
  })

  // ── 5. نجاح كامل مع cascade ──────────────────────────────────────────
  it('200: نجاح مع WAC صحيح وcascade', async () => {
    const wacData = {
      ok: true,
      updated: 3,
      stock_updated: 3,
      price_history: 3,
      changed_ingredients: [{ sku: 'ING-001', new_cost: 10 }],
    }
    const admin = makeAdmin(
      {
        brands:     [{ data: { closed_up_to: null } }],
        audit_logs: [{ data: null }],
      },
      { data: wacData, error: null }
    )
    // cascade RPC call (second rpc call)
    const rpcMock = admin.rpc as ReturnType<typeof vi.fn>
    rpcMock
      .mockResolvedValueOnce({ data: wacData, error: null })
      .mockResolvedValueOnce({ data: { recipes_updated: 5 }, error: null })
      .mockResolvedValue({ data: null, error: null })

    mockCreateAdminClient.mockReturnValue(admin as never)

    const { POST } = await import('@/app/api/purchases/apply/route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.updated).toBe(3)
  })
})
