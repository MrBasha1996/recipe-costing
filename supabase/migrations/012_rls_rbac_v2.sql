-- =====================================================
-- Migration 012: RLS v2 — RBAC-aligned policies
-- Safe to re-run (idempotent): drops _v2 policies before re-creating
-- يجب تشغيل هذا بعد: 006_rbac.sql و 011_permissions_expand.sql
-- =====================================================

-- ── دالة مساعدة: Super Admin فقط ─────────────────────────────────
create or replace function is_super_admin()
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from user_profiles up
    join roles r on r.id = up.role_id
    where up.id = auth.uid() and r.is_super_admin = true
  );
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 1. user_profiles
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists "profiles_select_own"           on user_profiles;
drop policy if exists "profiles_update_own"           on user_profiles;
drop policy if exists "profiles_insert_accountant"    on user_profiles;
drop policy if exists "profiles_delete_accountant"    on user_profiles;
drop policy if exists "profiles_select_v2"            on user_profiles;
drop policy if exists "profiles_update_own_v2"        on user_profiles;
drop policy if exists "profiles_insert_v2"            on user_profiles;
drop policy if exists "profiles_delete_v2"            on user_profiles;

create policy "profiles_select_v2" on user_profiles
  for select using (id = auth.uid() or is_super_admin());

create policy "profiles_update_own_v2" on user_profiles
  for update using (id = auth.uid());

create policy "profiles_insert_v2" on user_profiles
  for insert with check (is_super_admin());

create policy "profiles_delete_v2" on user_profiles
  for delete using (is_super_admin());

-- ═══════════════════════════════════════════════════════════════════
-- 2. products
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists "products_insert"    on products;
drop policy if exists "products_update"    on products;
drop policy if exists "products_delete"    on products;
drop policy if exists "products_insert_v2" on products;
drop policy if exists "products_update_v2" on products;
drop policy if exists "products_delete_v2" on products;

create policy "products_insert_v2" on products
  for insert with check (can_access_brand(brand_id) and has_module_permission('products', 'create'));

create policy "products_update_v2" on products
  for update using (can_access_brand(brand_id) and has_module_permission('products', 'update'));

create policy "products_delete_v2" on products
  for delete using (can_access_brand(brand_id) and has_module_permission('products', 'delete'));

-- ═══════════════════════════════════════════════════════════════════
-- 3. ingredients
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists "ingredients_insert"    on ingredients;
drop policy if exists "ingredients_update"    on ingredients;
drop policy if exists "ingredients_delete"    on ingredients;
drop policy if exists "ingredients_insert_v2" on ingredients;
drop policy if exists "ingredients_update_v2" on ingredients;
drop policy if exists "ingredients_delete_v2" on ingredients;

create policy "ingredients_insert_v2" on ingredients
  for insert with check (can_access_brand(brand_id) and has_module_permission('ingredients', 'create'));

create policy "ingredients_update_v2" on ingredients
  for update using (can_access_brand(brand_id) and has_module_permission('ingredients', 'update'));

create policy "ingredients_delete_v2" on ingredients
  for delete using (can_access_brand(brand_id) and has_module_permission('ingredients', 'delete'));

-- ═══════════════════════════════════════════════════════════════════
-- 4. recipes
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists "recipes_insert"    on recipes;
drop policy if exists "recipes_update"    on recipes;
drop policy if exists "recipes_delete"    on recipes;
drop policy if exists "recipes_insert_v2" on recipes;
drop policy if exists "recipes_update_v2" on recipes;
drop policy if exists "recipes_delete_v2" on recipes;

create policy "recipes_insert_v2" on recipes
  for insert with check (can_access_brand(brand_id) and has_module_permission('costing', 'create'));

create policy "recipes_update_v2" on recipes
  for update using (can_access_brand(brand_id) and has_module_permission('costing', 'update'));

create policy "recipes_delete_v2" on recipes
  for delete using (can_access_brand(brand_id) and has_module_permission('costing', 'delete'));

-- ═══════════════════════════════════════════════════════════════════
-- 5. recipe_ingredients
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists "recipe_ing_insert"    on recipe_ingredients;
drop policy if exists "recipe_ing_update"    on recipe_ingredients;
drop policy if exists "recipe_ing_delete"    on recipe_ingredients;
drop policy if exists "recipe_ing_insert_v2" on recipe_ingredients;
drop policy if exists "recipe_ing_update_v2" on recipe_ingredients;
drop policy if exists "recipe_ing_delete_v2" on recipe_ingredients;

create policy "recipe_ing_insert_v2" on recipe_ingredients
  for insert with check (
    exists (
      select 1 from recipes r
      where r.id = recipe_id
        and can_access_brand(r.brand_id)
        and has_module_permission('costing', 'create')
    )
  );

create policy "recipe_ing_update_v2" on recipe_ingredients
  for update using (
    exists (
      select 1 from recipes r
      where r.id = recipe_id
        and can_access_brand(r.brand_id)
        and has_module_permission('costing', 'update')
    )
  );

create policy "recipe_ing_delete_v2" on recipe_ingredients
  for delete using (
    exists (
      select 1 from recipes r
      where r.id = recipe_id
        and can_access_brand(r.brand_id)
        and has_module_permission('costing', 'delete')
    )
  );

-- ═══════════════════════════════════════════════════════════════════
-- 6. price_history
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists "price_history_select"    on price_history;
drop policy if exists "price_history_insert"    on price_history;
drop policy if exists "price_history_select_v2" on price_history;
drop policy if exists "price_history_insert_v2" on price_history;

create policy "price_history_select_v2" on price_history
  for select using (can_access_brand(brand_id) and has_module_permission('purchasing', 'view'));

create policy "price_history_insert_v2" on price_history
  for insert with check (can_access_brand(brand_id) and has_module_permission('purchasing', 'create'));

-- ═══════════════════════════════════════════════════════════════════
-- 7. audit_logs
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists "audit_select"    on audit_logs;
drop policy if exists "audit_select_v2" on audit_logs;

create policy "audit_select_v2" on audit_logs
  for select using (is_super_admin());

-- ═══════════════════════════════════════════════════════════════════
-- 8. purchases
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists purchases_insert    on purchases;
drop policy if exists purchases_update    on purchases;
drop policy if exists purchases_delete    on purchases;
drop policy if exists purchases_insert_v2 on purchases;
drop policy if exists purchases_update_v2 on purchases;
drop policy if exists purchases_delete_v2 on purchases;

create policy purchases_insert_v2 on purchases
  for insert with check (can_access_brand(brand_id) and has_module_permission('purchasing', 'create'));

create policy purchases_update_v2 on purchases
  for update using (can_access_brand(brand_id) and has_module_permission('purchasing', 'update'));

create policy purchases_delete_v2 on purchases
  for delete using (can_access_brand(brand_id) and has_module_permission('purchasing', 'delete'));

-- ═══════════════════════════════════════════════════════════════════
-- 9. daily_sales
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists sales_insert    on daily_sales;
drop policy if exists sales_update    on daily_sales;
drop policy if exists sales_delete    on daily_sales;
drop policy if exists sales_insert_v2 on daily_sales;
drop policy if exists sales_update_v2 on daily_sales;
drop policy if exists sales_delete_v2 on daily_sales;

create policy sales_insert_v2 on daily_sales
  for insert with check (can_access_brand(brand_id) and has_module_permission('sales', 'create'));

create policy sales_update_v2 on daily_sales
  for update using (can_access_brand(brand_id) and has_module_permission('sales', 'update'));

create policy sales_delete_v2 on daily_sales
  for delete using (can_access_brand(brand_id) and has_module_permission('sales', 'delete'));

-- ═══════════════════════════════════════════════════════════════════
-- 10. labor_costs + overhead_costs
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists labor_select    on labor_costs;
drop policy if exists labor_insert    on labor_costs;
drop policy if exists labor_update    on labor_costs;
drop policy if exists labor_delete    on labor_costs;
drop policy if exists labor_select_v2 on labor_costs;
drop policy if exists labor_insert_v2 on labor_costs;
drop policy if exists labor_update_v2 on labor_costs;
drop policy if exists labor_delete_v2 on labor_costs;

create policy labor_select_v2 on labor_costs
  for select using (can_access_brand(brand_id) and has_module_permission('costs', 'view'));

create policy labor_insert_v2 on labor_costs
  for insert with check (can_access_brand(brand_id) and has_module_permission('costs', 'create'));

create policy labor_update_v2 on labor_costs
  for update using (can_access_brand(brand_id) and has_module_permission('costs', 'update'));

create policy labor_delete_v2 on labor_costs
  for delete using (can_access_brand(brand_id) and has_module_permission('costs', 'delete'));

drop policy if exists overhead_select    on overhead_costs;
drop policy if exists overhead_insert    on overhead_costs;
drop policy if exists overhead_update    on overhead_costs;
drop policy if exists overhead_delete    on overhead_costs;
drop policy if exists overhead_select_v2 on overhead_costs;
drop policy if exists overhead_insert_v2 on overhead_costs;
drop policy if exists overhead_update_v2 on overhead_costs;
drop policy if exists overhead_delete_v2 on overhead_costs;

create policy overhead_select_v2 on overhead_costs
  for select using (can_access_brand(brand_id) and has_module_permission('costs', 'view'));

create policy overhead_insert_v2 on overhead_costs
  for insert with check (can_access_brand(brand_id) and has_module_permission('costs', 'create'));

create policy overhead_update_v2 on overhead_costs
  for update using (can_access_brand(brand_id) and has_module_permission('costs', 'update'));

create policy overhead_delete_v2 on overhead_costs
  for delete using (can_access_brand(brand_id) and has_module_permission('costs', 'delete'));

-- ═══════════════════════════════════════════════════════════════════
-- 11. stock_items + stock_movements
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists "stock_items_read"     on stock_items;
drop policy if exists "stock_items_write"    on stock_items;
drop policy if exists "stock_items_read_v2"  on stock_items;
drop policy if exists "stock_items_write_v2" on stock_items;

create policy "stock_items_read_v2" on stock_items
  for select using (can_access_brand(brand_id) and has_module_permission('inventory', 'view'));

create policy "stock_items_write_v2" on stock_items
  for all using (can_access_brand(brand_id) and has_module_permission('inventory', 'create'));

drop policy if exists "stock_movements_read"     on stock_movements;
drop policy if exists "stock_movements_write"    on stock_movements;
drop policy if exists "stock_movements_read_v2"  on stock_movements;
drop policy if exists "stock_movements_write_v2" on stock_movements;

create policy "stock_movements_read_v2" on stock_movements
  for select using (can_access_brand(brand_id) and has_module_permission('inventory', 'view'));

create policy "stock_movements_write_v2" on stock_movements
  for all using (can_access_brand(brand_id) and has_module_permission('inventory', 'create'));

-- ═══════════════════════════════════════════════════════════════════
-- 12. unit_conversions
-- ═══════════════════════════════════════════════════════════════════
do $$ begin
  drop policy if exists uc_write    on unit_conversions;
  drop policy if exists uc_write_v2 on unit_conversions;

  create policy uc_write_v2 on unit_conversions
    for all using (
      can_access_brand(brand_id) and has_module_permission('ingredients', 'update')
    );
exception when undefined_table then
  raise notice 'unit_conversions غير موجود بعد — شغّل 005b_unit_conversions.sql أولاً';
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- 13. roles / modules / role_permissions / rbac_audit_logs
-- ═══════════════════════════════════════════════════════════════════
drop policy if exists "roles_insert"    on roles;
drop policy if exists "roles_update"    on roles;
drop policy if exists "roles_delete"    on roles;
drop policy if exists "roles_insert_v2" on roles;
drop policy if exists "roles_update_v2" on roles;
drop policy if exists "roles_delete_v2" on roles;

create policy "roles_insert_v2" on roles
  for insert with check (is_super_admin());

create policy "roles_update_v2" on roles
  for update using (is_super_admin());

create policy "roles_delete_v2" on roles
  for delete using (is_super_admin() and is_system = false);

drop policy if exists "modules_write"    on modules;
drop policy if exists "modules_write_v2" on modules;

create policy "modules_write_v2" on modules
  for all using (is_super_admin()) with check (is_super_admin());

drop policy if exists "rp_write"    on role_permissions;
drop policy if exists "rp_write_v2" on role_permissions;

create policy "rp_write_v2" on role_permissions
  for all using (is_super_admin()) with check (is_super_admin());

drop policy if exists "rbac_audit_select"    on rbac_audit_logs;
drop policy if exists "rbac_audit_select_v2" on rbac_audit_logs;

create policy "rbac_audit_select_v2" on rbac_audit_logs
  for select using (is_super_admin());
