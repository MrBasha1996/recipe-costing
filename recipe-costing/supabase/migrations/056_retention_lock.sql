-- =====================================================
-- Migration 056: Retention Lock — منع حذف سجلات مالية +7 سنوات
-- =====================================================
-- 16-ج: امتثال للحفاظ على السجلات المالية 7 سنوات (ZATCA / PDPL)
--        trigger على purchases و daily_sales و stock_movements

CREATE OR REPLACE FUNCTION check_retention_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.created_at < now() - interval '7 years' THEN
      RAISE EXCEPTION 'لا يمكن حذف سجلات أقدم من 7 سنوات — متطلبات الاحتفاظ بالسجلات المالية'
        USING ERRCODE = 'P0007';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ── purchases ─────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_purchases_retention ON purchases;
CREATE TRIGGER trg_purchases_retention
  BEFORE DELETE ON purchases
  FOR EACH ROW EXECUTE FUNCTION check_retention_lock();

-- ── daily_sales ───────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_daily_sales_retention ON daily_sales;
CREATE TRIGGER trg_daily_sales_retention
  BEFORE DELETE ON daily_sales
  FOR EACH ROW EXECUTE FUNCTION check_retention_lock();

-- ── stock_movements ───────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_stock_movements_retention ON stock_movements;
CREATE TRIGGER trg_stock_movements_retention
  BEFORE DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION check_retention_lock();
