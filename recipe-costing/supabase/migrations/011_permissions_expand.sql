-- =====================================================
-- Migration 011: Expand role_permissions to 9 actions
-- Adds: can_approve, can_import, can_edit_price (if missing),
--       can_post, can_print, can_export (new)
-- =====================================================

alter table role_permissions
  add column if not exists can_approve    boolean not null default false,
  add column if not exists can_import     boolean not null default false,
  add column if not exists can_edit_price boolean not null default false,
  add column if not exists can_post       boolean not null default false,
  add column if not exists can_print      boolean not null default false,
  add column if not exists can_export     boolean not null default false;

-- ── Update helper function to handle all 9 actions ────────────────
create or replace function has_module_permission(module_code text, action text)
returns boolean
language sql security definer stable
as $$
  select
    exists (
      select 1 from user_profiles up
      join roles r on r.id = up.role_id
      where up.id = auth.uid() and r.is_super_admin = true
    )
    or
    exists (
      select 1 from user_profiles up
      join role_permissions rp on rp.role_id = up.role_id
      join modules m on m.id = rp.module_id
      where up.id = auth.uid()
        and m.code = module_code
        and m.is_active = true
        and case action
          when 'view'       then rp.can_view
          when 'create'     then rp.can_create
          when 'update'     then rp.can_update
          when 'delete'     then rp.can_delete
          when 'approve'    then rp.can_approve
          when 'import'     then rp.can_import
          when 'edit_price' then rp.can_edit_price
          when 'post'       then rp.can_post
          when 'print'      then rp.can_print
          when 'export'     then rp.can_export
          else false
        end
    );
$$;

-- ── Give Super Admin all new permissions ──────────────────────────
update role_permissions
set
  can_approve    = true,
  can_import     = true,
  can_edit_price = true,
  can_post       = true,
  can_print      = true,
  can_export     = true
where role_id = (select id from roles where is_super_admin = true);

-- ── Seed missing modules (batches, production, suppliers) ─────────
insert into modules (code, name, sort_order) values
  ('batches',     'الباتشات',   3),
  ('production',  'الإنتاج',    13),
  ('suppliers',   'الموردون',   14)
on conflict (code) do nothing;

-- Fix sort_order for existing modules pushed down by batches
update modules set sort_order = sort_order + 1
where code in ('products','ingredients','purchasing','sales','waste','costs','reports','comparison','inventory')
  and sort_order >= 3;

-- Give Super Admin permissions for the new modules too
insert into role_permissions (role_id, module_id, can_view, can_create, can_update, can_delete,
  can_approve, can_import, can_edit_price, can_post, can_print, can_export)
select
  r.id, m.id,
  true, true, true, true, true, true, true, true, true, true
from roles r
cross join modules m
where r.is_super_admin = true
  and m.code in ('batches', 'production', 'suppliers')
on conflict (role_id, module_id) do nothing;
