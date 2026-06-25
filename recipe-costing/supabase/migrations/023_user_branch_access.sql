-- =====================================================
-- Migration 023: User Branch Access
-- Allows restricting users to specific branches.
-- Rule: no rows in user_branch_access = all branches allowed.
-- Branch isolation is enforced via RLS + UI (not middleware,
-- since branch is not in the URL).
-- =====================================================

-- ── 1. جدول user_branch_access ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_branch_access (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id)      ON DELETE CASCADE,
  UNIQUE (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_uba_user   ON user_branch_access(user_id);
CREATE INDEX IF NOT EXISTS idx_uba_branch ON user_branch_access(branch_id);

ALTER TABLE user_branch_access ENABLE ROW LEVEL SECURITY;

-- أي مستخدم مصادَّق يرى سجلاته الخاصة (وأي super admin / users manager يرى الكل)
CREATE POLICY "uba_select" ON user_branch_access
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- فقط من عنده صلاحية update للـ users يعدّل
CREATE POLICY "uba_insert" ON user_branch_access
  FOR INSERT WITH CHECK (has_module_permission('users', 'update'));

CREATE POLICY "uba_delete" ON user_branch_access
  FOR DELETE USING (has_module_permission('users', 'update'));

-- ── 2. دالة can_access_branch ─────────────────────────────────────────
-- تُستخدم في RLS وفي الواجهة لفلترة الفروع المتاحة للمستخدم
-- القاعدة: لا صفوف = كل الفروع مسموحة
CREATE OR REPLACE FUNCTION can_access_branch(p_brand_id text, p_branch_name text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT
    -- Super Admin: كل الفروع
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON r.id = up.role_id
      WHERE up.id = auth.uid() AND r.is_super_admin = true
    )
    OR
    -- لا قيود فرع مسجّلة = كل الفروع مسموحة
    NOT EXISTS (
      SELECT 1 FROM user_branch_access uba
      JOIN branches b ON b.id = uba.branch_id
      WHERE uba.user_id = auth.uid()
        AND b.brand_id = p_brand_id
    )
    OR
    -- وصول صريح للفرع بالاسم
    EXISTS (
      SELECT 1 FROM user_branch_access uba
      JOIN branches b ON b.id = uba.branch_id
      WHERE uba.user_id = auth.uid()
        AND b.brand_id = p_brand_id
        AND b.name = p_branch_name
    );
$$;

-- ── 3. دالة مساعدة: قائمة الفروع المتاحة للمستخدم الحالي ─────────────
CREATE OR REPLACE FUNCTION get_accessible_branches(p_brand_id text)
RETURNS TABLE(branch_name text)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  -- Super admin أو بلا قيود → كل الفروع النشطة
  SELECT b.name FROM branches b
  WHERE b.brand_id = p_brand_id AND b.is_active = true
  AND (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON r.id = up.role_id
      WHERE up.id = auth.uid() AND r.is_super_admin = true
    )
    OR NOT EXISTS (
      SELECT 1 FROM user_branch_access uba
      JOIN branches br ON br.id = uba.branch_id
      WHERE uba.user_id = auth.uid() AND br.brand_id = p_brand_id
    )
    OR EXISTS (
      SELECT 1 FROM user_branch_access uba
      WHERE uba.user_id = auth.uid() AND uba.branch_id = b.id
    )
  );
$$;
