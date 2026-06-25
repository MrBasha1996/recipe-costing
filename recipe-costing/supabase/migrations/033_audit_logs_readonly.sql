-- =====================================================
-- Migration 033: Protect audit_logs from deletion
-- =====================================================
-- سجل التدقيق يجب أن يكون append-only — لا حذف، لا تعديل.
-- RLS تمنع DELETE/UPDATE على مستوى الصفوف (لا تمنع TRUNCATE بالـ superuser).

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: للمستخدمين المصادَق عليهم فقط
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: مسموح للمستخدمين المصادَق عليهم (append-only)
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE/DELETE: ممنوع تماماً على مستوى المستخدمين
-- (لا policy = ممنوع — هذا سلوك RLS الافتراضي)

-- نفس الشيء لـ rbac_audit_logs
ALTER TABLE rbac_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rbac_audit_logs_select" ON rbac_audit_logs;
CREATE POLICY "rbac_audit_logs_select"
  ON rbac_audit_logs FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "rbac_audit_logs_insert" ON rbac_audit_logs;
CREATE POLICY "rbac_audit_logs_insert"
  ON rbac_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);
