-- =====================================================
-- Migration 007: Explode Tracking + Delivery Commission
-- =====================================================

-- تتبع حالة الاحتساب لكل دفعة مبيعات
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS exploded_at TIMESTAMPTZ DEFAULT NULL;

-- نسبة عمولة منصات التوصيل على مستوى البراند
ALTER TABLE brands ADD COLUMN IF NOT EXISTS delivery_commission_pct NUMERIC(5,2) DEFAULT 0;

-- صلاحية تعديل إعدادات البراند للمحاسب فقط
DROP POLICY IF EXISTS "brands_update" ON brands;
CREATE POLICY "brands_update" ON brands
  FOR UPDATE USING (my_role() = 'accountant');
