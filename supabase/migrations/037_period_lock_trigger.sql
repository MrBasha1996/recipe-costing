-- =====================================================
-- Migration 037: Database-level period lock trigger
-- =====================================================
-- الحماية الحالية في TypeScript فقط — أي استدعاء مباشر لـ Supabase
-- (console، Postman، route ناسٍ التحقق) يتجاوزها.
-- هذا الـ trigger يُطبّق القفل على مستوى قاعدة البيانات.

CREATE OR REPLACE FUNCTION check_period_not_closed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_closed  text;
  v_row     jsonb;
  v_date    date;
  v_month   text;
BEGIN
  -- جلب closed_up_to للبراند
  SELECT closed_up_to INTO v_closed
  FROM brands
  WHERE id = NEW.brand_id;

  -- إذا لا يوجد إغلاق → مسموح
  IF v_closed IS NULL THEN
    RETURN NEW;
  END IF;

  -- تحويل NEW لـ jsonb لقراءة العمود الديناميكي
  v_row := row_to_json(NEW)::jsonb;

  CASE TG_TABLE_NAME
    WHEN 'daily_sales'     THEN v_date := (v_row->>'sale_date')::date;
    WHEN 'purchases'       THEN v_date := (v_row->>'purchase_date')::date;
    WHEN 'waste_log'       THEN v_date := (v_row->>'log_date')::date;
    WHEN 'stock_movements' THEN v_date := COALESCE((v_row->>'created_at')::timestamptz::date, current_date);
    ELSE RETURN NEW;
  END CASE;

  v_month := to_char(v_date, 'YYYY-MM');

  IF v_month <= v_closed THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: الفترة % مُغلقة — لا يمكن تعديل البيانات في فترة مُغلقة', v_month
      USING ERRCODE = '55006';
  END IF;

  RETURN NEW;
END;
$$;

-- ── تطبيق الـ trigger على الجداول المالية ────────────────────────

DROP TRIGGER IF EXISTS trg_period_lock_daily_sales     ON daily_sales;
DROP TRIGGER IF EXISTS trg_period_lock_purchases        ON purchases;
DROP TRIGGER IF EXISTS trg_period_lock_waste_log        ON waste_log;
DROP TRIGGER IF EXISTS trg_period_lock_stock_movements  ON stock_movements;

CREATE TRIGGER trg_period_lock_daily_sales
  BEFORE INSERT OR UPDATE ON daily_sales
  FOR EACH ROW EXECUTE FUNCTION check_period_not_closed();

CREATE TRIGGER trg_period_lock_purchases
  BEFORE INSERT OR UPDATE ON purchases
  FOR EACH ROW EXECUTE FUNCTION check_period_not_closed();

CREATE TRIGGER trg_period_lock_waste_log
  BEFORE INSERT OR UPDATE ON waste_log
  FOR EACH ROW EXECUTE FUNCTION check_period_not_closed();

CREATE TRIGGER trg_period_lock_stock_movements
  BEFORE INSERT OR UPDATE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION check_period_not_closed();
