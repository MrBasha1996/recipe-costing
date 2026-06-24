-- ── Migration 042: WAC zero-cost fix ─────────────────────────────────────────
-- المشكلة: المشتريات بسعر صفر (هبة أو خطأ إدخال) كانت تُهمَل كلياً:
--   AND unit_cost > 0  → يمنع إضافة الكمية للمخزون
-- الحل:
--   - نُزيل الشرط لتُضاف الكمية للمخزون دائماً
--   - إذا كانت قيمة الشراء = 0، نُبقي التكلفة الحالية (لا نُخفّض WAC)

CREATE OR REPLACE FUNCTION apply_purchase_wac(
  p_brand_id     text,
  p_import_batch uuid,
  p_performed_by uuid DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  rec               record;
  v_current_qty     numeric;
  v_current_cost    numeric;
  v_purchase_qty    numeric;
  v_purchase_value  numeric;
  v_new_cost        numeric;
  v_new_qty         numeric;
  v_updated         int := 0;
  v_stock_updated   int := 0;
  v_history_rows    int := 0;
  v_changed_ings    jsonb := '[]'::jsonb;
BEGIN
  -- Security guard
  IF NOT can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'غير مصرح للوصول لهذا البراند' USING ERRCODE = '42501';
  END IF;

  -- ── 1. تجميع المشتريات لكل SKU (بما فيها سعر صفر) ───────────────
  FOR rec IN
    SELECT
      ing_sku,
      MAX(ing_name)          AS ing_name,
      SUM(qty)               AS total_qty,
      SUM(qty * unit_cost)   AS total_value,
      MAX(unit)              AS unit
    FROM purchases
    WHERE brand_id = p_brand_id
      AND import_batch = p_import_batch
      AND ing_sku IS NOT NULL
    GROUP BY ing_sku
  LOOP
    v_purchase_qty   := rec.total_qty;
    v_purchase_value := rec.total_value;

    -- ── 2. قراءة الرصيد الحالي مع قفل الصف ─────────────────────
    SELECT current_qty, min_qty
    INTO v_current_qty, v_current_cost
    FROM stock_items
    WHERE brand_id = p_brand_id AND ing_sku = rec.ing_sku
    FOR UPDATE;

    IF NOT FOUND THEN
      v_current_qty := 0;
    END IF;

    -- ── 3. قراءة التكلفة الحالية للمادة ─────────────────────────
    SELECT COALESCE(cost, 0)
    INTO v_current_cost
    FROM ingredients
    WHERE brand_id = p_brand_id AND sku = rec.ing_sku
    FOR UPDATE;

    IF NOT FOUND THEN
      v_current_cost := 0;
    END IF;

    -- ── 4. حساب WAC ──────────────────────────────────────────────
    -- إذا كانت قيمة الشراء صفر، نبقي التكلفة الحالية ونضيف الكمية فقط
    IF v_purchase_value > 0 THEN
      IF v_current_qty > 0 THEN
        v_new_cost := (v_current_qty * v_current_cost + v_purchase_value)
                      / (v_current_qty + v_purchase_qty);
      ELSE
        v_new_cost := v_purchase_value / NULLIF(v_purchase_qty, 0);
      END IF;
      v_new_cost := ROUND(v_new_cost::numeric, 4);
    ELSE
      -- مشتريات مجانية: نحافظ على التكلفة الحالية، نضيف الكمية فقط
      v_new_cost := v_current_cost;
    END IF;

    v_new_qty := GREATEST(0, v_current_qty) + v_purchase_qty;

    -- ── 5. تحديث تكلفة المادة إذا تغيّرت ────────────────────────
    IF v_purchase_value > 0 AND ABS(v_new_cost - v_current_cost) > 0.0001 THEN
      UPDATE ingredients
      SET cost = v_new_cost
      WHERE brand_id = p_brand_id AND sku = rec.ing_sku;

      INSERT INTO price_history (brand_id, sku, item_name, item_type, old_price, new_price, changed_by, changed_at)
      VALUES (p_brand_id, rec.ing_sku, rec.ing_name, 'ingredient', v_current_cost, v_new_cost, p_performed_by, now());

      v_changed_ings := v_changed_ings || jsonb_build_array(
        jsonb_build_object('sku', rec.ing_sku, 'new_cost', v_new_cost)
      );
      v_updated      := v_updated + 1;
      v_history_rows := v_history_rows + 1;
    END IF;

    -- ── 6. تحديث المخزون دائماً (حتى للمشتريات المجانية) ────────
    INSERT INTO stock_items (brand_id, ing_sku, ing_name, unit, current_qty, min_qty, updated_at)
    VALUES (p_brand_id, rec.ing_sku, rec.ing_name, rec.unit, v_new_qty, 0, now())
    ON CONFLICT (brand_id, ing_sku) DO UPDATE
      SET current_qty = EXCLUDED.current_qty,
          updated_at  = now();

    v_stock_updated := v_stock_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',                  true,
    'updated',             v_updated,
    'stock_updated',       v_stock_updated,
    'price_history',       v_history_rows,
    'changed_ingredients', v_changed_ings
  );
END;
$$;
