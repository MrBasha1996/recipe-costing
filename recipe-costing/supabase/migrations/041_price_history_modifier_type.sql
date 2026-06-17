-- =====================================================
-- Migration 041: Add 'modifier_option' to price_history.item_type
-- =====================================================
-- المشكلة: CHECK constraint على item_type يسمح فقط بـ 'ingredient' و 'product'.
-- الإضافات (modifier_options) لها أسعار تتغير لكن لا يمكن تسجيلها.

ALTER TABLE price_history
  DROP CONSTRAINT IF EXISTS price_history_item_type_check;

ALTER TABLE price_history
  ADD CONSTRAINT price_history_item_type_check
  CHECK (item_type IN ('ingredient', 'product', 'modifier_option'));
