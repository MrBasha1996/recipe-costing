-- =====================================================
-- Migration 030: Move session approval inside RPC
-- =====================================================
-- المشكلة: apply_produce_writes تخصم المخزون ثم يُحدَّث status في TypeScript
-- بشكل منفصل — إذا فشل التحديث تُخصم المواد مرتين في الاعتماد التالي.
-- الحل: نقل UPDATE production_sessions داخل الـ transaction.

CREATE OR REPLACE FUNCTION apply_produce_writes(
  p_brand_id          text,
  p_session_id        uuid,
  p_deductions        jsonb,
  p_batch_sku         text,
  p_batch_name        text,
  p_batch_new_qty     numeric,
  p_batch_qty_produced numeric,
  p_batch_unit        text,
  p_batch_min_qty     numeric,
  p_note              text,
  p_performed_by      uuid DEFAULT NULL,
  p_batch_value       numeric DEFAULT 0
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

  -- 2. Deduction movements — value = qty × ingredient cost
  INSERT INTO stock_movements (brand_id, ing_sku, ing_name, movement_type, qty, value, note, performed_by, production_session_id)
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

  -- 4. Batch production movement (in) — value = cost estimate
  INSERT INTO stock_movements (brand_id, ing_sku, ing_name, movement_type, qty, value, note, performed_by, production_session_id)
  VALUES (p_brand_id, p_batch_sku, p_batch_name, 'in', p_batch_qty_produced, p_batch_value, p_note, p_performed_by, p_session_id);

  -- 5. Mark session as approved — atomic مع خصم المخزون
  UPDATE production_sessions
  SET
    status      = 'approved',
    approved_by = p_performed_by,
    approved_at = now()
  WHERE id = p_session_id
    AND brand_id = p_brand_id
    AND status   = 'draft';

  -- إذا لم تتأثر أي صف يعني الجلسة معتمدة مسبقاً
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الجلسة معتمدة مسبقاً أو غير موجودة' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
