-- =====================================================
-- Migration 035: Modifier Groups & Sales
-- نظام إضافات الأصناف — 5 جداول + RLS + Module
-- =====================================================

-- ── 1. modifier_groups — تعريف مجموعة الإضافات ──────────────────────
CREATE TABLE IF NOT EXISTS modifier_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    text        NOT NULL REFERENCES brands(id),
  name        text        NOT NULL,
  is_required boolean     NOT NULL DEFAULT false,
  min_select  int         NOT NULL DEFAULT 0,
  max_select  int         NOT NULL DEFAULT 1,
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- ── 2. modifier_options — خيارات داخل كل مجموعة ────────────────────
CREATE TABLE IF NOT EXISTS modifier_options (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid         NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  brand_id    text         NOT NULL REFERENCES brands(id),
  option_sku  text         NOT NULL,
  name        text         NOT NULL,
  price       numeric(10,2) NOT NULL DEFAULT 0,
  total_cost  numeric(10,4) NOT NULL DEFAULT 0,
  sort_order  int          NOT NULL DEFAULT 0,
  is_active   boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  DEFAULT now(),
  UNIQUE (brand_id, option_sku)
);

-- ── 3. modifier_option_ingredients — مكونات كل خيار ─────────────────
-- نفس نمط recipe_ingredients تماماً
CREATE TABLE IF NOT EXISTS modifier_option_ingredients (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id   uuid          NOT NULL REFERENCES modifier_options(id) ON DELETE CASCADE,
  ing_sku     text          NOT NULL,
  ing_name    text          NOT NULL,
  qty         numeric(10,3) NOT NULL DEFAULT 0,
  unit        text          NOT NULL,
  unit_cost   numeric(10,6) NOT NULL DEFAULT 0,
  yield_pct   numeric(5,1)  NOT NULL DEFAULT 100,
  sort_order  int           NOT NULL DEFAULT 0
);

-- ── 4. product_modifier_groups — ربط المجموعات بالمنتجات ─────────────
CREATE TABLE IF NOT EXISTS product_modifier_groups (
  product_sku text NOT NULL,
  brand_id    text NOT NULL REFERENCES brands(id),
  group_id    uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  sort_order  int  NOT NULL DEFAULT 0,
  PRIMARY KEY (product_sku, brand_id, group_id)
);

-- ── 5. modifier_sales — مبيعات الإضافات المستوردة ───────────────────
-- date_from/date_to بدلاً من sale_date — التقرير فترة وليس يومي
CREATE TABLE IF NOT EXISTS modifier_sales (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     text          NOT NULL REFERENCES brands(id),
  date_from    date          NOT NULL,
  date_to      date          NOT NULL,
  option_sku   text          NOT NULL,
  option_name  text          NOT NULL,
  product_sku  text          NOT NULL,
  product_name text          NOT NULL,
  qty_sold     numeric(10,3) NOT NULL DEFAULT 0,
  revenue      numeric(10,2) NOT NULL DEFAULT 0,
  import_batch uuid          NOT NULL,
  imported_by  uuid          REFERENCES user_profiles(id),
  exploded_at  timestamptz   DEFAULT NULL,
  created_at   timestamptz   DEFAULT now(),
  UNIQUE (brand_id, date_from, date_to, option_sku, product_sku)
);

-- ── Indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_modifier_groups_brand     ON modifier_groups(brand_id);
CREATE INDEX IF NOT EXISTS idx_modifier_options_group    ON modifier_options(group_id);
CREATE INDEX IF NOT EXISTS idx_modifier_options_brand    ON modifier_options(brand_id, option_sku);
CREATE INDEX IF NOT EXISTS idx_modifier_opt_ings_option  ON modifier_option_ingredients(option_id);
CREATE INDEX IF NOT EXISTS idx_product_mod_groups_prod   ON product_modifier_groups(product_sku, brand_id);
CREATE INDEX IF NOT EXISTS idx_modifier_sales_brand_date ON modifier_sales(brand_id, date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_modifier_sales_batch      ON modifier_sales(import_batch);

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE modifier_groups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_options            ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_option_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifier_groups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_sales              ENABLE ROW LEVEL SECURITY;

-- ─── modifier_groups ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "modifier_groups_select" ON modifier_groups;
DROP POLICY IF EXISTS "modifier_groups_insert" ON modifier_groups;
DROP POLICY IF EXISTS "modifier_groups_update" ON modifier_groups;
DROP POLICY IF EXISTS "modifier_groups_delete" ON modifier_groups;

CREATE POLICY "modifier_groups_select" ON modifier_groups FOR SELECT TO authenticated
  USING (can_access_brand(brand_id) AND has_module_permission('modifiers', 'view'));
CREATE POLICY "modifier_groups_insert" ON modifier_groups FOR INSERT TO authenticated
  WITH CHECK (can_access_brand(brand_id) AND has_module_permission('modifiers', 'create'));
CREATE POLICY "modifier_groups_update" ON modifier_groups FOR UPDATE TO authenticated
  USING (can_access_brand(brand_id) AND has_module_permission('modifiers', 'update'));
CREATE POLICY "modifier_groups_delete" ON modifier_groups FOR DELETE TO authenticated
  USING (can_access_brand(brand_id) AND has_module_permission('modifiers', 'delete'));

-- ─── modifier_options ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "modifier_options_select" ON modifier_options;
DROP POLICY IF EXISTS "modifier_options_insert" ON modifier_options;
DROP POLICY IF EXISTS "modifier_options_update" ON modifier_options;
DROP POLICY IF EXISTS "modifier_options_delete" ON modifier_options;

CREATE POLICY "modifier_options_select" ON modifier_options FOR SELECT TO authenticated
  USING (can_access_brand(brand_id) AND has_module_permission('modifiers', 'view'));
CREATE POLICY "modifier_options_insert" ON modifier_options FOR INSERT TO authenticated
  WITH CHECK (can_access_brand(brand_id) AND has_module_permission('modifiers', 'create'));
CREATE POLICY "modifier_options_update" ON modifier_options FOR UPDATE TO authenticated
  USING (can_access_brand(brand_id) AND has_module_permission('modifiers', 'update'));
CREATE POLICY "modifier_options_delete" ON modifier_options FOR DELETE TO authenticated
  USING (can_access_brand(brand_id) AND has_module_permission('modifiers', 'delete'));

-- ─── modifier_option_ingredients — الوصول عبر option → brand_id ──────
DROP POLICY IF EXISTS "modifier_opt_ings_select" ON modifier_option_ingredients;
DROP POLICY IF EXISTS "modifier_opt_ings_insert" ON modifier_option_ingredients;
DROP POLICY IF EXISTS "modifier_opt_ings_update" ON modifier_option_ingredients;
DROP POLICY IF EXISTS "modifier_opt_ings_delete" ON modifier_option_ingredients;

CREATE POLICY "modifier_opt_ings_select" ON modifier_option_ingredients FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM modifier_options mo
    WHERE mo.id = option_id
      AND can_access_brand(mo.brand_id)
      AND has_module_permission('modifiers', 'view')
  ));
CREATE POLICY "modifier_opt_ings_insert" ON modifier_option_ingredients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM modifier_options mo
    WHERE mo.id = option_id
      AND can_access_brand(mo.brand_id)
      AND has_module_permission('modifiers', 'create')
  ));
CREATE POLICY "modifier_opt_ings_update" ON modifier_option_ingredients FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM modifier_options mo
    WHERE mo.id = option_id
      AND can_access_brand(mo.brand_id)
      AND has_module_permission('modifiers', 'update')
  ));
CREATE POLICY "modifier_opt_ings_delete" ON modifier_option_ingredients FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM modifier_options mo
    WHERE mo.id = option_id
      AND can_access_brand(mo.brand_id)
      AND has_module_permission('modifiers', 'delete')
  ));

-- ─── product_modifier_groups ──────────────────────────────────────────
DROP POLICY IF EXISTS "product_mod_groups_select" ON product_modifier_groups;
DROP POLICY IF EXISTS "product_mod_groups_insert" ON product_modifier_groups;
DROP POLICY IF EXISTS "product_mod_groups_update" ON product_modifier_groups;
DROP POLICY IF EXISTS "product_mod_groups_delete" ON product_modifier_groups;

CREATE POLICY "product_mod_groups_select" ON product_modifier_groups FOR SELECT TO authenticated
  USING (can_access_brand(brand_id) AND has_module_permission('modifiers', 'view'));
CREATE POLICY "product_mod_groups_insert" ON product_modifier_groups FOR INSERT TO authenticated
  WITH CHECK (can_access_brand(brand_id) AND has_module_permission('modifiers', 'create'));
CREATE POLICY "product_mod_groups_update" ON product_modifier_groups FOR UPDATE TO authenticated
  USING (can_access_brand(brand_id) AND has_module_permission('modifiers', 'update'));
CREATE POLICY "product_mod_groups_delete" ON product_modifier_groups FOR DELETE TO authenticated
  USING (can_access_brand(brand_id) AND has_module_permission('modifiers', 'delete'));

-- ─── modifier_sales ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "modifier_sales_select" ON modifier_sales;
DROP POLICY IF EXISTS "modifier_sales_insert" ON modifier_sales;
DROP POLICY IF EXISTS "modifier_sales_delete" ON modifier_sales;

CREATE POLICY "modifier_sales_select" ON modifier_sales FOR SELECT TO authenticated
  USING (can_access_brand(brand_id) AND has_module_permission('modifiers', 'view'));
CREATE POLICY "modifier_sales_insert" ON modifier_sales FOR INSERT TO authenticated
  WITH CHECK (can_access_brand(brand_id) AND has_module_permission('modifiers', 'import'));
CREATE POLICY "modifier_sales_delete" ON modifier_sales FOR DELETE TO authenticated
  USING (can_access_brand(brand_id) AND has_module_permission('modifiers', 'delete') AND exploded_at IS NULL);

-- ── Module + Super Admin Permissions ─────────────────────────────────
INSERT INTO modules (code, name, sort_order) VALUES
  ('modifiers', 'إضافات الأصناف', 35)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (
  role_id, module_id,
  can_view, can_create, can_update, can_delete,
  can_approve, can_import, can_edit_price, can_post, can_print, can_export
)
SELECT r.id, m.id,
  true, true, true, true,
  true, true, true, true, true, true
FROM roles r
CROSS JOIN modules m
WHERE r.is_super_admin = true
  AND m.code = 'modifiers'
ON CONFLICT (role_id, module_id) DO NOTHING;
