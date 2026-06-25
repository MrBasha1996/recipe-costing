-- =====================================================
-- Migration 039: Fix WAC update for batch output in apply_produce_writes
-- =====================================================
-- المشكلة: apply_produce_writes تزيد الكمية في stock_items لكن لا تُحدّث
-- ingredients.cost للـ SKU المُنتَج → WAC يبقى صفراً أو قديماً.
-- النتيجة: إغلاق الفترة يُقيّم المنتج المُنتَج بتكلفة خاطئة.

CREATE OR REPLACE FUNCTION apply_produce_writes(
  p_brand_id           text,
  p_session_id         uuid,
  p_deductions         jsonb,
  p_batch_sku          text,
  p_batch_name         text,
  p_batch_new_qty      numeric,
  p_batch_qty_produced numeric,
  p_batch_unit         text,
  p_batch_min_qty      numeric,
  p_note               text,
  p_performed_by       uuid DEFAULT NULL,
  p_batch_value        numeric DEFAULT 0
)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Security guard
  IF NOT can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'غير مصرح للوصول لهذا البراند' USING ERRCODE = '42501';
  END IF;

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الجلسة معتمدة مسبقاً أو غير موجودة' USING ERRCODE = 'P0002';
  END IF;

  -- 6. تحديث WAC لمادة الباتش في جدول ingredients
  -- WAC = (كمية_قبل × تكلفة_قبل + قيمة_الإنتاج) / الكمية_الكلية_بعد
  -- كمية_قبل = p_batch_new_qty - p_batch_qty_produced
  -- قيمة_الإنتاج = p_batch_value (إجمالي تكلفة هذه الدفعة)
  UPDATE ingredients
  SET cost = ROUND(
    (
      (p_batch_new_qty - p_batch_qty_produced) * COALESCE(cost, 0)
      + p_batch_value
    ) / NULLIF(p_batch_new_qty, 0),
    4
  )
  WHERE brand_id = p_brand_id
    AND sku = p_batch_sku
    AND p_batch_qty_produced > 0
    AND p_batch_new_qty > 0
    AND p_batch_value > 0;
END;
$$;
