-- =====================================================
-- Migration 016: Combo Meals
-- =====================================================

-- جدول وجبات الكومبو
CREATE TABLE IF NOT EXISTS combo_meals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      text NOT NULL REFERENCES brands(id),
  sku           text NOT NULL,
  name          text NOT NULL,
  price         numeric(10,2) DEFAULT 0,
  app_price     numeric(10,2),
  total_cost    numeric(10,4) DEFAULT 0,
  food_cost_pct numeric(5,1)  DEFAULT 0,
  margin        numeric(10,2) DEFAULT 0,
  margin_app    numeric(10,2),
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (sku, brand_id)
);

-- جدول عناصر الكومبو
CREATE TABLE IF NOT EXISTS combo_meal_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id     uuid NOT NULL REFERENCES combo_meals(id) ON DELETE CASCADE,
  brand_id     text NOT NULL REFERENCES brands(id),
  product_sku  text NOT NULL,
  product_name text NOT NULL,
  qty          numeric(10,3) NOT NULL DEFAULT 1,
  unit_cost    numeric(10,4) DEFAULT 0,
  total_cost   numeric(10,4) DEFAULT 0,
  sort_order   int DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_combo_meals_brand ON combo_meals(brand_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON combo_meal_items(combo_id);

-- RLS
ALTER TABLE combo_meals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_meal_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "combo_meals_select" ON combo_meals;
DROP POLICY IF EXISTS "combo_meals_insert" ON combo_meals;
DROP POLICY IF EXISTS "combo_meals_update" ON combo_meals;
DROP POLICY IF EXISTS "combo_meals_delete" ON combo_meals;
DROP POLICY IF EXISTS "combo_items_select" ON combo_meal_items;
DROP POLICY IF EXISTS "combo_items_insert" ON combo_meal_items;
DROP POLICY IF EXISTS "combo_items_update" ON combo_meal_items;
DROP POLICY IF EXISTS "combo_items_delete" ON combo_meal_items;

CREATE POLICY "combo_meals_select" ON combo_meals FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND (brand_access = 'all' OR brand_access = combo_meals.brand_id)
  ));

CREATE POLICY "combo_meals_insert" ON combo_meals FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND (brand_access = 'all' OR brand_access = combo_meals.brand_id)
  ));

CREATE POLICY "combo_meals_update" ON combo_meals FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND (brand_access = 'all' OR brand_access = combo_meals.brand_id)
  ));

CREATE POLICY "combo_meals_delete" ON combo_meals FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND (brand_access = 'all' OR brand_access = combo_meals.brand_id)
  ));

CREATE POLICY "combo_items_select" ON combo_meal_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND (brand_access = 'all' OR brand_access = combo_meal_items.brand_id)
  ));

CREATE POLICY "combo_items_insert" ON combo_meal_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND (brand_access = 'all' OR brand_access = combo_meal_items.brand_id)
  ));

CREATE POLICY "combo_items_update" ON combo_meal_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND (brand_access = 'all' OR brand_access = combo_meal_items.brand_id)
  ));

CREATE POLICY "combo_items_delete" ON combo_meal_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
      AND (brand_access = 'all' OR brand_access = combo_meal_items.brand_id)
  ));

-- Module للصلاحيات
INSERT INTO modules (code, name, sort_order) VALUES
  ('combos', 'وجبات الكومبو', 16)
ON CONFLICT (code) DO NOTHING;

-- صلاحيات Super Admin كاملة
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
  AND m.code = 'combos'
ON CONFLICT (role_id, module_id) DO NOTHING;
