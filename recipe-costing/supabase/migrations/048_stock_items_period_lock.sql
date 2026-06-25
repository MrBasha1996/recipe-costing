-- =====================================================
-- Migration 048: Period Lock على stock_items
-- =====================================================
-- الهدف: منع تعديل مخزون البراند مباشرة عبر client
--   عندما يكون له فترة مغلقة (closed_up_to IS NOT NULL).
-- الكتابات عبر SECURITY DEFINER RPCs تستخدم service_role
--   الذي لا يمر عبر RLS — فهي مستثناة تلقائياً.

-- ── 1. دالة التحقق ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_stock_items_not_locked()
RETURNS trigger
SECURITY INVOKER
LANGUAGE plpgsql
AS $$
DECLARE
  v_brand_id     text;
  v_closed_up_to text;
BEGIN
  -- auth.uid() يعود NULL للـ service_role (admin client) ويعود UUID للمستخدمين المصادق عليهم.
  -- نسمح بكل كتابات service_role (RPCs وعمليات admin).
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- DELETE: NEW يكون NULL، نستخدم OLD
  v_brand_id := COALESCE(NEW.brand_id, OLD.brand_id);

  SELECT closed_up_to INTO v_closed_up_to
  FROM brands
  WHERE id = v_brand_id;

  IF v_closed_up_to IS NOT NULL THEN
    RAISE EXCEPTION
      'لا يمكن تعديل مخزون فترة مغلقة مباشرة — استخدم الإجراءات المعتمدة'
      USING ERRCODE = '55006';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 2. إضافة trigger على INSERT/UPDATE/DELETE ─────────────────────
DROP TRIGGER IF EXISTS trg_stock_items_period_lock ON stock_items;

CREATE TRIGGER trg_stock_items_period_lock
  BEFORE INSERT OR UPDATE OR DELETE
  ON stock_items
  FOR EACH ROW
  EXECUTE FUNCTION check_stock_items_not_locked();
