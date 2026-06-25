-- ── Migration 043: تشديد RLS على brands و user_branch_access ─────────────────
--
-- المشكلة 1: brands_select = USING (true)
--   أي مستخدم مصادَّق يرى كل البراندات بأسمائها حتى لو لا يملك صلاحية لها
-- الحل: تقييد لـ can_access_brand(id::text)
--
-- المشكلة 2: uba_select = USING (auth.uid() IS NOT NULL)
--   أي مستخدم مصادَّق يرى بيانات وصول فروع كل المستخدمين
-- الحل: كل مستخدم يرى سجلاته فقط (أو super_admin يرى الكل)

-- ── 1. brands ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "brands_select" ON brands;

CREATE POLICY "brands_select" ON brands
  FOR SELECT USING (can_access_brand(id::text));

-- ── 2. user_branch_access ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "uba_select" ON user_branch_access;

CREATE POLICY "uba_select" ON user_branch_access
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_super_admin()
    OR has_module_permission('users', 'view')
  );
