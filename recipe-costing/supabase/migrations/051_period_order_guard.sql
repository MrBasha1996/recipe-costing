-- =====================================================
-- Migration 051: Period Order Guard + Race Condition Fix
-- =====================================================
-- 11-ب: فرض ترتيب إغلاق الفترات — لا يمكن إغلاق شهر إذا الشهر السابق لم يُغلق
-- 11-ج: SELECT FOR UPDATE في apply_produce_writes لمنع race condition

-- ── الجزء الأول: إعادة كتابة close_period مع فحص الترتيب ──────────────────

CREATE OR REPLACE FUNCTION close_period(
  p_brand_id    text,
  p_year_month  text,
  p_closed_by   uuid DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_start            date;
  v_end              date;
  v_current_ym       text;
  v_prev_ym          text;
  v_expected_next_ym text;
  v_sales            numeric := 0;
  v_sales_net        numeric := 0;
  v_cogs             numeric := 0;
  v_purchases        numeric := 0;
  v_inv_value        numeric := 0;
  v_opening_inv      numeric := 0;
  v_snapshot         jsonb;
  v_inv_items        jsonb;
  v_closed_up_to     text;
BEGIN
  IF p_year_month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'P0001' USING MESSAGE = 'صيغة الشهر غير صحيحة — استخدم YYYY-MM';
  END IF;

  v_start      := (p_year_month || '-01')::date;
  v_end        := (date_trunc('month', v_start) + interval '1 month - 1 day')::date;
  v_current_ym := to_char(now(), 'YYYY-MM');
  v_prev_ym    := to_char(v_start - interval '1 day', 'YYYY-MM');

  IF p_year_month > v_current_ym THEN
    RAISE EXCEPTION 'P0002' USING MESSAGE = 'لا يمكن إغلاق شهر مستقبلي';
  END IF;

  IF EXISTS (
    SELECT 1 FROM period_snapshots
    WHERE brand_id = p_brand_id AND year_month = p_year_month
  ) THEN
    RAISE EXCEPTION 'P0003' USING MESSAGE = 'هذه الفترة مُغلقة بالفعل';
  END IF;

  -- ── فحص الترتيب: الشهر المطلوب يجب أن يكون الشهر التالي مباشرة لآخر مغلق ──
  SELECT closed_up_to INTO v_closed_up_to
  FROM brands WHERE id = p_brand_id;

  IF v_closed_up_to IS NOT NULL THEN
    -- الشهر التالي المسموح به = closed_up_to + شهر واحد
    v_expected_next_ym := to_char(
      (v_closed_up_to || '-01')::date + interval '1 month',
      'YYYY-MM'
    );
    IF p_year_month <> v_expected_next_ym THEN
      RAISE EXCEPTION 'P0004' USING MESSAGE =
        'يجب إغلاق ' || v_expected_next_ym || ' أولاً قبل إغلاق ' || p_year_month;
    END IF;
  END IF;
  -- إذا v_closed_up_to IS NULL: هذا أول إغلاق — مسموح بأي شهر

  -- ── 1. إجمالي المبيعات ─────────────────────────────────────────
  SELECT COALESCE(SUM(revenue), 0) INTO v_sales
  FROM daily_sales
  WHERE brand_id = p_brand_id
    AND sale_date BETWEEN v_start AND v_end;

  v_sales_net := round(v_sales / 1.15, 2);

  -- ── 2. COGS (حركات الصرف والهالك) ─────────────────────────────
  SELECT COALESCE(SUM(value), 0) INTO v_cogs
  FROM stock_movements
  WHERE brand_id = p_brand_id
    AND movement_type IN ('out', 'waste')
    AND created_at::date BETWEEN v_start AND v_end;

  -- ── 3. إجمالي المشتريات ────────────────────────────────────────
  SELECT COALESCE(SUM(total_price), 0) INTO v_purchases
  FROM purchases
  WHERE brand_id = p_brand_id
    AND purchase_date BETWEEN v_start AND v_end;

  -- ── 4. قيمة المخزون الختامي + تفصيل كل صنف ───────────────────
  SELECT
    COALESCE(SUM(si.current_qty * i.cost), 0),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'sku',   si.ing_sku,
          'name',  si.ing_name,
          'qty',   si.current_qty,
          'unit',  si.unit,
          'cost',  i.cost,
          'value', round((si.current_qty * i.cost)::numeric, 4)
        ) ORDER BY si.ing_name
      ) FILTER (WHERE si.current_qty > 0),
      '[]'::jsonb
    )
  INTO v_inv_value, v_inv_items
  FROM stock_items si
  JOIN ingredients i
    ON i.sku = si.ing_sku AND i.brand_id = si.brand_id
  WHERE si.brand_id = p_brand_id;

  -- ── 5. مخزون أول المدة = مخزون آخر الفترة السابقة ────────────
  SELECT COALESCE((snapshot->>'ending_inv_value')::numeric, 0)
  INTO   v_opening_inv
  FROM   period_snapshots
  WHERE  brand_id = p_brand_id
    AND  year_month = v_prev_ym;

  -- ── 6. بناء الـ snapshot ───────────────────────────────────────
  v_snapshot := jsonb_build_object(
    'year_month',        p_year_month,
    'sales',             round(v_sales, 2),
    'sales_net',         v_sales_net,
    'cogs',              round(v_cogs, 4),
    'gross_profit',      round(v_sales_net - v_cogs, 2),
    'fc_pct',            CASE WHEN v_sales_net > 0
                           THEN round((v_cogs / v_sales_net * 100)::numeric, 1)
                           ELSE 0 END,
    'purchases',         round(v_purchases, 2),
    'opening_inv_value', round(v_opening_inv, 2),
    'ending_inv_value',  round(v_inv_value, 2),
    'closing_inventory', v_inv_items,
    'closed_at',         now(),
    'closed_by',         p_closed_by
  );

  -- ── 7. حفظ الـ snapshot ────────────────────────────────────────
  INSERT INTO period_snapshots (brand_id, year_month, snapshot, closed_by, closed_at)
  VALUES (p_brand_id, p_year_month, v_snapshot, p_closed_by, now());

  -- ── 8. تحديث brands.closed_up_to ──────────────────────────────
  UPDATE brands
  SET closed_up_to = p_year_month
  WHERE id = p_brand_id
    AND (closed_up_to IS NULL OR closed_up_to < p_year_month);

  RETURN v_snapshot;
END;
$$;


-- ── الجزء الثاني: apply_produce_writes مع SELECT FOR UPDATE ───────────────

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
DECLARE
  r jsonb;
BEGIN
  -- Security guard
  IF NOT can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'غير مصرح للوصول لهذا البراند' USING ERRCODE = '42501';
  END IF;

  -- Lock affected stock rows to prevent race condition
  -- يمنع مستخدمَين من إنتاج نفس المادة في نفس اللحظة
  PERFORM 1
  FROM stock_items
  WHERE brand_id = p_brand_id
    AND ing_sku IN (
      SELECT r2->>'ing_sku' FROM jsonb_array_elements(p_deductions) AS r2
      UNION ALL SELECT p_batch_sku
    )
  FOR UPDATE;

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
