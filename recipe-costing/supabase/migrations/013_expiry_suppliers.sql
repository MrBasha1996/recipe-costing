-- ====================================================
-- Migration: Stock Tables + Expiry Tracking + Suppliers
-- Run in Supabase → SQL Editor
-- ====================================================

-- ── 1. stock_items ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     text        NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  ing_sku      text        NOT NULL,
  ing_name     text        NOT NULL,
  unit         text        NOT NULL DEFAULT '',
  current_qty  numeric     NOT NULL DEFAULT 0,
  min_qty      numeric     NOT NULL DEFAULT 0,
  expiry_date  date,
  batch_number text,
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (brand_id, ing_sku)
);

-- Add new columns if table already exists (safe re-run)
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS expiry_date  date;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS batch_number text;

CREATE INDEX IF NOT EXISTS stock_items_brand_idx ON stock_items(brand_id);

ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "stock_items_select" ON stock_items FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND (brand_access = stock_items.brand_id OR brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "stock_items_insert" ON stock_items FOR INSERT
    WITH CHECK (EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND (brand_access = brand_id OR brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "stock_items_update" ON stock_items FOR UPDATE
    USING (EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND (brand_access = stock_items.brand_id OR brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "stock_items_delete" ON stock_items FOR DELETE
    USING (EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND (brand_access = stock_items.brand_id OR brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 2. stock_movements ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      text        NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  ing_sku       text        NOT NULL,
  ing_name      text        NOT NULL,
  movement_type text        NOT NULL CHECK (movement_type IN ('in','out','waste','adjustment')),
  qty           numeric     NOT NULL DEFAULT 0,
  note          text,
  performed_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_brand_idx ON stock_movements(brand_id);
CREATE INDEX IF NOT EXISTS stock_movements_created_idx ON stock_movements(created_at DESC);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "stock_movements_select" ON stock_movements FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND (brand_access = stock_movements.brand_id OR brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "stock_movements_insert" ON stock_movements FOR INSERT
    WITH CHECK (EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND (brand_access = brand_id OR brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 3. stocktake_sessions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stocktake_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     text        NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  session_date date        NOT NULL,
  notes        text,
  status       text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','finalized')),
  created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  finalized_at timestamptz,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stocktake_sessions_brand_idx ON stocktake_sessions(brand_id);

ALTER TABLE stocktake_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "stocktake_sessions_select" ON stocktake_sessions FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND (brand_access = stocktake_sessions.brand_id OR brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "stocktake_sessions_insert" ON stocktake_sessions FOR INSERT
    WITH CHECK (EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND (brand_access = brand_id OR brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "stocktake_sessions_update" ON stocktake_sessions FOR UPDATE
    USING (EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND (brand_access = stocktake_sessions.brand_id OR brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 4. stocktake_items ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stocktake_items (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid    NOT NULL REFERENCES stocktake_sessions(id) ON DELETE CASCADE,
  ing_sku         text    NOT NULL,
  ing_name        text    NOT NULL,
  unit            text    NOT NULL DEFAULT '',
  item_type       text    NOT NULL DEFAULT 'ingredient' CHECK (item_type IN ('ingredient','batch')),
  theoretical_qty numeric NOT NULL DEFAULT 0,
  actual_qty      numeric NOT NULL DEFAULT 0,
  unit_cost       numeric NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS stocktake_items_session_idx ON stocktake_items(session_id);

ALTER TABLE stocktake_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "stocktake_items_all" ON stocktake_items FOR ALL
    USING (EXISTS (
      SELECT 1 FROM stocktake_sessions s
      JOIN user_profiles p ON p.id = auth.uid()
      WHERE s.id = stocktake_items.session_id
        AND (p.brand_access = s.brand_id OR p.brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 5. suppliers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id       text        NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  phone          text,
  contact_person text,
  notes          text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suppliers_brand_idx ON suppliers(brand_id);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "suppliers_select" ON suppliers FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND (brand_access = suppliers.brand_id OR brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT
    WITH CHECK (EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND (brand_access = brand_id OR brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE
    USING (EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND (brand_access = suppliers.brand_id OR brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "suppliers_delete" ON suppliers FOR DELETE
    USING (EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND (brand_access = suppliers.brand_id OR brand_access = 'all')
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 6. RBAC: تسجيل موديول الموردين ──────────────────────────────
-- أضف الموديول إن لم يكن موجوداً (سيظهر في صفحة المجموعات)
INSERT INTO modules (code, name, sort_order, is_active)
VALUES ('suppliers', 'الموردون', 95, true)
ON CONFLICT (code) DO NOTHING;

-- ── 7. RBAC: تسجيل موديول الإنتاج ───────────────────────────────
INSERT INTO modules (code, name, sort_order, is_active)
VALUES ('production', 'الإنتاج', 96, true)
ON CONFLICT (code) DO NOTHING;
