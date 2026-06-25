-- Migration 017: Fix recipes_one_active_per_product to include is_semi
--
-- Problem: the unique index on (sku, brand_id) WHERE is_active = true
-- prevents a product and a batch from sharing the same SKU, because
-- both would have is_active = true when first created.
--
-- Fix: add is_semi to the index so a product recipe and a batch recipe
-- with the same SKU can coexist independently.

DROP INDEX IF EXISTS recipes_one_active_per_product;

CREATE UNIQUE INDEX recipes_one_active_per_product
  ON recipes (sku, brand_id, is_semi)
  WHERE is_active = true;
