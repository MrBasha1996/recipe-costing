-- Migration 060: Fix brands RLS policies
-- Problem: brands table has no INSERT or DELETE policies,
-- and the UPDATE policy uses the deprecated my_role() function.
-- Fix: use is_super_admin() and has_module_permission() (new RBAC system).

-- UPDATE: replace old my_role()-based policy with new RBAC check
DROP POLICY IF EXISTS "brands_update" ON brands;
CREATE POLICY "brands_update" ON brands
  FOR UPDATE USING (
    is_super_admin() OR has_module_permission('brands', 'update')
  );

-- INSERT: only super admin or users with brands:create permission
DROP POLICY IF EXISTS "brands_insert" ON brands;
CREATE POLICY "brands_insert" ON brands
  FOR INSERT WITH CHECK (
    is_super_admin() OR has_module_permission('brands', 'create')
  );

-- DELETE: only super admin or users with brands:delete permission
DROP POLICY IF EXISTS "brands_delete" ON brands;
CREATE POLICY "brands_delete" ON brands
  FOR DELETE USING (
    is_super_admin() OR has_module_permission('brands', 'delete')
  );
