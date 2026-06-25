-- =====================================================
-- Migration 047: إضافة opening_inv_value للـ snapshot
-- =====================================================
-- الهدف: إتاحة معادلة COGS الدقيقة:
--   COGS = مخزون أول المدة + مشتريات − مخزون آخر المدة
-- يُضاف opening_inv_value = ending_inv_value من الفترة السابقة.

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
  v_sales            numeric := 0;
  v_sales_net        numeric := 0;
  v_cogs             numeric := 0;
  v_purchases        numeric := 0;
  v_inv_value        numeric := 0;
  v_opening_inv      numeric := 0;
  v_snapshot         jsonb;
  v_inv_items        jsonb;
BEGIN
  IF p_year_month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'P0001' USING MESSAGE = 'صيغة الشهر غير صحيحة — استخدم YYYY-MM';
  END IF;

  v_start      := (p_year_month || '-01')::date;
  v_end        := (date_trunc('month', v_start) + interval '1 month - 1 day')::date;
  v_current_ym := to_char(now(), 'YYYY-MM');
  -- الشهر السابق للـ opening_inv_value
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
  -- إذا لا توجد فترة سابقة مُغلقة، يبقى 0

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
