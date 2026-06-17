-- =====================================================
-- Migration 038: Secure SECURITY DEFINER RPCs + fix RLS
-- =====================================================
-- المشكلة: دوال SECURITY DEFINER قابلة للاستدعاء من أي مستخدم
-- مصادَق عليه مباشرة عبر PostgREST بلا تحقق من هوية البراند.
-- الإصلاح: إضافة can_access_brand() كأول سطر في كل دالة.

-- ── 1. إصلاح RLS على production_sessions ─────────────────────────
-- المشكلة: policy "production_sessions_all" من migration 018 مفتوحة
-- FOR ALL USING (true) — أي مستخدم يقرأ كل الجلسات.
-- Migration 031 أضاف policies جديدة لكن لم يحذف القديمة.

DROP POLICY IF EXISTS "production_sessions_all" ON production_sessions;

DROP POLICY IF EXISTS "prod_sessions_select" ON production_sessions;
CREATE POLICY "prod_sessions_select"
  ON production_sessions FOR SELECT
  TO authenticated
  USING (can_access_brand(brand_id));

-- ── 2. apply_explode_writes — security check + brand_id filter ────
-- الإصلاح A: can_access_brand check أول سطر
-- الإصلاح B: UPDATE daily_sales.cost يُضيف AND brand_id = p_brand_id

CREATE OR REPLACE FUNCTION apply_explode_writes(
  p_brand_id     text,
  p_import_batch uuid,
  p_stock_upserts jsonb,
  p_movements    jsonb,
  p_sale_costs   jsonb
)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Security guard: التحقق من صلاحية البراند
  IF NOT can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'غير مصرح للوصول لهذا البراند' USING ERRCODE = '42501';
  END IF;

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

  -- 3. Mark batch as exploded
  UPDATE daily_sales
  SET exploded_at = now()
  WHERE brand_id = p_brand_id AND import_batch = p_import_batch;

  -- 4. Per-sale cost — مقيّد بـ brand_id لمنع تعديل بيانات براند آخر
  UPDATE daily_sales
  SET cost = (r->>'cost')::numeric
  FROM jsonb_array_elements(p_sale_costs) AS r
  WHERE daily_sales.id        = (r->>'id')::uuid
    AND daily_sales.brand_id  = p_brand_id;
END;
$$;

-- ── 3. apply_purchase_wac — security check ────────────────────────

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

  -- ── 1. تجميع المشتريات لكل SKU ──────────────────────────────────
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
      AND unit_cost > 0
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
    IF v_current_qty > 0 THEN
      v_new_cost := (v_current_qty * v_current_cost + v_purchase_value)
                    / (v_current_qty + v_purchase_qty);
    ELSE
      v_new_cost := v_purchase_value / NULLIF(v_purchase_qty, 0);
    END IF;

    v_new_cost := ROUND(v_new_cost::numeric, 4);
    v_new_qty  := GREATEST(0, v_current_qty) + v_purchase_qty;

    -- ── 5. تحديث تكلفة المادة إذا تغيّرت ────────────────────────
    IF ABS(v_new_cost - v_current_cost) > 0.0001 THEN
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

    -- ── 6. تحديث المخزون ─────────────────────────────────────────
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

-- ── 4. delete_production_session — security check ─────────────────

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
BEGIN
  -- Security guard
  IF NOT can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'غير مصرح للوصول لهذا البراند' USING ERRCODE = '42501';
  END IF;

  -- تحقق أن الجلسة موجودة وجلب حالتها وتاريخها
  SELECT status, created_at INTO v_status, v_created_at
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
END;
$$;

-- ── 5. close_period — security check + force auth.uid() ──────────

CREATE OR REPLACE FUNCTION close_period(
  p_brand_id    text,
  p_year_month  text,
  p_closed_by   uuid DEFAULT NULL  -- مُهمَل: يُستبدَل داخلياً بـ auth.uid()
)
RETURNS jsonb
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller          uuid;
  v_start           date;
  v_end             date;
  v_current_ym      text;
  v_sales           numeric := 0;
  v_modifier_sales  numeric := 0;
  v_sales_net       numeric := 0;
  v_cogs            numeric := 0;
  v_purchases       numeric := 0;
  v_inv_value       numeric := 0;
  v_snapshot        jsonb;
  v_inv_items       jsonb;
BEGIN
  -- Security guard: تحقق من البراند والصلاحية
  IF NOT can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'غير مصرح للوصول لهذا البراند' USING ERRCODE = '42501';
  END IF;

  -- تجاهل p_closed_by من العميل — استخدم المستخدم الحالي
  v_caller := auth.uid();

  -- ── التحقق من صيغة الشهر ──────────────────────────────────────────
  IF p_year_month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'P0001' USING MESSAGE = 'صيغة الشهر غير صحيحة — استخدم YYYY-MM';
  END IF;

  v_start      := (p_year_month || '-01')::date;
  v_end        := (date_trunc('month', v_start) + interval '1 month - 1 day')::date;
  v_current_ym := to_char(now(), 'YYYY-MM');

  -- ── لا يمكن إغلاق شهر مستقبلي ────────────────────────────────────
  IF p_year_month > v_current_ym THEN
    RAISE EXCEPTION 'P0002' USING MESSAGE = 'لا يمكن إغلاق شهر مستقبلي';
  END IF;

  -- ── الفترة مغلقة مسبقاً ───────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM period_snapshots
    WHERE brand_id = p_brand_id AND year_month = p_year_month
  ) THEN
    RAISE EXCEPTION 'P0003' USING MESSAGE = 'هذه الفترة مُغلقة بالفعل';
  END IF;

  -- ── 1. إجمالي المبيعات ────────────────────────────────────────────
  SELECT COALESCE(SUM(revenue), 0) INTO v_sales
  FROM daily_sales
  WHERE brand_id = p_brand_id
    AND sale_date BETWEEN v_start AND v_end;

  -- ── 1b. إيراد الإضافات (modifier_sales) ─────────────────────────
  -- date_from يقع ضمن الفترة المُغلقة (حسب بداية فترة الاستيراد)
  SELECT COALESCE(SUM(revenue), 0) INTO v_modifier_sales
  FROM modifier_sales
  WHERE brand_id = p_brand_id
    AND date_from BETWEEN v_start AND v_end;

  v_sales     := v_sales + v_modifier_sales;
  v_sales_net := round(v_sales / 1.15, 2);

  -- ── 2. COGS ───────────────────────────────────────────────────────
  SELECT COALESCE(SUM(value), 0) INTO v_cogs
  FROM stock_movements
  WHERE brand_id = p_brand_id
    AND movement_type IN ('out', 'waste')
    AND created_at::date BETWEEN v_start AND v_end;

  -- ── 3. إجمالي المشتريات ───────────────────────────────────────────
  SELECT COALESCE(SUM(total_price), 0) INTO v_purchases
  FROM purchases
  WHERE brand_id = p_brand_id
    AND purchase_date BETWEEN v_start AND v_end;

  -- ── 4. قيمة المخزون الختامي ──────────────────────────────────────
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

  -- ── 5. بناء الـ snapshot ──────────────────────────────────────────
  v_snapshot := jsonb_build_object(
    'year_month',        p_year_month,
    'sales',             round(v_sales, 2),       -- شامل إيراد الإضافات
    'modifier_sales',    round(v_modifier_sales, 2),
    'sales_net',         v_sales_net,
    'cogs',              round(v_cogs, 4),
    'gross_profit',      round(v_sales_net - v_cogs, 2),
    'fc_pct',            CASE WHEN v_sales_net > 0
                           THEN round((v_cogs / v_sales_net * 100)::numeric, 1)
                           ELSE 0 END,
    'purchases',         round(v_purchases, 2),
    'ending_inv_value',  round(v_inv_value, 2),
    'closing_inventory', v_inv_items,
    'closed_at',         now(),
    'closed_by',         v_caller
  );

  -- ── 6. حفظ الـ snapshot ───────────────────────────────────────────
  INSERT INTO period_snapshots (brand_id, year_month, snapshot, closed_by, closed_at)
  VALUES (p_brand_id, p_year_month, v_snapshot, v_caller, now());

  -- ── 7. تحديث brands.closed_up_to ─────────────────────────────────
  UPDATE brands
  SET closed_up_to = p_year_month
  WHERE id = p_brand_id
    AND (closed_up_to IS NULL OR closed_up_to < p_year_month);

  RETURN v_snapshot;
END;
$$;

-- ── 6. period_snapshots SELECT policy ────────────────────────────
-- إصلاح: من USING (true) → مقيّد بالبراند الخاص

DROP POLICY IF EXISTS "period_snapshots_select" ON period_snapshots;
CREATE POLICY "period_snapshots_select"
  ON period_snapshots FOR SELECT
  TO authenticated
  USING (can_access_brand(brand_id));
