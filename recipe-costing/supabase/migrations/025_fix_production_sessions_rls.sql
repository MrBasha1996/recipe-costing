-- =====================================================
-- Migration 025: Fix production_sessions RLS
-- يستبدل سياسة USING(true) المفتوحة بسياسات مقيدة
-- =====================================================

-- حذف السياسة المفتوحة للكل
DROP POLICY IF EXISTS "production_sessions_all" ON production_sessions;

-- SELECT: يجب أن يكون للمستخدم صلاحية الوصول للبراند
CREATE POLICY "prod_sessions_select"
  ON production_sessions FOR SELECT
  TO authenticated
  USING (can_access_brand(brand_id));

-- INSERT: وصول للبراند + صلاحية الإنتاج:إنشاء
CREATE POLICY "prod_sessions_insert"
  ON production_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    can_access_brand(brand_id)
    AND has_module_permission(brand_id, 'production', 'create')
  );

-- UPDATE: وصول للبراند + صلاحية الإنتاج:تعديل
CREATE POLICY "prod_sessions_update"
  ON production_sessions FOR UPDATE
  TO authenticated
  USING (
    can_access_brand(brand_id)
    AND has_module_permission(brand_id, 'production', 'update')
  );

-- DELETE: وصول للبراند + صلاحية الإنتاج:حذف
CREATE POLICY "prod_sessions_delete"
  ON production_sessions FOR DELETE
  TO authenticated
  USING (
    can_access_brand(brand_id)
    AND has_module_permission(brand_id, 'production', 'delete')
  );
