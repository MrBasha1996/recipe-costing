-- =====================================================
-- Migration 045: Atomic RPCs for stocktake finalize + stock movement + modifier_sales
-- =====================================================
-- 1. apply_stocktake_writes — finalize stocktake atomically (replaces client-side loop in doFinalize)
-- 2. record_stock_movement  — atomic movement insert + stock increment (prevents lost-update race)
-- 3. apply_explode_writes   — adds p_modifier_sales_ids to mark modifier_sales inside same transaction
-- =====================================================

-- ── 1. apply_stocktake_writes ─────────────────────────────────────────
-- Called from /api/stocktake/[id]/finalize (admin client — auth checked in route handler)
CREATE OR REPLACE FUNCTION apply_stocktake_writes(
  p_session_id  uuid,
  p_brand_id    text,
  p_adjustments jsonb,  -- [{ing_sku, ing_name, unit, actual_qty, min_qty, variance, value, note, performed_by}]
  p_note        text DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set stock to physically counted qty for every item
  INSERT INTO stock_items (brand_id, ing_sku, ing_name, unit, current_qty, min_qty, updated_at)
  SELECT
    p_brand_id,
    r->>'ing_sku',
    r->>'ing_name',
    r->>'unit',
    (r->>'actual_qty')::numeric,
    (r->>'min_qty')::numeric,
    now()
  FROM jsonb_array_elements(p_adjustments) AS r
  ON CONFLICT (brand_id, ing_sku) DO UPDATE SET
    current_qty = EXCLUDED.current_qty,
    updated_at  = now();

  -- Insert adjustment movement only where variance is significant
  INSERT INTO stock_movements (brand_id, ing_sku, ing_name, movement_type, qty, value, note, performed_by)
  SELECT
    p_brand_id,
    r->>'ing_sku',
    r->>'ing_name',
    'adjustment',
    (r->>'variance')::numeric,
    (r->>'value')::numeric,
    COALESCE(r->>'note', p_note),
    NULLIF(r->>'performed_by', '')::uuid
  FROM jsonb_array_elements(p_adjustments) AS r
  WHERE ABS((r->>'variance')::numeric) >= 0.001;

  -- Mark session finalized
  UPDATE stocktake_sessions
  SET status = 'finalized', finalized_at = now()
  WHERE id = p_session_id;
END;
$$;

-- ── 2. record_stock_movement ──────────────────────────────────────────
-- Called from anon client (user JWT present) — can_access_brand check is meaningful here
-- Atomically inserts movement AND increments stock (prevents lost-update race condition)
CREATE OR REPLACE FUNCTION record_stock_movement(
  p_brand_id      text,
  p_ing_sku       text,
  p_ing_name      text,
  p_unit          text,
  p_movement_type text,
  p_qty           numeric,
  p_delta         numeric,  -- signed: positive=in, negative=out
  p_value         numeric  DEFAULT 0,
  p_note          text     DEFAULT NULL,
  p_performed_by  uuid     DEFAULT NULL,
  p_min_qty       numeric  DEFAULT 0
)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Auth check: meaningful when called from anon client with user JWT
  IF NOT can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'غير مصرح للوصول لهذا البراند' USING ERRCODE = '42501';
  END IF;

  -- Insert movement record
  INSERT INTO stock_movements (brand_id, ing_sku, ing_name, movement_type, qty, value, note, performed_by)
  VALUES (p_brand_id, p_ing_sku, p_ing_name, p_movement_type, p_qty, p_value, p_note, p_performed_by);

  -- Atomic increment: prevents lost-update when two users record movements simultaneously
  INSERT INTO stock_items (brand_id, ing_sku, ing_name, unit, current_qty, min_qty, updated_at)
  VALUES (p_brand_id, p_ing_sku, p_ing_name, p_unit, GREATEST(0, p_delta), p_min_qty, now())
  ON CONFLICT (brand_id, ing_sku) DO UPDATE SET
    current_qty = GREATEST(0, stock_items.current_qty + p_delta),
    updated_at  = now();
END;
$$;

-- ── 3. apply_explode_writes — add p_modifier_sales_ids ───────────────
-- Adds modifier_sales exploded_at update inside the same transaction as daily_sales
-- Removing the can_access_brand check: this is called from admin client (service_role),
-- where auth.uid() is NULL and can_access_brand always returns false.
-- Auth is validated in the route handler via requireModulePermission before calling this RPC.
CREATE OR REPLACE FUNCTION apply_explode_writes(
  p_brand_id           text,
  p_import_batch       uuid,
  p_stock_upserts      jsonb,
  p_movements          jsonb,
  p_sale_costs         jsonb,
  p_modifier_sales_ids uuid[] DEFAULT NULL
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

  -- 2. Audit trail — value = qty × current ingredient cost
  INSERT INTO stock_movements (brand_id, ing_sku, ing_name, movement_type, qty, value, note, performed_by)
  SELECT
    p_brand_id,
    r->>'ing_sku',
    r->>'ing_name',
    'out',
    (r->>'qty')::numeric,
    ROUND(
      (r->>'qty')::numeric *
      COALESCE(
        (SELECT cost FROM ingredients WHERE brand_id = p_brand_id AND sku = r->>'ing_sku'),
        0
      ),
      4
    ),
    r->>'note',
    NULLIF(r->>'performed_by', '')::uuid
  FROM jsonb_array_elements(p_movements) AS r;

  -- 3. Mark daily_sales batch as exploded
  UPDATE daily_sales
  SET exploded_at = now()
  WHERE brand_id = p_brand_id AND import_batch = p_import_batch;

  -- 4. Per-sale cost — scoped to brand_id to prevent cross-brand writes
  UPDATE daily_sales
  SET cost = (r->>'cost')::numeric
  FROM jsonb_array_elements(p_sale_costs) AS r
  WHERE daily_sales.id       = (r->>'id')::uuid
    AND daily_sales.brand_id = p_brand_id;

  -- 5. Mark modifier_sales as exploded inside same transaction (prevents double-deduction on timeout)
  IF p_modifier_sales_ids IS NOT NULL AND array_length(p_modifier_sales_ids, 1) > 0 THEN
    UPDATE modifier_sales
    SET exploded_at = now()
    WHERE id = ANY(p_modifier_sales_ids);
  END IF;
END;
$$;
