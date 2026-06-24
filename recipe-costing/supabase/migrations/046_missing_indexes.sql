-- Performance: 5 missing indexes for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_recipes_brand_active_approved
  ON recipes(brand_id, is_active, is_approved);

CREATE INDEX IF NOT EXISTS idx_recipes_brand_sku
  ON recipes(brand_id, sku);

CREATE INDEX IF NOT EXISTS idx_daily_sales_brand_batch
  ON daily_sales(brand_id, import_batch);

CREATE INDEX IF NOT EXISTS idx_modifier_sales_unexploded
  ON modifier_sales(brand_id, date_from, date_to)
  WHERE exploded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_brand_sku_date
  ON stock_movements(brand_id, ing_sku, created_at DESC);
