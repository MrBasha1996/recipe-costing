-- =====================================================
-- Migration 055: Soft Delete لـ recipes و ingredients
-- =====================================================
-- 16-ب: إضافة deleted_at → حذف لين يحتفظ بالسجل ويخفيه من SELECT
--        يمنع فقدان بيانات الوصفات والمكونات المرتبطة بسجلات مبيعات تاريخية

ALTER TABLE recipes     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- فهارس لتسريع الاستعلامات التي تفلتر على deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_recipes_not_deleted
  ON recipes(brand_id, deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ingredients_not_deleted
  ON ingredients(brand_id, deleted_at) WHERE deleted_at IS NULL;

-- ── تحديث RLS: SELECT يعرض السجلات غير المحذوفة فقط ──────────────

DROP POLICY IF EXISTS "ingredients_select" ON ingredients;
CREATE POLICY "ingredients_select" ON ingredients
  FOR SELECT USING (can_access_brand(brand_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "recipes_select" ON recipes;
CREATE POLICY "recipes_select" ON recipes
  FOR SELECT USING (can_access_brand(brand_id) AND deleted_at IS NULL);

-- ── حذف سياسة DELETE: الحذف الصريح ممنوع الآن (يُستبدل بـ soft delete) ──

DROP POLICY IF EXISTS "ingredients_delete" ON ingredients;
DROP POLICY IF EXISTS "recipes_delete"     ON recipes;
