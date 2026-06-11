-- =====================================================
-- Migration 018: Production Sessions
-- جلسات الإنتاج — جدول يربط كل حركات نفس الجلسة معاً
-- =====================================================

-- 1. جدول جلسات الإنتاج
CREATE TABLE IF NOT EXISTS production_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      TEXT NOT NULL REFERENCES brands(id),
  batch_sku     TEXT NOT NULL,
  batch_name    TEXT NOT NULL,
  qty_portions  NUMERIC(10,3) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'approved', 'cancelled')),
  performed_by  UUID REFERENCES user_profiles(id),
  approved_by   UUID REFERENCES user_profiles(id),
  approved_at   TIMESTAMPTZ,
  note          TEXT,
  cost_estimate NUMERIC(12,2),
  warnings      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ربط حركات المخزون بجلسة الإنتاج
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS production_session_id UUID
    REFERENCES production_sessions(id) ON DELETE SET NULL;

-- 3. فهارس
CREATE INDEX IF NOT EXISTS idx_prod_sessions_brand
  ON production_sessions(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_mov_session
  ON stock_movements(production_session_id)
  WHERE production_session_id IS NOT NULL;

-- 4. RLS
ALTER TABLE production_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_sessions_all"
  ON production_sessions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
