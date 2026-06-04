-- =====================================================
-- Migration 006: Dynamic RBAC System
-- Adds dynamic roles/permissions alongside existing static role system.
-- Existing user_profiles.role field is NOT touched.
-- =====================================================

-- ── roles ─────────────────────────────────────────────────────────
create table if not exists roles (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  description    text,
  is_super_admin boolean not null default false,
  is_system      boolean not null default false,
  created_at     timestamptz default now()
);

-- ── modules (screens/pages) ────────────────────────────────────────
create table if not exists modules (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  sort_order int  default 0,
  is_active  boolean default true
);

-- ── role_permissions ──────────────────────────────────────────────
create table if not exists role_permissions (
  id         uuid primary key default gen_random_uuid(),
  role_id    uuid not null references roles(id) on delete cascade,
  module_id  uuid not null references modules(id) on delete cascade,
  can_view   boolean not null default false,
  can_create boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  unique (role_id, module_id)
);

-- ── rbac_audit_logs ───────────────────────────────────────────────
create table if not exists rbac_audit_logs (
  id           uuid primary key default gen_random_uuid(),
  performed_by uuid references user_profiles(id) on delete set null,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  entity_name  text,
  old_data     jsonb,
  new_data     jsonb,
  created_at   timestamptz default now()
);

-- ── Extend user_profiles (non-breaking) ──────────────────────────
alter table user_profiles
  add column if not exists role_id uuid references roles(id) on delete set null;

-- ── Indexes ───────────────────────────────────────────────────────
create index if not exists idx_role_permissions_role   on role_permissions(role_id);
create index if not exists idx_role_permissions_module on role_permissions(module_id);
create index if not exists idx_rbac_audit_performer    on rbac_audit_logs(performed_by);
create index if not exists idx_rbac_audit_created      on rbac_audit_logs(created_at desc);
create index if not exists idx_user_profiles_role_id   on user_profiles(role_id);

-- ── Helper function ───────────────────────────────────────────────
create or replace function has_module_permission(module_code text, action text)
returns boolean
language sql security definer stable
as $$
  select
    -- Super Admin always has all permissions
    exists (
      select 1 from user_profiles up
      join roles r on r.id = up.role_id
      where up.id = auth.uid() and r.is_super_admin = true
    )
    or
    -- Check specific role_permission row
    exists (
      select 1 from user_profiles up
      join role_permissions rp on rp.role_id = up.role_id
      join modules m on m.id = rp.module_id
      where up.id = auth.uid()
        and m.code = module_code
        and m.is_active = true
        and case action
          when 'view'   then rp.can_view
          when 'create' then rp.can_create
          when 'update' then rp.can_update
          when 'delete' then rp.can_delete
          else false
        end
    );
$$;

-- ── RLS ───────────────────────────────────────────────────────────

alter table roles             enable row level security;
alter table modules           enable row level security;
alter table role_permissions  enable row level security;
alter table rbac_audit_logs   enable row level security;

-- roles: any authenticated user can read, only accountant can write
create policy "roles_select"
  on roles for select
  using (auth.uid() is not null);

create policy "roles_insert"
  on roles for insert
  with check (my_role() = 'accountant');

create policy "roles_update"
  on roles for update
  using (my_role() = 'accountant');

create policy "roles_delete"
  on roles for delete
  using (my_role() = 'accountant' and is_system = false);

-- modules: read-only for everyone, accountant can manage
create policy "modules_select"
  on modules for select
  using (auth.uid() is not null);

create policy "modules_write"
  on modules for all
  using (my_role() = 'accountant')
  with check (my_role() = 'accountant');

-- role_permissions: any authenticated user can read, accountant can write
create policy "rp_select"
  on role_permissions for select
  using (auth.uid() is not null);

create policy "rp_write"
  on role_permissions for all
  using (my_role() = 'accountant')
  with check (my_role() = 'accountant');

-- rbac_audit_logs: anyone can insert, accountant can read
create policy "rbac_audit_insert"
  on rbac_audit_logs for insert
  with check (auth.uid() is not null);

create policy "rbac_audit_select"
  on rbac_audit_logs for select
  using (my_role() = 'accountant');

-- ── Seed: modules ─────────────────────────────────────────────────
insert into modules (code, name, sort_order) values
  ('dashboard',   'لوحة التحكم',   1),
  ('costing',     'الوصفات',        2),
  ('products',    'المنتجات',       3),
  ('ingredients', 'المواد الخام',   4),
  ('purchasing',  'المشتريات',      5),
  ('sales',       'المبيعات',       6),
  ('waste',       'الهدر والفاقد',  7),
  ('costs',       'التكاليف',       8),
  ('reports',     'التقارير',       9),
  ('comparison',  'مقارنة',         10),
  ('inventory',   'المخزون',        11),
  ('users',       'المستخدمون',     12),
  ('roles',       'المجموعات',      13),
  ('settings',    'الإعدادات',      14)
on conflict (code) do nothing;

-- ── Seed: Super Admin role ────────────────────────────────────────
insert into roles (name, description, is_super_admin, is_system)
values ('Super Admin', 'صلاحيات كاملة على جميع الشاشات', true, true)
on conflict (name) do nothing;

-- ── Seed: Super Admin gets all permissions for all modules ────────
insert into role_permissions (role_id, module_id, can_view, can_create, can_update, can_delete)
select
  r.id,
  m.id,
  true, true, true, true
from roles r
cross join modules m
where r.name = 'Super Admin'
on conflict (role_id, module_id) do nothing;
