-- =====================================================
-- Migration 004: Branches + Foodics Sales Fields + Waste Log
-- =====================================================

-- ── الفروع ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   text NOT NULL REFERENCES brands(id),
  name       text NOT NULL,
  ref        text,                    -- مرجع الفرع في Foodics (مثل B01)
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (brand_id, ref)
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY branches_select ON branches FOR SELECT USING (can_access_brand(brand_id));
CREATE POLICY branches_write  ON branches FOR ALL   USING (can_access_brand(brand_id) AND my_role() = 'accountant');

CREATE INDEX IF NOT EXISTS idx_branches_brand ON branches(brand_id);

-- ── تحديث daily_sales — إضافة حقول Foodics ───────────────────────
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS branch_name    text;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS branch_ref     text;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS tax_amount     numeric(10,2) DEFAULT 0;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) DEFAULT 0;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS return_amount  numeric(10,2) DEFAULT 0;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS return_qty     numeric(10,3) DEFAULT 0;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS cancel_amount  numeric(10,2) DEFAULT 0;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS cancel_qty     numeric(10,3) DEFAULT 0;
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS cost_pos       numeric(10,2) DEFAULT 0;  -- التكلفة من Foodics
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS source         text DEFAULT 'excel';      -- excel | foodics

-- ── سجل الهدر والإلغاءات ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waste_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     text NOT NULL REFERENCES brands(id),
  branch_name  text,
  branch_ref   text,
  log_date     date NOT NULL,
  product_sku  text,
  product_name text NOT NULL,
  qty          numeric(10,3) NOT NULL DEFAULT 0,
  value        numeric(10,2) DEFAULT 0,
  waste_type   text NOT NULL CHECK (waste_type IN ('cancellation','return','spoilage','expiry','other')),
  reason       text,
  order_ref    text,
  was_wasted   boolean DEFAULT false,
  import_batch uuid,
  created_by   uuid REFERENCES user_profiles(id),
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE waste_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY waste_select ON waste_log FOR SELECT USING (can_access_brand(brand_id));
CREATE POLICY waste_insert ON waste_log FOR INSERT WITH CHECK (can_access_brand(brand_id) AND my_role() IN ('accountant','ops'));
CREATE POLICY waste_delete ON waste_log FOR DELETE USING (can_access_brand(brand_id) AND my_role() = 'accountant');

CREATE INDEX IF NOT EXISTS idx_waste_brand_date  ON waste_log(brand_id, log_date);
CREATE INDEX IF NOT EXISTS idx_waste_brand_batch ON waste_log(import_batch);
CREATE INDEX IF NOT EXISTS idx_daily_sales_branch ON daily_sales(brand_id, branch_ref, sale_date);
