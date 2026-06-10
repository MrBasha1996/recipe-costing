-- Migration 004: Add packaging sections + Dine In / Dine Out support
--
-- Each recipe_ingredient now belongs to a section (food or packaging)
-- and a service_type (both = shared, dine_in, or dine_out).
--
-- Food rows:      section='food',      service_type='both'
-- DI packaging:  section='packaging', service_type='dine_in'
-- DO packaging:  section='packaging', service_type='dine_out'

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'food'
    CHECK (section IN ('food', 'packaging')),
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'both'
    CHECK (service_type IN ('both', 'dine_in', 'dine_out'));

-- Recipes: existing cost columns become Dine In values.
-- New columns store Dine Out calculated values.
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS dine_out_total_cost    numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dine_out_food_cost_pct numeric(5,1)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dine_out_margin        numeric(10,2) DEFAULT 0;
