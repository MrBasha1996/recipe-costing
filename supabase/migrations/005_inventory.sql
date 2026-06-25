-- Current stock level per ingredient per brand
CREATE TABLE IF NOT EXISTS stock_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    text REFERENCES brands(id),
  ing_sku     text NOT NULL,
  ing_name    text NOT NULL,
  unit        text NOT NULL,
  current_qty numeric(10,3) DEFAULT 0,
  min_qty     numeric(10,3) DEFAULT 0,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (brand_id, ing_sku)
);

-- Log of every stock movement
CREATE TABLE IF NOT EXISTS stock_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        text REFERENCES brands(id),
  ing_sku         text NOT NULL,
  ing_name        text NOT NULL,
  movement_type   text CHECK (movement_type IN ('in', 'out', 'waste', 'adjustment')) NOT NULL,
  qty             numeric(10,3) NOT NULL,
  note            text,
  performed_by    uuid REFERENCES user_profiles(id),
  created_at      timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- accountant + ops can read/write stock_items
CREATE POLICY "stock_items_read" ON stock_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('accountant', 'ops')
        AND (brand_access = 'all' OR brand_access = stock_items.brand_id)
    )
  );

CREATE POLICY "stock_items_write" ON stock_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('accountant', 'ops')
        AND (brand_access = 'all' OR brand_access = stock_items.brand_id)
    )
  );

-- accountant + ops can read/write stock_movements
CREATE POLICY "stock_movements_read" ON stock_movements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('accountant', 'ops')
        AND (brand_access = 'all' OR brand_access = stock_movements.brand_id)
    )
  );

CREATE POLICY "stock_movements_write" ON stock_movements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('accountant', 'ops')
        AND (brand_access = 'all' OR brand_access = stock_movements.brand_id)
    )
  );
