-- =====================================================
-- Migration 001: Core Schema
-- =====================================================

-- Brands
create table if not exists brands (
  id   text primary key,
  name text not null,
  name_ar text not null
);

-- User profiles (extends Supabase auth.users)
create table if not exists user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null,
  name_ar      text not null,
  role         text not null check (role in ('accountant', 'ops', 'kitchen')),
  brand_access text not null check (brand_access in ('ti', 'bb', 'all')),
  created_at   timestamptz default now()
);

-- Products
create table if not exists products (
  sku        text not null,
  brand_id   text not null references brands(id),
  name       text not null,
  category   text not null check (category in ('Meal', 'Batch')),
  price      numeric(10,2) default 0,
  app_price  numeric(10,2),
  app_sku    text,
  unit       text,
  is_semi    boolean default false,
  is_base    boolean default true,
  created_at timestamptz default now(),
  primary key (sku, brand_id)
);

-- Ingredients
create table if not exists ingredients (
  sku        text not null,
  brand_id   text not null references brands(id),
  name       text not null,
  category   text not null,
  unit       text not null,
  cost       numeric(10,6) default 0,
  is_base    boolean default true,
  created_at timestamptz default now(),
  primary key (sku, brand_id)
);

-- Recipes
create table if not exists recipes (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null,
  brand_id        text not null references brands(id),
  product_name    text not null,
  is_semi         boolean default false,
  sell_price      numeric(10,2) default 0,
  app_price       numeric(10,2),
  yield_portions  int default 1,
  total_cost      numeric(10,4) default 0,
  food_cost_pct   numeric(5,1) default 0,
  margin          numeric(10,2) default 0,
  margin_app      numeric(10,2),
  saved_by        uuid references user_profiles(id),
  saved_at        timestamptz default now(),
  unique (sku, brand_id)
);

-- Recipe ingredients
create table if not exists recipe_ingredients (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references recipes(id) on delete cascade,
  ing_sku     text not null,
  ing_name    text not null,
  qty         numeric(10,3) default 0,
  unit        text not null,
  unit_cost   numeric(10,6) default 0,
  yield_pct   numeric(5,1) default 100,
  is_semi     boolean default false,
  sort_order  int default 0
);

-- Price history
create table if not exists price_history (
  id          uuid primary key default gen_random_uuid(),
  brand_id    text not null references brands(id),
  sku         text not null,
  item_name   text not null,
  item_type   text not null check (item_type in ('ingredient', 'product')),
  old_price   numeric(10,6) not null,
  new_price   numeric(10,6) not null,
  changed_by  uuid references user_profiles(id),
  changed_at  timestamptz default now()
);

-- Audit logs
create table if not exists audit_logs (
  id            uuid primary key default gen_random_uuid(),
  brand_id      text,
  action        text not null,
  entity_type   text not null,
  entity_sku    text,
  entity_name   text,
  performed_by  uuid references user_profiles(id),
  metadata      jsonb,
  created_at    timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_products_brand        on products(brand_id);
create index if not exists idx_ingredients_brand     on ingredients(brand_id);
create index if not exists idx_recipes_brand         on recipes(brand_id);
create index if not exists idx_recipe_ing_recipe     on recipe_ingredients(recipe_id);
create index if not exists idx_price_history_brand   on price_history(brand_id, sku);
create index if not exists idx_audit_logs_brand      on audit_logs(brand_id);
create index if not exists idx_audit_logs_user       on audit_logs(performed_by);
