import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks (hoisted by Vitest) ─────────────────────────────────────
vi.mock('@/lib/auth', () => ({
  requireModulePermission: vi.fn(),
  isAuthError: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/produceBatch', () => ({
  executeBatchProduce: vi.fn(),
}))

import { requireModulePermission, isAuthError } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const mockRequireModulePermission = vi.mocked(requireModulePermission)
const mockIsAuthError             = vi.mocked(isAuthError)
const mockCreateAdminClient       = vi.mocked(createAdminClient)

// ── Supabase mock helpers ─────────────────────────────────────────

/** بناء chain قابل للـ await مع .maybeSingle() */
function makeChain(result: { data?: unknown; error?: unknown }) {
  const r = { data: result.data ?? null, error: result.error ?? null }
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'insert']) {
    c[m] = () => c
  }
  c.maybeSingle = async () => r
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(r).then(res, rej)
  return c
}

/**
 * يبني admin mock حيث كل جدول له قائمة ردود مرتّبة.
 * كل استدعاء from(table) يستهلك الرد التالي في القائمة.
 */
function makeAdmin(tableResponses: Record<string, Array<{ data?: unknown; error?: unknown }>>) {
  const callCount: Record<string, number> = {}
  return {
    from: (table: string) => {
      const idx = callCount[table] ?? 0
      callCount[table] = idx + 1
      const responses = tableResponses[table] ?? []
      const r = responses[idx] ?? { data: null }
      return makeChain(r)
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

// ── Valid body لاستخدامها في tests ─────────────────────────────────
// ملاحظة: Zod v4 يتحقق من version nibble (يجب أن يكون 1-8)
const VALID_BODY = {
  brand_id:     'brand-test',
  import_batch: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
}

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/sales/explode', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Tests ──────────────────────────────────────────────────────────

describe('POST /api/sales/explode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireModulePermission.mockResolvedValue({ id: 'user-123' } as never)
    mockIsAuthError.mockReturnValue(false)
  })

  // ── 1. Body غير صالح ────────────────────────────────────────────
  it('400: body بدون brand_id', async () => {
    const { POST } = await import('@/app/api/sales/explode/route')
    const res = await POST(makeReq({ import_batch: VALID_BODY.import_batch }))
    expect(res.status).toBe(400)
  })

  it('400: body بدون import_batch', async () => {
    const { POST } = await import('@/app/api/sales/explode/route')
    const res = await POST(makeReq({ brand_id: VALID_BODY.brand_id }))
    expect(res.status).toBe(400)
  })

  it('400: import_batch ليس UUID', async () => {
    const { POST } = await import('@/app/api/sales/explode/route')
    const res = await POST(makeReq({ ...VALID_BODY, import_batch: 'not-a-uuid' }))
    expect(res.status).toBe(400)
  })

  // ── 2. فترة مغلقة ────────────────────────────────────────────────
  it('423: تاريخ البيع يقع في فترة مغلقة', async () => {
    mockCreateAdminClient.mockReturnValue(makeAdmin({
      brands:      [{ data: { closed_up_to: '2024-01' } }],
      daily_sales: [
        // first call: .maybeSingle() للتاريخ الأقدم
        { data: { sale_date: '2024-01-15' } },
      ],
    }) as never)

    const { POST } = await import('@/app/api/sales/explode/route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(423)
    const body = await res.json()
    expect(body.error).toContain('مُغلقة')
  })

  // ── 3. لا مبيعات ─────────────────────────────────────────────────
  it('200: لا مبيعات في الدفعة → exploded=0', async () => {
    mockCreateAdminClient.mockReturnValue(makeAdmin({
      brands:      [{ data: { closed_up_to: null } }],
      daily_sales: [{ data: [] }],
    }) as never)

    const { POST } = await import('@/app/api/sales/explode/route')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.exploded).toBe(0)
    expect(body.skipped).toBe(0)
  })
})
