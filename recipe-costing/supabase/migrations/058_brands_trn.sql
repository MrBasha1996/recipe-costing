-- =====================================================
-- Migration 058: إضافة رقم ضريبي TRN للبراند
-- =====================================================
-- 16-ز: tax_reg_number لمتطلبات ZATCA / الفواتير الإلكترونية

ALTER TABLE brands ADD COLUMN IF NOT EXISTS tax_reg_number text;
