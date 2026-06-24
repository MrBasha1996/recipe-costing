-- =====================================================
-- Migration 054: reverse_explode_batch + audit logging
-- =====================================================
-- 16-أ: إضافة import_batch لـ stock_movements + RPC عكس الانفجار
-- 16-د: تسجيل delete_production_session في audit_logs
-- 16-هـ: تسجيل close_period في audit_logs

-- ── 1. إضافة import_batch لـ stock_movements ────────────────────────

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS import_batch uuid;

CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(import_batch)
  WHERE import_batch IS NOT NULL;

-- ── 2. apply_explode_writes — تمرير import_batch للحركات ────────────

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

  -- 2. Audit trail — value = qty × current ingredient cost — مع import_batch
  INSERT INTO stock_movements (brand_id, ing_sku, ing_name, movement_type, qty, value, note, performed_by, import_batch)
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
    NULLIF(r->>'performed_by', '')::uuid,
    p_import_batch
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

  -- 5. Mark modifier_sales as exploded inside same transaction
  IF p_modifier_sales_ids IS NOT NULL AND array_length(p_modifier_sales_ids, 1) > 0 THEN
    UPDATE modifier_sales
    SET exploded_at = now()
    WHERE id = ANY(p_modifier_sales_ids);
  END IF;
END;
$$;


-- ── 3. reverse_explode_batch ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION reverse_explode_batch(
  p_brand_id     text,
  p_import_batch uuid,
  p_reversed_by  uuid DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_closed_up_to  text;
  v_batch_ym      text;
  v_sale_date     date;
  v_movements_del int := 0;
  v_sales_reset   int := 0;
BEGIN
  -- Security guard
  IF NOT can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'غير مصرح للوصول لهذا البراند' USING ERRCODE = '42501';
  END IF;

  -- تحقق أن الـ batch موجود ومُنفجر
  SELECT MIN(sale_date) INTO v_sale_date
  FROM daily_sales
  WHERE brand_id    = p_brand_id
    AND import_batch = p_import_batch
    AND exploded_at IS NOT NULL;

  IF v_sale_date IS NULL THEN
    RAISE EXCEPTION 'الدفعة غير موجودة أو لم تُحتسب بعد' USING ERRCODE = 'P0001';
  END IF;

  -- التحقق أن الحركات مرتبطة بـ import_batch (migration 054+)
  IF NOT EXISTS (
    SELECT 1 FROM stock_movements
    WHERE brand_id = p_brand_id AND import_batch = p_import_batch
  ) THEN
    RAISE EXCEPTION 'هذه الدفعة لا يمكن عكسها — تم احتسابها قبل تطبيق دعم العكس' USING ERRCODE = 'P0005';
  END IF;

  -- فحص الفترة المغلقة
  SELECT closed_up_to INTO v_closed_up_to
  FROM brands WHERE id = p_brand_id;

  v_batch_ym := to_char(v_sale_date, 'YYYY-MM');

  IF v_closed_up_to IS NOT NULL AND v_batch_ym <= v_closed_up_to THEN
    RAISE EXCEPTION 'الفترة % مُغلقة — لا يمكن عكس انفجار دفعة في فترة مُغلقة', v_batch_ym
      USING ERRCODE = 'P0004';
  END IF;

  -- 1. عكس المخزون: استرجاع الكميات من حركات 'out' التابعة لهذا الـ batch
  UPDATE stock_items si
  SET
    current_qty = GREATEST(0, si.current_qty + sm.qty),
    updated_at  = now()
  FROM stock_movements sm
  WHERE sm.brand_id      = p_brand_id
    AND sm.import_batch  = p_import_batch
    AND sm.movement_type = 'out'
    AND si.brand_id      = p_brand_id
    AND si.ing_sku       = sm.ing_sku;

  -- 2. حذف حركات 'out' التابعة لهذا الـ batch
  DELETE FROM stock_movements
  WHERE brand_id     = p_brand_id
    AND import_batch = p_import_batch
    AND movement_type = 'out';

  GET DIAGNOSTICS v_movements_del = ROW_COUNT;

  -- 3. إعادة exploded_at إلى NULL في daily_sales
  UPDATE daily_sales
  SET exploded_at = NULL
  WHERE brand_id     = p_brand_id
    AND import_batch = p_import_batch
    AND exploded_at IS NOT NULL;

  GET DIAGNOSTICS v_sales_reset = ROW_COUNT;

  -- 4. تسجيل في audit_logs
  INSERT INTO audit_logs (brand_id, action, entity_type, entity_sku, performed_by, metadata)
  VALUES (
    p_brand_id,
    'reverse_explode',
    'import_batch',
    p_import_batch::text,
    p_reversed_by,
    jsonb_build_object(
      'batch_ym',       v_batch_ym,
      'movements_del',  v_movements_del,
      'sales_reset',    v_sales_reset
    )
  );

  RETURN jsonb_build_object(
    'ok',             true,
    'movements_del',  v_movements_del,
    'sales_reset',    v_sales_reset,
    'batch_ym',       v_batch_ym
  );
END;
$$;


-- ── 4. delete_production_session — إضافة audit log ──────────────────

CREATE OR REPLACE FUNCTION delete_production_session(
  p_brand_id   text,
  p_session_id uuid,
  p_deleted_by uuid DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status        text;
  v_created_at    timestamptz;
  v_session_ym    text;
  v_closed_up_to  text;
  v_session_name  text;
BEGIN
  -- Security guard
  IF NOT can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'غير مصرح للوصول لهذا البراند' USING ERRCODE = '42501';
  END IF;

  -- تحقق أن الجلسة موجودة وجلب حالتها وتاريخها واسمها
  SELECT status, created_at, COALESCE(batch_sku, id::text)
  INTO v_status, v_created_at, v_session_name
  FROM production_sessions
  WHERE id = p_session_id AND brand_id = p_brand_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الجلسة غير موجودة' USING ERRCODE = 'P0001';
  END IF;

  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'لا يمكن حذف جلسة معتمدة' USING ERRCODE = 'P0003';
  END IF;

  -- ── Period close guard ────────────────────────────────────────────
  SELECT closed_up_to INTO v_closed_up_to
  FROM brands WHERE id = p_brand_id;

  IF v_closed_up_to IS NOT NULL THEN
    v_session_ym := to_char(v_created_at, 'YYYY-MM');
    IF v_session_ym <= v_closed_up_to THEN
      RAISE EXCEPTION 'الفترة % مُغلقة — لا يمكن حذف جلسة في فترة مُغلقة', v_session_ym
        USING ERRCODE = 'P0004';
    END IF;
  END IF;

  -- عكس المخزون: out → يُرجَع، in → يُطرح
  UPDATE stock_items si
  SET
    current_qty = GREATEST(0,
      si.current_qty + CASE sm.movement_type WHEN 'out' THEN sm.qty ELSE -sm.qty END
    ),
    updated_at = now()
  FROM stock_movements sm
  WHERE sm.production_session_id = p_session_id
    AND sm.brand_id  = p_brand_id
    AND si.brand_id  = p_brand_id
    AND si.ing_sku   = sm.ing_sku;

  -- حذف حركات الجلسة
  DELETE FROM stock_movements
  WHERE production_session_id = p_session_id
    AND brand_id = p_brand_id;

  -- حذف الجلسة
  DELETE FROM production_sessions
  WHERE id = p_session_id
    AND brand_id = p_brand_id;

  -- تسجيل في audit_logs
  INSERT INTO audit_logs (brand_id, action, entity_type, entity_sku, performed_by, metadata)
  VALUES (
    p_brand_id,
    'production_session_deleted',
    'production_session',
    v_session_name,
    p_deleted_by,
    jsonb_build_object(
      'session_id',  p_session_id,
      'session_ym',  COALESCE(v_session_ym, to_char(v_created_at, 'YYYY-MM')),
      'status',      v_status
    )
  );
END;
$$;


-- ── 5. close_period — إضافة audit log ───────────────────────────────

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

  -- ── فحص الترتيب ──────────────────────────────────────────────────
  SELECT closed_up_to INTO v_closed_up_to
  FROM brands WHERE id = p_brand_id;

  IF v_closed_up_to IS NOT NULL THEN
    v_expected_next_ym := to_char(
      (v_closed_up_to || '-01')::date + interval '1 month',
      'YYYY-MM'
    );
    IF p_year_month <> v_expected_next_ym THEN
      RAISE EXCEPTION 'P0004' USING MESSAGE =
        'يجب إغلاق ' || v_expected_next_ym || ' أولاً قبل إغلاق ' || p_year_month;
    END IF;
  END IF;

  SELECT COALESCE(SUM(revenue), 0) INTO v_sales
  FROM daily_sales
  WHERE brand_id = p_brand_id AND sale_date BETWEEN v_start AND v_end;

  v_sales_net := round(v_sales / 1.15, 2);

  SELECT COALESCE(SUM(value), 0) INTO v_cogs
  FROM stock_movements
  WHERE brand_id = p_brand_id
    AND movement_type IN ('out', 'waste')
    AND created_at::date BETWEEN v_start AND v_end;

  SELECT COALESCE(SUM(total_price), 0) INTO v_purchases
  FROM purchases
  WHERE brand_id = p_brand_id AND purchase_date BETWEEN v_start AND v_end;

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
  JOIN ingredients i ON i.sku = si.ing_sku AND i.brand_id = si.brand_id
  WHERE si.brand_id = p_brand_id;

  SELECT COALESCE((snapshot->>'ending_inv_value')::numeric, 0)
  INTO   v_opening_inv
  FROM   period_snapshots
  WHERE  brand_id = p_brand_id AND year_month = v_prev_ym;

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

  INSERT INTO period_snapshots (brand_id, year_month, snapshot, closed_by, closed_at)
  VALUES (p_brand_id, p_year_month, v_snapshot, p_closed_by, now());

  UPDATE brands
  SET closed_up_to = p_year_month
  WHERE id = p_brand_id AND (closed_up_to IS NULL OR closed_up_to < p_year_month);

  -- تسجيل في audit_logs
  INSERT INTO audit_logs (brand_id, action, entity_type, entity_sku, performed_by, metadata)
  VALUES (
    p_brand_id,
    'period_closed',
    'period_snapshot',
    p_year_month,
    p_closed_by,
    jsonb_build_object(
      'sales_net',  round(v_sales_net, 2),
      'cogs',       round(v_cogs, 4),
      'fc_pct',     CASE WHEN v_sales_net > 0
                      THEN round((v_cogs / v_sales_net * 100)::numeric, 1)
                      ELSE 0 END,
      'purchases',  round(v_purchases, 2),
      'ending_inv', round(v_inv_value, 2)
    )
  );

  RETURN v_snapshot;
END;
$$;
