-- =====================================================
-- Migration 014: Labor Department + Monthly Budgets
-- Run AFTER 013_expiry_suppliers.sql
-- =====================================================

-- ── 1. إضافة حقل القسم لتكاليف العمالة ───────────────────────────
ALTER TABLE labor_costs
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'other'
  CHECK (department IN ('kitchen','service','cashier','delivery','admin','other'));

-- ── 2. جدول الميزانية الشهرية ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_budgets (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            text        NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  month               text        NOT NULL,
  revenue_target      numeric(12,2),
  fc_pct_target       numeric(5,2),
  labor_pct_target    numeric(5,2),
  overhead_pct_target numeric(5,2),
  created_by          uuid        REFERENCES user_profiles(id),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (brand_id, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_budgets_brand_month ON monthly_budgets(brand_id, month);

-- ── 3. RLS على monthly_budgets ─────────────────────────────────────
ALTER TABLE monthly_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budgets_select" ON monthly_budgets;
DROP POLICY IF EXISTS "budgets_insert" ON monthly_budgets;
DROP POLICY IF EXISTS "budgets_update" ON monthly_budgets;
DROP POLICY IF EXISTS "budgets_delete" ON monthly_budgets;

CREATE POLICY "budgets_select" ON monthly_budgets
  FOR SELECT USING (can_access_brand(brand_id));

CREATE POLICY "budgets_insert" ON monthly_budgets
  FOR INSERT WITH CHECK (
    can_access_brand(brand_id)
    AND my_role() IN ('accountant', 'management')
  );

CREATE POLICY "budgets_update" ON monthly_budgets
  FOR UPDATE USING (
    can_access_brand(brand_id)
    AND my_role() IN ('accountant', 'management')
  );

CREATE POLICY "budgets_delete" ON monthly_budgets
  FOR DELETE USING (
    can_access_brand(brand_id)
    AND my_role() = 'accountant'
  );

-- ── 4. RBAC: تسجيل موديول الميزانية ──────────────────────────────
INSERT INTO modules (code, name, sort_order, is_active)
VALUES ('budget', 'الميزانية', 97, true)
ON CONFLICT (code) DO NOTHING;
