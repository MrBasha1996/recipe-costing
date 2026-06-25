-- =====================================================
-- Migration 002: Row Level Security Policies
-- =====================================================

-- Enable RLS on all tables
alter table brands             enable row level security;
alter table user_profiles      enable row level security;
alter table products           enable row level security;
alter table ingredients        enable row level security;
alter table recipes            enable row level security;
alter table recipe_ingredients enable row level security;
alter table price_history      enable row level security;
alter table audit_logs         enable row level security;

-- Helper: get current user's profile
create or replace function get_my_profile()
returns user_profiles
language sql security definer stable
as $$
  select * from user_profiles where id = auth.uid();
$$;

-- Helper: check if current user can access brand
create or replace function can_access_brand(check_brand_id text)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from user_profiles
    where id = auth.uid()
      and (brand_access = 'all' or brand_access = check_brand_id)
  );
$$;

-- Helper: get current user's role
create or replace function my_role()
returns text
language sql security definer stable
as $$
  select role from user_profiles where id = auth.uid();
$$;

-- ── brands ─────────────────────────────────────────
create policy "brands_select" on brands
  for select using (true);

-- ── user_profiles ───────────────────────────────────
create policy "profiles_select_own" on user_profiles
  for select using (id = auth.uid() or my_role() = 'accountant');

create policy "profiles_update_own" on user_profiles
  for update using (id = auth.uid());

create policy "profiles_insert_accountant" on user_profiles
  for insert with check (my_role() = 'accountant');

create policy "profiles_delete_accountant" on user_profiles
  for delete using (my_role() = 'accountant');

-- ── products ────────────────────────────────────────
create policy "products_select" on products
  for select using (can_access_brand(brand_id));

create policy "products_insert" on products
  for insert with check (
    can_access_brand(brand_id) and my_role() in ('accountant', 'ops')
  );

create policy "products_update" on products
  for update using (
    can_access_brand(brand_id) and my_role() in ('accountant', 'ops')
  );

create policy "products_delete" on products
  for delete using (
    can_access_brand(brand_id) and my_role() = 'accountant'
  );

-- ── ingredients ─────────────────────────────────────
create policy "ingredients_select" on ingredients
  for select using (can_access_brand(brand_id));

create policy "ingredients_insert" on ingredients
  for insert with check (
    can_access_brand(brand_id) and my_role() in ('accountant', 'ops')
  );

create policy "ingredients_update" on ingredients
  for update using (
    can_access_brand(brand_id) and my_role() = 'accountant'
  );

create policy "ingredients_delete" on ingredients
  for delete using (
    can_access_brand(brand_id) and my_role() = 'accountant'
  );

-- ── recipes ─────────────────────────────────────────
create policy "recipes_select" on recipes
  for select using (can_access_brand(brand_id));

create policy "recipes_insert" on recipes
  for insert with check (
    can_access_brand(brand_id) and my_role() in ('accountant', 'ops')
  );

create policy "recipes_update" on recipes
  for update using (
    can_access_brand(brand_id) and my_role() in ('accountant', 'ops')
  );

create policy "recipes_delete" on recipes
  for delete using (
    can_access_brand(brand_id) and my_role() = 'accountant'
  );

-- ── recipe_ingredients ──────────────────────────────
create policy "recipe_ing_select" on recipe_ingredients
  for select using (
    exists (
      select 1 from recipes r
      where r.id = recipe_id and can_access_brand(r.brand_id)
    )
  );

create policy "recipe_ing_insert" on recipe_ingredients
  for insert with check (
    exists (
      select 1 from recipes r
      where r.id = recipe_id
        and can_access_brand(r.brand_id)
        and my_role() in ('accountant', 'ops')
    )
  );

create policy "recipe_ing_update" on recipe_ingredients
  for update using (
    exists (
      select 1 from recipes r
      where r.id = recipe_id
        and can_access_brand(r.brand_id)
        and my_role() in ('accountant', 'ops')
    )
  );

create policy "recipe_ing_delete" on recipe_ingredients
  for delete using (
    exists (
      select 1 from recipes r
      where r.id = recipe_id
        and can_access_brand(r.brand_id)
        and my_role() in ('accountant', 'ops')
    )
  );

-- ── price_history ───────────────────────────────────
create policy "price_history_select" on price_history
  for select using (
    can_access_brand(brand_id) and my_role() in ('accountant', 'ops')
  );

create policy "price_history_insert" on price_history
  for insert with check (
    can_access_brand(brand_id) and my_role() = 'accountant'
  );

-- ── audit_logs ──────────────────────────────────────
create policy "audit_select" on audit_logs
  for select using (my_role() = 'accountant');

create policy "audit_insert" on audit_logs
  for insert with check (true);
