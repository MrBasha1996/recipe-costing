-- =====================================================
-- Migration 031: Fix production_sessions RLS policies
-- =====================================================
-- المشكلة: migration 025 استدعت has_module_permission بـ 3 وسائط
-- (brand_id, module, action) لكن signature الدالة الصحيحة هي (module, action).
-- السياسات فشلت عند تطبيقها — نُعيد كتابتها بالشكل الصحيح.

DROP POLICY IF EXISTS "prod_sessions_insert" ON production_sessions;
DROP POLICY IF EXISTS "prod_sessions_update" ON production_sessions;
DROP POLICY IF EXISTS "prod_sessions_delete" ON production_sessions;

CREATE POLICY "prod_sessions_insert"
  ON production_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    can_access_brand(brand_id)
    AND has_module_permission('production', 'create')
  );

CREATE POLICY "prod_sessions_update"
  ON production_sessions FOR UPDATE
  TO authenticated
  USING (
    can_access_brand(brand_id)
    AND has_module_permission('production', 'update')
  );

CREATE POLICY "prod_sessions_delete"
  ON production_sessions FOR DELETE
  TO authenticated
  USING (
    can_access_brand(brand_id)
    AND has_module_permission('production', 'delete')
  );
