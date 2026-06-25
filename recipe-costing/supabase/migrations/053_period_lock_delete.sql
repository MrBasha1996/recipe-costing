-- =====================================================
-- Migration 053: Extend period lock trigger to block DELETE
-- =====================================================
-- Migration 037 only protected INSERT OR UPDATE.
-- A row in daily_sales/purchases from a closed period could still be DELETEd,
-- allowing retroactive removal of financial records — a legal compliance gap.
-- This migration adds OR DELETE to all four triggers.

CREATE OR REPLACE FUNCTION check_period_not_closed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_closed  text;
  v_row     jsonb;
  v_date    date;
  v_month   text;
  v_brand   text;
BEGIN
  -- For DELETE use OLD; for INSERT/UPDATE use NEW
  IF TG_OP = 'DELETE' THEN
    v_brand := OLD.brand_id;
    v_row   := row_to_json(OLD)::jsonb;
  ELSE
    v_brand := NEW.brand_id;
    v_row   := row_to_json(NEW)::jsonb;
  END IF;

  SELECT closed_up_to INTO v_closed
  FROM brands
  WHERE id = v_brand;

  -- No period closed — allow everything
  IF v_closed IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'daily_sales'     THEN v_date := (v_row->>'sale_date')::date;
    WHEN 'purchases'       THEN v_date := (v_row->>'purchase_date')::date;
    WHEN 'waste_log'       THEN v_date := (v_row->>'log_date')::date;
    WHEN 'stock_movements' THEN v_date := COALESCE((v_row->>'created_at')::timestamptz::date, current_date);
    ELSE
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END CASE;

  v_month := to_char(v_date, 'YYYY-MM');

  IF v_month <= v_closed THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: الفترة % مُغلقة — لا يمكن تعديل البيانات في فترة مُغلقة', v_month
      USING ERRCODE = '55006';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- ── Recreate triggers with DELETE added ────────────────────────────

DROP TRIGGER IF EXISTS trg_period_lock_daily_sales     ON daily_sales;
DROP TRIGGER IF EXISTS trg_period_lock_purchases        ON purchases;
DROP TRIGGER IF EXISTS trg_period_lock_waste_log        ON waste_log;
DROP TRIGGER IF EXISTS trg_period_lock_stock_movements  ON stock_movements;

CREATE TRIGGER trg_period_lock_daily_sales
  BEFORE INSERT OR UPDATE OR DELETE ON daily_sales
  FOR EACH ROW EXECUTE FUNCTION check_period_not_closed();

CREATE TRIGGER trg_period_lock_purchases
  BEFORE INSERT OR UPDATE OR DELETE ON purchases
  FOR EACH ROW EXECUTE FUNCTION check_period_not_closed();

CREATE TRIGGER trg_period_lock_waste_log
  BEFORE INSERT OR UPDATE OR DELETE ON waste_log
  FOR EACH ROW EXECUTE FUNCTION check_period_not_closed();

CREATE TRIGGER trg_period_lock_stock_movements
  BEFORE INSERT OR UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION check_period_not_closed();
