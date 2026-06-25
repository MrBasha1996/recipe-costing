-- Add missing 'conversions' module for unit conversion page
insert into modules (code, name, sort_order) values
  ('conversions', 'معاملات التحويل', 15)
on conflict (code) do nothing;

-- Grant Super Admin full permissions for the new module
insert into role_permissions (
  role_id, module_id,
  can_view, can_create, can_update, can_delete,
  can_approve, can_import, can_edit_price, can_post, can_print, can_export
)
select
  r.id,
  m.id,
  true, true, true, true,
  true, true, true, true, true, true
from roles r
cross join modules m
where r.is_super_admin = true
  and m.code = 'conversions'
on conflict (role_id, module_id) do nothing;
