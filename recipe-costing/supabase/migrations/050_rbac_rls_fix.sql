-- =====================================================
-- Migration 050: تشديد RLS على RBAC tables + توسيع has_module_permission
-- يجب تشغيله بعد: 006_rbac.sql و 011_permissions_expand.sql و 012_rls_rbac_v2.sql
-- =====================================================

-- ── 1. تقييد roles_select: كل مستخدم يرى دوره فقط ──────────────────
-- القديم: USING (auth.uid() IS NOT NULL) — أي مسجّل يرى كل الأدوار
-- الجديد: super admin يرى الكل، بقية المستخدمين يرون دورهم فقط
drop policy if exists "roles_select" on roles;

create policy "roles_select" on roles
  for select
  using (
    is_super_admin()
    or id in (
      select role_id from user_profiles where id = auth.uid()
    )
  );

-- ── 2. تقييد modules_select: كل مستخدم يرى الوحدات المسموح له بها فقط ─
drop policy if exists "modules_select" on modules;

create policy "modules_select" on modules
  for select
  using (
    is_super_admin()
    or id in (
      select rp.module_id
      from role_permissions rp
      join user_profiles up on up.role_id = rp.role_id
      where up.id = auth.uid()
    )
  );

-- ── 3. تقييد rp_select: كل مستخدم يرى صلاحيات دوره فقط ─────────────
drop policy if exists "rp_select" on role_permissions;

create policy "rp_select" on role_permissions
  for select
  using (
    is_super_admin()
    or role_id in (
      select role_id from user_profiles where id = auth.uid()
    )
  );

-- ── 4. has_module_permission: تأكيد شمول approve/import/export ───────
-- هذه الأفعال أُضيفت في migration 011 — نُعيد CREATE OR REPLACE للتأكيد
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
