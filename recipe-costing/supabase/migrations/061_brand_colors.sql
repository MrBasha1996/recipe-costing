ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS sidebar_color   TEXT,
  ADD COLUMN IF NOT EXISTS secondary_color TEXT;
