-- =====================================================
-- Migration 057: Right to Erasure — anonymize_user
-- =====================================================
-- 16-و: دالة إخفاء هوية المستخدم (PDPL / GDPR Right to Erasure)
--        super admin فقط — تحتفظ بـ UUID في audit_logs

CREATE OR REPLACE FUNCTION anonymize_user(p_user_id uuid)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_is_super boolean;
  v_profile_exists  boolean;
  v_anon_name       text;
  v_anon_email      text;
  v_anon_username   text;
BEGIN
  -- تحقق أن المُستدعي super admin
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN roles r ON r.id = up.role_id
    WHERE up.id = auth.uid() AND r.is_super_admin = true
  ) INTO v_caller_is_super;

  IF NOT v_caller_is_super THEN
    RAISE EXCEPTION 'هذه العملية متاحة للمدير العام فقط' USING ERRCODE = '42501';
  END IF;

  -- تحقق أن المستخدم موجود
  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id)
  INTO v_profile_exists;

  IF NOT v_profile_exists THEN
    RAISE EXCEPTION 'المستخدم غير موجود' USING ERRCODE = 'P0001';
  END IF;

  -- لا يمكن حذف نفسك
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'لا يمكن حذف حسابك الخاص' USING ERRCODE = 'P0002';
  END IF;

  v_anon_name     := 'DELETED_' || left(p_user_id::text, 8);
  v_anon_username := 'deleted_' || left(p_user_id::text, 8);
  v_anon_email    := 'deleted_' || p_user_id::text || '@deleted.invalid';

  -- 1. إخفاء هوية user_profiles
  UPDATE user_profiles
  SET
    name_ar  = v_anon_name,
    username = v_anon_username
  WHERE id = p_user_id;

  -- 2. إخفاء البريد الإلكتروني في auth.users (يتطلب SECURITY DEFINER + امتياز كافٍ)
  UPDATE auth.users
  SET
    email             = v_anon_email,
    raw_user_meta_data = '{}'::jsonb,
    raw_app_meta_data  = '{}'::jsonb,
    phone              = NULL
  WHERE id = p_user_id;

  -- 3. تسجيل العملية في audit_logs
  INSERT INTO audit_logs (action, entity_type, entity_sku, performed_by, metadata)
  VALUES (
    'user_anonymized',
    'user_profile',
    p_user_id::text,
    auth.uid(),
    jsonb_build_object('anonymized_at', now())
  );
END;
$$;
