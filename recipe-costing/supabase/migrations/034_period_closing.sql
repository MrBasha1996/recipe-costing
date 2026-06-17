-- =====================================================
-- Migration 034: Period Closing + Snapshot
-- =====================================================
-- الهدف: إغلاق الفترات المحاسبية مع حفظ لقطة ثابتة من البيانات.
-- الإغلاق = (منع الكتابة) + (تجميد القراءة عبر snapshot).

-- ── 1. إضافة closed_up_to لجدول brands ──────────────────────────────
-- YYYY-MM — الشهر الأخير المُغلق. NULL = لا يوجد إغلاق.
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS closed_up_to TEXT;

-- ── 2. جدول period_snapshots ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS period_snapshots (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    TEXT        NOT NULL REFERENCES brands(id),
  year_month  TEXT        NOT NULL,   -- YYYY-MM
  snapshot    JSONB       NOT NULL,   -- البيانات المجمّدة
  closed_by   UUID        REFERENCES user_profiles(id),
  closed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, year_month)
);

-- ── 3. RLS على period_snapshots ───────────────────────────────────────
ALTER TABLE period_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "period_snapshots_select" ON period_snapshots;
CREATE POLICY "period_snapshots_select"
  ON period_snapshots FOR SELECT
  TO authenticated
  USING (true);

-- INSERT يتم فقط عبر دالة SECURITY DEFINER — لا policy مباشرة للمستخدمين
-- UPDATE/DELETE: ممنوع تماماً (لا policy = ممنوع بـ RLS)

-- ── 4. دالة close_period ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION close_period(
  p_brand_id    text,
  p_year_month  text,   -- YYYY-MM
  p_closed_by   uuid
)
RETURNS jsonb
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_start        date;
  v_end          date;
  v_current_ym   text;
  v_sales        numeric := 0;   -- إجمالي شامل VAT
  v_sales_net    numeric := 0;   -- صافي بعد VAT (÷1.15)
  v_cogs         numeric := 0;
  v_purchases    numeric := 0;
  v_inv_value    numeric := 0;
  v_snapshot     jsonb;
  v_inv_items    jsonb;
BEGIN
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

  -- revenue يشمل VAT 15% — نحتاج الصافي للحسابات المالية
  v_sales_net := round(v_sales / 1.15, 2);

  -- ── 2. COGS (حركات الصرف والهالك) ────────────────────────────────
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

  -- ── 4. قيمة المخزون الختامي + تفصيل كل صنف ──────────────────────
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
    'year_month',       p_year_month,
    'sales',            round(v_sales, 2),      -- إجمالي شامل VAT
    'sales_net',        v_sales_net,            -- صافي بعد VAT
    'cogs',             round(v_cogs, 4),
    'gross_profit',     round(v_sales_net - v_cogs, 2),
    'fc_pct',           CASE WHEN v_sales_net > 0
                          THEN round((v_cogs / v_sales_net * 100)::numeric, 1)
                          ELSE 0 END,
    'purchases',        round(v_purchases, 2),
    'ending_inv_value', round(v_inv_value, 2),
    'closing_inventory', v_inv_items,
    'closed_at',        now(),
    'closed_by',        p_closed_by
  );

  -- ── 6. حفظ الـ snapshot ───────────────────────────────────────────
  INSERT INTO period_snapshots (brand_id, year_month, snapshot, closed_by, closed_at)
  VALUES (p_brand_id, p_year_month, v_snapshot, p_closed_by, now());

  -- ── 7. تحديث brands.closed_up_to ─────────────────────────────────
  -- نحدّثه فقط إذا كان الشهر الجديد أحدث أو النعم الأول
  UPDATE brands
  SET closed_up_to = p_year_month
  WHERE id = p_brand_id
    AND (closed_up_to IS NULL OR closed_up_to < p_year_month);

  RETURN v_snapshot;
END;
$$;
