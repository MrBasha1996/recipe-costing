-- =====================================================
-- Migration 032: Atomic delete for production sessions
-- =====================================================
-- المشكلة: حذف جلسة الإنتاج يعكس المخزون بـ loop منفصل في TypeScript —
-- إذا فشلت إحدى الكتابات تنقسم البيانات.
-- الحل: دالة واحدة تجمع عكس المخزون + حذف الحركات + حذف الجلسة.

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
