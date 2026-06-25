-- =====================================================
-- Migration 022: Activate Branches Table
-- - Adds unique constraint on (brand_id, name) for upserts
-- - Replaces old my_role() RLS with has_module_permission
-- - Adds 'branches' RBAC module
-- - Syncs historical branch names from daily_sales
-- =====================================================

-- ── 1. إضافة unique constraint على (brand_id, name) للـ upsert ──────
ALTER TABLE branches
  ADD CONSTRAINT branches_brand_name_unique UNIQUE (brand_id, name);

-- ── 2. موديول branches للـ RBAC ──────────────────────────────────────
INSERT INTO modules (code, name, sort_order) VALUES
  ('branches', 'الفروع', 16)
ON CONFLICT (code) DO NOTHING;

-- ── 3. Super Admin يحصل على branches ─────────────────────────────────
INSERT INTO role_permissions (role_id, module_id, can_view, can_create, can_update, can_delete)
SELECT r.id, m.id, true, true, true, true
FROM roles r
CROSS JOIN modules m
WHERE r.is_super_admin = true AND m.code = 'branches'
ON CONFLICT (role_id, module_id) DO NOTHING;

-- ── 4. تنظيف RLS القديم (يستخدم my_role='accountant') ─────────────────
DROP POLICY IF EXISTS branches_write  ON branches;
DROP POLICY IF EXISTS branches_select ON branches;

-- ── 5. RLS جديد بنظام RBAC ────────────────────────────────────────────
CREATE POLICY "branches_select_v2" ON branches
  FOR SELECT USING (can_access_brand(brand_id));

CREATE POLICY "branches_insert_v2" ON branches
  FOR INSERT WITH CHECK (
    can_access_brand(brand_id)
    AND has_module_permission('branches', 'create')
  );

CREATE POLICY "branches_update_v2" ON branches
  FOR UPDATE USING (
    can_access_brand(brand_id)
    AND has_module_permission('branches', 'update')
  );

CREATE POLICY "branches_delete_v2" ON branches
  FOR DELETE USING (
    can_access_brand(brand_id)
    AND has_module_permission('branches', 'delete')
  );

-- ── 6. مزامنة الفروع التاريخية من daily_sales ─────────────────────────
-- يُدرج الفروع الموجودة في المبيعات التاريخية إن لم تكن مسجّلة
INSERT INTO branches (brand_id, name, is_active)
SELECT DISTINCT brand_id, branch_name, true
FROM daily_sales
WHERE branch_name IS NOT NULL
  AND branch_name != ''
ON CONFLICT (brand_id, name) DO NOTHING;

-- purchases لا تحتوي على عمود branch_name — المزامنة من daily_sales تكفي
