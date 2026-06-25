-- =====================================================
-- Migration 024: Brand Logo/Color + Stocktake Approval
-- =====================================================

-- ── 1. إضافة شعار ولون وعمولة التوصيل للبراند ────────
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS logo_url       TEXT,
  ADD COLUMN IF NOT EXISTS primary_color  TEXT NOT NULL DEFAULT '#3b82f6';

-- ── 2. إضافة اعتماد لجلسات الجرد ────────────────────
ALTER TABLE stocktake_sessions
  ADD COLUMN IF NOT EXISTS approved_by  UUID REFERENCES user_profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ;
