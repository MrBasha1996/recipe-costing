-- =====================================================
-- Migration 040: Fix period_snapshots.closed_by FK
-- =====================================================
-- المشكلة: period_snapshots.closed_by لا يحتوي ON DELETE SET NULL.
-- إذا حُذف مستخدم أغلق فترة → خطأ FK constraint يمنع الحذف.
-- هذا يخرق PDPL (المادة 17 — حق المحو) إذا طُلب حذف البيانات.

ALTER TABLE period_snapshots
  DROP CONSTRAINT IF EXISTS period_snapshots_closed_by_fkey;

ALTER TABLE period_snapshots
  ADD CONSTRAINT period_snapshots_closed_by_fkey
  FOREIGN KEY (closed_by)
  REFERENCES user_profiles(id)
  ON DELETE SET NULL;
