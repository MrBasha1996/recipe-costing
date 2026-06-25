-- =====================================================
-- Migration 026: Atomic write RPCs for stock operations
-- =====================================================
-- المشكلة: عمليات الكتابة (stock_items + stock_movements + daily_sales)
-- كانت 3-4 calls منفصلة — إذا فشلت إحداها تنقسم البيانات.
-- الحل: دالتان SECURITY DEFINER تجريان كل الكتابات داخل transaction واحدة.

-- ── 1. Explode writes: deduct stock after sales import ───────────────
CREATE OR REPLACE FUNCTION apply_explode_writes(
  p_brand_id     text,
  p_import_batch uuid,
  p_stock_upserts jsonb,  -- [{ing_sku, ing_name, unit, current_qty, min_qty}]
  p_movements    jsonb,   -- [{ing_sku, ing_name, qty, note, performed_by}]
  p_sale_costs   jsonb    -- [{id, cost}]
)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Upsert stock quantities
  INSERT INTO stock_items (brand_id, ing_sku, ing_name, unit, current_qty, min_qty, updated_at)
  SELECT
    p_brand_id,
    r->>'ing_sku',
    r->>'ing_name',
    r->>'unit',
    (r->>'current_qty')::numeric,
    (r->>'min_qty')::numeric,
    now()
  FROM jsonb_array_elements(p_stock_upserts) AS r
  ON CONFLICT (brand_id, ing_sku) DO UPDATE
    SET current_qty = EXCLUDED.current_qty,
        updated_at  = now();

  -- 2. Audit trail
  INSERT INTO stock_movements (brand_id, ing_sku, ing_name, movement_type, qty, note, performed_by)
  SELECT
    p_brand_id,
    r->>'ing_sku',
    r->>'ing_name',
    'out',
    (r->>'qty')::numeric,
    r->>'note',
    NULLIF(r->>'performed_by', '')::uuid
  FROM jsonb_array_elements(p_movements) AS r;

  -- 3. Mark batch as exploded
  UPDATE daily_sales
  SET exploded_at = now()
  WHERE brand_id = p_brand_id AND import_batch = p_import_batch;

  -- 4. Per-sale cost
  UPDATE daily_sales
  SET cost = (r->>'cost')::numeric
  FROM jsonb_array_elements(p_sale_costs) AS r
  WHERE daily_sales.id = (r->>'id')::uuid;
END;
$$;

-- ── 2. Produce writes: deduct ingredients + add batch to stock ────────
CREATE OR REPLACE FUNCTION apply_produce_writes(
  p_brand_id          text,
  p_session_id        uuid,
  p_deductions        jsonb,   -- [{ing_sku, ing_name, unit, current_qty, min_qty, qty}]
  p_batch_sku         text,
  p_batch_name        text,
  p_batch_new_qty     numeric, -- الرصيد الجديد للباتش في المخزون
  p_batch_qty_produced numeric,-- الكمية المنتجة (لسجل الحركة)
  p_batch_unit        text,
  p_batch_min_qty     numeric,
  p_note              text,
  p_performed_by      uuid DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Deduct ingredients from stock
  INSERT INTO stock_items (brand_id, ing_sku, ing_name, unit, current_qty, min_qty, updated_at)
  SELECT
    p_brand_id,
    r->>'ing_sku',
    r->>'ing_name',
    r->>'unit',
    (r->>'current_qty')::numeric,
    (r->>'min_qty')::numeric,
    now()
  FROM jsonb_array_elements(p_deductions) AS r
  ON CONFLICT (brand_id, ing_sku) DO UPDATE
    SET current_qty = EXCLUDED.current_qty,
        updated_at  = now();

  -- 2. Deduction movements
  INSERT INTO stock_movements (brand_id, ing_sku, ing_name, movement_type, qty, note, performed_by, production_session_id)
  SELECT
    p_brand_id,
    r->>'ing_sku',
    r->>'ing_name',
    'out',
    (r->>'qty')::numeric,
    p_note,
    p_performed_by,
    p_session_id
  FROM jsonb_array_elements(p_deductions) AS r;

  -- 3. Add batch to stock
  INSERT INTO stock_items (brand_id, ing_sku, ing_name, unit, current_qty, min_qty, updated_at)
  VALUES (p_brand_id, p_batch_sku, p_batch_name, p_batch_unit, p_batch_new_qty, p_batch_min_qty, now())
  ON CONFLICT (brand_id, ing_sku) DO UPDATE
    SET current_qty = EXCLUDED.current_qty,
        updated_at  = now();

  -- 4. Batch production movement (in)
  INSERT INTO stock_movements (brand_id, ing_sku, ing_name, movement_type, qty, note, performed_by, production_session_id)
  VALUES (p_brand_id, p_batch_sku, p_batch_name, 'in', p_batch_qty_produced, p_note, p_performed_by, p_session_id);
END;
$$;
