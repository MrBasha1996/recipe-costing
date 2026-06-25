-- Add standalone system fields to brands
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS is_standalone BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS external_url TEXT;

-- Insert GreenBasket as a standalone brand (idempotent)
INSERT INTO brands (id, name, name_ar, is_standalone, external_url, primary_color)
VALUES ('veg', 'GreenBasket', 'السلة الخضراء', TRUE, 'http://localhost:5173', '#22c55e')
ON CONFLICT (id) DO UPDATE SET
  is_standalone = TRUE,
  external_url  = COALESCE(brands.external_url, EXCLUDED.external_url);
