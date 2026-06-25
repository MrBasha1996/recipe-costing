-- Performance: 5 indexes for high-frequency explode and stocktake queries (batch 2)
-- Note: recipe_ingredients(recipe_id), modifier_option_ingredients(option_id),
-- and stocktake_items(session_id) already exist from earlier migrations under
-- different names — IF NOT EXISTS makes these safe no-ops if names already taken.

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe
  ON recipe_ingredients(recipe_id);

CREATE INDEX IF NOT EXISTS idx_stock_items_brand_sku
  ON stock_items(brand_id, ing_sku);

CREATE INDEX IF NOT EXISTS idx_mod_option_ings_option
  ON modifier_option_ingredients(option_id);

CREATE INDEX IF NOT EXISTS idx_stocktake_items_session
  ON stocktake_items(session_id);

CREATE INDEX IF NOT EXISTS idx_combo_meals_brand_sku
  ON combo_meals(brand_id, sku) WHERE is_active = true;
