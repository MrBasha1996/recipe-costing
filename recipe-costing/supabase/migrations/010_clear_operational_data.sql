-- =====================================================
-- Migration 010: Clear all operational data
-- حذف جميع البيانات التشغيلية مع الإبقاء على:
-- brands, user_profiles, roles, modules, role_permissions, unit_conversions
-- =====================================================

-- الحذف بالترتيب الصحيح (الجداول التابعة أولاً)

-- وصفات المواد
truncate table recipe_ingredients restart identity cascade;
truncate table recipes restart identity cascade;

-- المنتجات والباتشات والمواد الخام
truncate table batches restart identity cascade;
truncate table products restart identity cascade;
truncate table ingredients restart identity cascade;

-- سجل الأسعار
truncate table price_history restart identity cascade;

-- المشتريات والمبيعات
truncate table purchases restart identity cascade;
truncate table daily_sales restart identity cascade;

-- التكاليف
truncate table labor_costs restart identity cascade;
truncate table overhead_costs restart identity cascade;

-- الهدر والفاقد
truncate table waste_log restart identity cascade;

-- المخزون
truncate table stock_movements restart identity cascade;
truncate table stock_items restart identity cascade;

-- الموردون
truncate table suppliers restart identity cascade;

-- الفروع
truncate table branches restart identity cascade;

-- سجلات RBAC والتدقيق
truncate table rbac_audit_logs restart identity cascade;
truncate table audit_logs restart identity cascade;

-- =====================================================
-- ما يبقى (لا يُمس):
-- brands, user_profiles, roles, modules, role_permissions, unit_conversions
-- =====================================================
