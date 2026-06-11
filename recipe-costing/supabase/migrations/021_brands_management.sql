-- =====================================================
-- Migration 021: Dynamic Brands Management
-- Removes the hardcoded brand_access CHECK constraint
-- and replaces it with a flexible FK-based check.
-- Adds 'brands' module to RBAC.
-- =====================================================

-- ── 1. حذف القيد الصارم (CHECK مع literal values فقط) ──
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_brand_access_check;

-- ── 2. PostgreSQL لا يسمح بـ subquery في CHECK constraints ──
-- نستخدم trigger بدلاً من ذلك لقبول 'all' أو أي brand_id موجود
CREATE OR REPLACE FUNCTION validate_user_brand_access()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.brand_access IS NOT NULL
     AND NEW.brand_access <> 'all'
     AND NOT EXISTS (SELECT 1 FROM brands WHERE id = NEW.brand_access)
  THEN
    RAISE EXCEPTION 'brand_access "%" is not a valid brand id', NEW.brand_access;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_brand_access ON user_profiles;
CREATE TRIGGER trg_validate_brand_access
  BEFORE INSERT OR UPDATE OF brand_access ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION validate_user_brand_access();

-- ── 3. إضافة موديول brands للـ RBAC ──────────────────
INSERT INTO modules (code, name, sort_order) VALUES
  ('brands', 'البراندات', 15)
ON CONFLICT (code) DO NOTHING;

-- ── 4. Super Admin يحصل على brands ───────────────────
INSERT INTO role_permissions (role_id, module_id, can_view, can_create, can_update, can_delete)
SELECT r.id, m.id, true, true, true, true
FROM roles r
CROSS JOIN modules m
WHERE r.is_super_admin = true AND m.code = 'brands'
ON CONFLICT (role_id, module_id) DO NOTHING;
