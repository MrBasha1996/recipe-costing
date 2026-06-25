-- Migration 029: add actuals_json to production_sessions
-- Stores planned ingredient needs at draft time; actual deduction happens at approve time.

ALTER TABLE production_sessions
  ADD COLUMN IF NOT EXISTS actuals_json jsonb;
