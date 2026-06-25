-- =====================================================
-- Migration 003: Operations — Purchases, Sales, Costs
-- Run in Supabase Dashboard → SQL Editor
-- =====================================================

-- تحديث الأدوار (إضافة management)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('accountant', 'ops', 'kitchen', 'management'));

-- ── المشتريات ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      text NOT NULL REFERENCES brands(id),
  purchase_date date NOT NULL,
  supplier_name text NOT NULL,
  ing_sku       text,
  ing_name      text NOT NULL,
  qty           numeric(10,3) NOT NULL,
  unit          text NOT NULL,
  total_price   numeric(10,2) NOT NULL,
  unit_cost     numeric(10,6) NOT NULL,
  import_batch  uuid NOT NULL,
  imported_by   uuid REFERENCES user_profiles(id),
  created_at    timestamptz DEFAULT now()
);

-- ── المبيعات اليومية ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_sales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      text NOT NULL REFERENCES brands(id),
  sale_date     date NOT NULL,
  product_sku   text NOT NULL,
  product_name  text NOT NULL,
  qty_sold      numeric(10,3) NOT NULL,
  revenue       numeric(10,2) NOT NULL,
  import_batch  uuid NOT NULL,
  imported_by   uuid REFERENCES user_profiles(id),
  created_at    timestamptz DEFAULT now()
);

-- ── تكاليف العمالة ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labor_costs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    text NOT NULL REFERENCES brands(id),
  month       text NOT NULL,
  description text NOT NULL,
  amount      numeric(10,2) NOT NULL,
  created_by  uuid REFERENCES user_profiles(id),
  created_at  timestamptz DEFAULT now()
);

-- ── التكاليف الثابتة ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS overhead_costs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    text NOT NULL REFERENCES brands(id),
  month       text NOT NULL,
  category    text NOT NULL CHECK (category IN ('rent','electricity','gas','maintenance','marketing','other')),
  description text NOT NULL,
  amount      numeric(10,2) NOT NULL,
  created_by  uuid REFERENCES user_profiles(id),
  created_at  timestamptz DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_purchases_brand_date  ON purchases(brand_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_batch       ON purchases(import_batch);
CREATE INDEX IF NOT EXISTS idx_purchases_sku         ON purchases(brand_id, ing_sku);
CREATE INDEX IF NOT EXISTS idx_daily_sales_brand_date ON daily_sales(brand_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_daily_sales_batch     ON daily_sales(import_batch);
CREATE INDEX IF NOT EXISTS idx_labor_brand_month     ON labor_costs(brand_id, month);
CREATE INDEX IF NOT EXISTS idx_overhead_brand_month  ON overhead_costs(brand_id, month);

-- ── RLS ───────────────────────────────────────────────────────────
-- الفلسفة: كل سياسة تدمج شرطين:
--   1. can_access_brand  → البراند المسموح به للمستخدم
--   2. my_role()         → الدور المخوّل بهذه العملية
-- النتيجة: محاسب TI لا يرى ولا يكتب بيانات BB أبداً

ALTER TABLE purchases      ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sales    ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_costs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE overhead_costs ENABLE ROW LEVEL SECURITY;

-- ── Cleanup ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS purchases_select  ON purchases;
DROP POLICY IF EXISTS purchases_insert  ON purchases;
DROP POLICY IF EXISTS purchases_update  ON purchases;
DROP POLICY IF EXISTS purchases_delete  ON purchases;
DROP POLICY IF EXISTS sales_select      ON daily_sales;
DROP POLICY IF EXISTS sales_insert      ON daily_sales;
DROP POLICY IF EXISTS sales_update      ON daily_sales;
DROP POLICY IF EXISTS sales_delete      ON daily_sales;
DROP POLICY IF EXISTS labor_select      ON labor_costs;
DROP POLICY IF EXISTS labor_insert      ON labor_costs;
DROP POLICY IF EXISTS labor_update      ON labor_costs;
DROP POLICY IF EXISTS labor_delete      ON labor_costs;
DROP POLICY IF EXISTS overhead_select   ON overhead_costs;
DROP POLICY IF EXISTS overhead_insert   ON overhead_costs;
DROP POLICY IF EXISTS overhead_update   ON overhead_costs;
DROP POLICY IF EXISTS overhead_delete   ON overhead_costs;

-- ─────────────────────────────────────────────────────────────────
-- PURCHASES — المشتريات
-- قراءة:    كل من لديه صلاحية البراند (لأغراض التقارير)
-- كتابة:    محاسب فقط ضمن براند المسموح له
-- حذف:      محاسب فقط ضمن براند المسموح له
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY purchases_select ON purchases
  FOR SELECT
  USING (can_access_brand(brand_id));

CREATE POLICY purchases_insert ON purchases
  FOR INSERT
  WITH CHECK (
    can_access_brand(brand_id)
    AND my_role() = 'accountant'
  );

CREATE POLICY purchases_update ON purchases
  FOR UPDATE
  USING (
    can_access_brand(brand_id)
    AND my_role() = 'accountant'
  );

CREATE POLICY purchases_delete ON purchases
  FOR DELETE
  USING (
    can_access_brand(brand_id)
    AND my_role() = 'accountant'
  );

-- ─────────────────────────────────────────────────────────────────
-- DAILY_SALES — المبيعات اليومية
-- قراءة:    كل من لديه صلاحية البراند
-- إدخال:    محاسب + تشغيل ضمن البراند المسموح
-- تعديل:    محاسب + تشغيل ضمن البراند المسموح
-- حذف:      محاسب فقط (حماية البيانات التاريخية)
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY sales_select ON daily_sales
  FOR SELECT
  USING (can_access_brand(brand_id));

CREATE POLICY sales_insert ON daily_sales
  FOR INSERT
  WITH CHECK (
    can_access_brand(brand_id)
    AND my_role() IN ('accountant', 'ops')
  );

CREATE POLICY sales_update ON daily_sales
  FOR UPDATE
  USING (
    can_access_brand(brand_id)
    AND my_role() IN ('accountant', 'ops')
  );

CREATE POLICY sales_delete ON daily_sales
  FOR DELETE
  USING (
    can_access_brand(brand_id)
    AND my_role() = 'accountant'
  );

-- ─────────────────────────────────────────────────────────────────
-- LABOR_COSTS — تكاليف العمالة
-- قراءة:    محاسب + إدارة عليا ضمن البراند (للتقارير)
-- كتابة:    محاسب فقط ضمن البراند
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY labor_select ON labor_costs
  FOR SELECT
  USING (
    can_access_brand(brand_id)
    AND my_role() IN ('accountant', 'management')
  );

CREATE POLICY labor_insert ON labor_costs
  FOR INSERT
  WITH CHECK (
    can_access_brand(brand_id)
    AND my_role() = 'accountant'
  );

CREATE POLICY labor_update ON labor_costs
  FOR UPDATE
  USING (
    can_access_brand(brand_id)
    AND my_role() = 'accountant'
  );

CREATE POLICY labor_delete ON labor_costs
  FOR DELETE
  USING (
    can_access_brand(brand_id)
    AND my_role() = 'accountant'
  );

-- ─────────────────────────────────────────────────────────────────
-- OVERHEAD_COSTS — التكاليف الثابتة
-- قراءة:    محاسب + إدارة عليا ضمن البراند (للتقارير)
-- كتابة:    محاسب فقط ضمن البراند
-- ─────────────────────────────────────────────────────────────────
CREATE POLICY overhead_select ON overhead_costs
  FOR SELECT
  USING (
    can_access_brand(brand_id)
    AND my_role() IN ('accountant', 'management')
  );

CREATE POLICY overhead_insert ON overhead_costs
  FOR INSERT
  WITH CHECK (
    can_access_brand(brand_id)
    AND my_role() = 'accountant'
  );

CREATE POLICY overhead_update ON overhead_costs
  FOR UPDATE
  USING (
    can_access_brand(brand_id)
    AND my_role() = 'accountant'
  );

CREATE POLICY overhead_delete ON overhead_costs
  FOR DELETE
  USING (
    can_access_brand(brand_id)
    AND my_role() = 'accountant'
  );
