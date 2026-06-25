-- =====================================================
-- Migration 049: apply_recipe_cost_cascade RPC
-- =====================================================
-- المشكلة: تحديث تكاليف الوصفات بعد تطبيق المشتريات يستغرق N+M+K
-- طلبات تسلسلية للـ DB (loop لكل SKU، loop لكل وصفة، loop لكل كومبو).
-- النتيجة: timeout في Vercel عند 200+ وصفة، وbug صامت (recipe_ingredients
-- لا تملك عمود brand_id فكانت الحلقة لا تُنفَّذ أبداً).
--
-- الحل: دالة واحدة تنفّذ كل شيء في transaction بـ UPDATE...FROM بدل loops.
-- تُستدعى من admin client — الـ auth يُتحقق منه في route handler.
-- =====================================================

CREATE OR REPLACE FUNCTION apply_recipe_cost_cascade(
  p_brand_id     text,
  p_changed_skus jsonb   -- [{sku: text, new_cost: numeric}, ...]
)
RETURNS jsonb
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_ri_updated      int := 0;
  v_recipes_updated int := 0;
  v_combos_updated  int := 0;
BEGIN

  -- ── 1. تحديث unit_cost في recipe_ingredients ────────────────────────
  -- recipe_ingredients لا تملك brand_id → نصفّي عبر JOIN بـ recipes.brand_id
  -- batch UPDATE واحد بدل N طلبات (واحد لكل SKU)
  UPDATE recipe_ingredients ri
  SET unit_cost = changed.new_cost
  FROM (
    SELECT (el->>'sku') AS sku, (el->>'new_cost')::numeric AS new_cost
    FROM jsonb_array_elements(p_changed_skus) AS el
    WHERE el->>'sku'      IS NOT NULL
      AND el->>'new_cost' IS NOT NULL
  ) changed,
  recipes r
  WHERE ri.recipe_id  = r.id
    AND r.brand_id    = p_brand_id
    AND ri.ing_sku    = changed.sku;

  GET DIAGNOSTICS v_ri_updated = ROW_COUNT;

  -- ── 2. إعادة حساب تكاليف الوصفات المتأثرة ─────────────────────────
  -- المتأثرة = الوصفات النشطة التي تحتوي على SKUs مغيّرة
  UPDATE recipes r
  SET
    total_cost    = ROUND(rc.main_cost::numeric, 4),
    food_cost_pct = ROUND(
      CASE WHEN (r.sell_price / 1.15) > 0
        THEN (rc.main_cost / GREATEST(r.yield_portions, 1))
             / (r.sell_price / 1.15) * 100
        ELSE 0
      END::numeric, 2),
    margin        = ROUND(
      ((r.sell_price / 1.15) - rc.main_cost / GREATEST(r.yield_portions, 1))::numeric, 4),
    margin_app    = CASE WHEN r.app_price IS NOT NULL
      THEN ROUND(
        ((r.app_price / 1.15) - rc.main_cost / GREATEST(r.yield_portions, 1))::numeric, 4)
      ELSE r.margin_app
    END,
    -- dine_out fields: تُحدَّث فقط إذا توجد صفوف packaging (service_type = 'dine_out')
    dine_out_total_cost    = CASE WHEN rc.has_packaging
      THEN ROUND(rc.full_cost::numeric, 4)
      ELSE r.dine_out_total_cost
    END,
    dine_out_food_cost_pct = CASE
      WHEN rc.has_packaging AND r.app_price IS NOT NULL AND (r.app_price / 1.15) > 0
      THEN ROUND(
        (rc.full_cost / GREATEST(r.yield_portions, 1)) / (r.app_price / 1.15) * 100::numeric, 2)
      ELSE r.dine_out_food_cost_pct
    END,
    dine_out_margin = CASE WHEN rc.has_packaging AND r.app_price IS NOT NULL
      THEN ROUND(
        ((r.app_price / 1.15) - rc.full_cost / GREATEST(r.yield_portions, 1))::numeric, 4)
      ELSE r.dine_out_margin
    END
  FROM (
    -- حساب تكلفة كل وصفة متأثرة من unit_cost المُحدَّث في الخطوة 1
    SELECT
      ri.recipe_id,
      -- main_cost: كل الصفوف غير dine_out مع yield_pct > 0
      SUM(CASE
        WHEN ri.service_type != 'dine_out' AND ri.yield_pct > 0
        THEN ri.qty / (ri.yield_pct / 100.0) * ri.unit_cost
        ELSE 0
      END) AS main_cost,
      -- full_cost: كل الصفوف (main + packaging) مع yield_pct > 0
      SUM(CASE
        WHEN ri.yield_pct > 0
        THEN ri.qty / (ri.yield_pct / 100.0) * ri.unit_cost
        ELSE 0
      END) AS full_cost,
      BOOL_OR(ri.service_type = 'dine_out') AS has_packaging
    FROM recipe_ingredients ri
    WHERE ri.recipe_id IN (
      -- الوصفات النشطة التابعة للبراند التي تستخدم SKUs مغيّرة
      SELECT DISTINCT r2.id
      FROM recipes r2
      INNER JOIN recipe_ingredients ri2 ON ri2.recipe_id = r2.id
      WHERE r2.brand_id  = p_brand_id
        AND r2.is_active = true
        AND ri2.ing_sku IN (
          SELECT el->>'sku'
          FROM jsonb_array_elements(p_changed_skus) el
          WHERE el->>'sku' IS NOT NULL
        )
    )
    GROUP BY ri.recipe_id
  ) rc
  WHERE r.id       = rc.recipe_id
    AND r.brand_id = p_brand_id;

  GET DIAGNOSTICS v_recipes_updated = ROW_COUNT;

  -- ── 3. تحديث combo_meal_items للمنتجات المتأثرة ──────────────────
  -- recipes.sku يطابق combo_meal_items.product_sku
  -- EXISTS يتجنّب تكرار الصفوف إذا كانت الوصفة تحتوي على أكثر من SKU مغيّر
  UPDATE combo_meal_items cmi
  SET
    unit_cost  = ROUND((r.total_cost / GREATEST(r.yield_portions, 1))::numeric, 4),
    total_cost = ROUND(
      (r.total_cost / GREATEST(r.yield_portions, 1) * cmi.qty)::numeric, 4)
  FROM recipes r
  WHERE r.brand_id    = p_brand_id
    AND r.is_active   = true
    AND r.sku         = cmi.product_sku
    AND cmi.brand_id  = p_brand_id
    AND EXISTS (
      SELECT 1
      FROM recipe_ingredients ri
      WHERE ri.recipe_id = r.id
        AND ri.ing_sku IN (
          SELECT el->>'sku'
          FROM jsonb_array_elements(p_changed_skus) el
          WHERE el->>'sku' IS NOT NULL
        )
    );

  -- ── 4. إعادة حساب مجاميع combo_meals ─────────────────────────────
  -- يُقرأ من combo_meal_items بعد تحديث الخطوة 3 (في نفس transaction)
  UPDATE combo_meals cm
  SET
    total_cost    = ROUND(cc.total_item_cost::numeric, 4),
    food_cost_pct = ROUND(
      CASE WHEN (cm.price / 1.15) > 0
        THEN cc.total_item_cost / (cm.price / 1.15) * 100
        ELSE 0
      END::numeric, 1),
    margin        = ROUND(((cm.price / 1.15) - cc.total_item_cost)::numeric, 2),
    margin_app    = CASE WHEN cm.app_price IS NOT NULL
      THEN ROUND(((cm.app_price / 1.15) - cc.total_item_cost)::numeric, 2)
      ELSE cm.margin_app
    END
  FROM (
    -- إعادة جمع تكاليف العناصر المُحدَّثة لكل كومبو متأثر
    SELECT cmi.combo_id, SUM(cmi.unit_cost * cmi.qty) AS total_item_cost
    FROM combo_meal_items cmi
    WHERE cmi.brand_id = p_brand_id
      AND cmi.combo_id IN (
        -- الكومبوهات التي تحتوي على منتجات وصفاتها استخدمت SKUs مغيّرة
        SELECT DISTINCT cmi2.combo_id
        FROM combo_meal_items cmi2
        INNER JOIN recipes r2
          ON r2.brand_id  = p_brand_id
         AND r2.is_active = true
         AND r2.sku       = cmi2.product_sku
        WHERE cmi2.brand_id = p_brand_id
          AND EXISTS (
            SELECT 1
            FROM recipe_ingredients ri2
            WHERE ri2.recipe_id = r2.id
              AND ri2.ing_sku IN (
                SELECT el->>'sku'
                FROM jsonb_array_elements(p_changed_skus) el
                WHERE el->>'sku' IS NOT NULL
              )
          )
      )
    GROUP BY cmi.combo_id
  ) cc
  WHERE cm.id       = cc.combo_id
    AND cm.brand_id = p_brand_id;

  GET DIAGNOSTICS v_combos_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',              true,
    'ri_updated',      v_ri_updated,
    'recipes_updated', v_recipes_updated,
    'combos_updated',  v_combos_updated
  );
END;
$$;
