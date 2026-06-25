-- =====================================================
-- Migration 020: Per-Report Permissions
-- Adds 17 individual report modules so each report tab
-- can be granted/revoked independently per role.
-- The parent 'reports' module stays as the page gate.
-- =====================================================

-- ── إضافة 17 موديول تقرير ─────────────────────────
INSERT INTO modules (code, name, sort_order) VALUES
  ('report_pl',          'الأرباح والخسائر',        20),
  ('report_fc',          'تحليل Food Cost',          21),
  ('report_breakeven',   'نقطة التعادل',             22),
  ('report_purchases',   'تحليل المشتريات',          23),
  ('report_sales',       'تحليل المبيعات',           24),
  ('report_menu',        'هندسة القائمة',            25),
  ('report_variance',    'مقارنة FC%',               26),
  ('report_primecost',   'التكلفة الإجمالية',        27),
  ('report_pricing',     'التسعير العكسي',           28),
  ('report_trends',      'الاتجاهات',                29),
  ('report_branches',    'مقارنة الفروع',            30),
  ('report_prices',      'تاريخ الأسعار',            31),
  ('report_actual_fc',   'FC فعلي vs نظري',          32),
  ('report_dine',        'داخل vs توصيل',            33),
  ('report_discounts',   'الخصومات والمرتجعات',      34),
  ('report_consumption', 'استهلاك المواد',           35),
  ('report_compare_pl',  'مقارنة الفترات',           36)
ON CONFLICT (code) DO NOTHING;

-- ── Backward compat: كل دور عنده reports.can_view يحصل على الـ17 ──
-- يستخدم ON CONFLICT DO NOTHING لحماية أي تخصيص لاحق
-- يمنح can_view فقط (التقارير للقراءة)
INSERT INTO role_permissions (role_id, module_id, can_view, can_create, can_update, can_delete)
SELECT
  existing_rp.role_id,
  new_m.id,
  true,
  false,
  false,
  false
FROM role_permissions existing_rp
JOIN modules reports_m ON reports_m.code = 'reports'
  AND existing_rp.module_id = reports_m.id
  AND existing_rp.can_view = true
JOIN roles r ON r.id = existing_rp.role_id
  AND r.is_super_admin = false
CROSS JOIN modules new_m
WHERE new_m.code LIKE 'report_%'
ON CONFLICT (role_id, module_id) DO NOTHING;
