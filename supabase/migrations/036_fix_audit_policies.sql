-- =====================================================
-- Migration 036: Fix audit_logs and rbac_audit_logs RLS policies
-- =====================================================
-- Migration 033 used WITH CHECK (true) / USING (true) — يسمح لأي مستخدم
-- بحقن سجلات لأي براند وقراءة كل السجلات.
-- هذا Migration يُصحح السياسات:
--   INSERT: مقيد بالبراند المصرح به للمستخدم
--   SELECT: مقيد بالبراند أو super_admin فقط

-- ── audit_logs ────────────────────────────────────────────────────

-- SELECT: المستخدم يرى سجلات براند يملك وصولاً له، أو super_admin يرى الكل
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    OR (brand_id IS NOT NULL AND can_access_brand(brand_id))
  );

-- INSERT: المستخدم يدرج سجلات لبراند يملك وصولاً له فقط
-- (brand_id IS NULL مسموح للعمليات التي لا تخص براند معين)
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    brand_id IS NULL
    OR can_access_brand(brand_id)
  );

-- ── rbac_audit_logs ───────────────────────────────────────────────
-- لا يحتوي brand_id — يتتبع تغييرات الصلاحيات

-- SELECT: super_admin فقط
DROP POLICY IF EXISTS "rbac_audit_logs_select" ON rbac_audit_logs;
CREATE POLICY "rbac_audit_logs_select"
  ON rbac_audit_logs FOR SELECT
  TO authenticated
  USING (is_super_admin());

-- INSERT: المستخدم يُدرج سجلات بإسمه فقط (performed_by = auth.uid())
DROP POLICY IF EXISTS "rbac_audit_logs_insert" ON rbac_audit_logs;
CREATE POLICY "rbac_audit_logs_insert"
  ON rbac_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (performed_by = auth.uid() OR is_super_admin());
