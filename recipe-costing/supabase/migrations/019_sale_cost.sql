-- Migration 019: Sale cost per record
--
-- لكل سجل مبيعات نخزّن التكلفة المحسوبة وقت الـ explode:
--   cost = (recipe.total_cost / recipe.yield_portions) * qty_sold
-- يُحسب فقط عند explode بناءً على الوصفة المعتمدة النشطة.
-- يبقى NULL إن لم توجد وصفة معتمدة نشطة وقت الـ explode.

ALTER TABLE daily_sales
  ADD COLUMN IF NOT EXISTS cost numeric(12,4) DEFAULT NULL;
