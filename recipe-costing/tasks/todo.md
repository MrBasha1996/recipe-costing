# خطة: 5 مهام لإكمال نظام recipe-costing

---

## مراجعة — 2026-06-11: نظام إدارة الإنتاج الكامل ✅

### ما تغيّر

| الملف | التغيير |
|---|---|
| `supabase/migrations/018_production_sessions.sql` | جديد: جدول `production_sessions` + عمود `production_session_id` على `stock_movements` |
| `lib/produceBatch.ts` | ينشئ سجل جلسة أولاً ويربط جميع حركات المخزون به + يُرجع `session_id` |
| `app/api/production/sessions/route.ts` | GET: قائمة الجلسات مع أسماء المستخدمين + إجمالي العدد |
| `app/api/production/sessions/[id]/route.ts` | PATCH: تعديل الملاحظة (draft فقط) · DELETE: حذف + عكس المخزون (draft فقط) |
| `app/api/production/sessions/[id]/approve/route.ts` | POST: اعتماد الجلسة — بعد الاعتماد لا تعديل ولا حذف |
| `app/(dashboard)/[brand]/production/ProductionClient.tsx` | تبويبان: "إنتاج جديد" (النموذج كما هو) + "السجل والإدارة" |

### كيف يعمل

**تبويب "إنتاج جديد"** — النموذج الموجود بدون تغيير في الوظيفة، لكنه الآن ينشئ سجل جلسة في قاعدة البيانات.

**تبويب "السجل والإدارة":**
- **بطاقات إحصائية:** إجمالي الجلسات · بانتظار الاعتماد · إجمالي الحصص
- **جدول الجلسات:** الباتش، الكمية، التكلفة التقديرية، المنفذ، الملاحظة، الحالة، التاريخ
- **تحذيرات المخزون:** تظهر تحت كل جلسة تحتوي على تحذيرات
- **إجراءات (draft فقط):** اعتماد · تعديل الملاحظة (inline) · حذف مع عكس المخزون
- **بعد الاعتماد:** لا يمكن التعديل أو الحذف — الأزرار تختفي

### قاعدة البيانات — يجب تشغيل في Supabase Dashboard → SQL Editor
```
supabase/migrations/018_production_sessions.sql
```

### TypeScript
نظيف تماماً (0 أخطاء)

---

## المهام

### A. إنشاء migration 013 (expiry + suppliers) كملف رسمي
- [ ] نسخ `tasks/migration_expiry_suppliers.sql` إلى `supabase/migrations/013_expiry_suppliers.sql`

### B. إنشاء migration 014 (labor department + monthly_budgets)
- [ ] إنشاء `supabase/migrations/014_labor_budget.sql` يحتوي:
  - `ALTER TABLE labor_costs ADD COLUMN IF NOT EXISTS department text DEFAULT 'other'`
  - `CREATE TABLE monthly_budgets` (brand_id, month, revenue_target, fc_pct_target, labor_pct_target, overhead_pct_target)
  - RLS على monthly_budgets

### C. تتبع تكاليف العمالة بالتفصيل (Department)
- [ ] إضافة `LaborDept` type وقائمة الأقسام في `costs/page.tsx`
- [ ] إضافة dropdown اختيار القسم في نموذج إضافة بند العمالة
- [ ] تعديل جدول العمالة: عمود القسم + تجميع بصري حسب القسم

### D. Budget vs Actual
- [ ] إضافة tab جديد "الميزانية" في `costs/page.tsx`
- [ ] نموذج إدخال: إيراد مستهدف + FC%‌ مستهدف + عمالة% مستهدفة + ثابتة% مستهدفة
- [ ] عرض مقارنة الفعلي vs الميزانية (يجلب المبيعات + التكاليف الفعلية للشهر المختار)

### E. PAR Level alerts (تنبيهات المخزون)
- [ ] إضافة banner في تبويب "المخزون" في `InventoryClient.tsx` يظهر عدد الأصناف تحت مستوى PAR
- [ ] تطوير تبويب "طلبات الشراء" (orders) ليعرض جدول: الصنف + الكمية الحالية + مستوى PAR + الفجوة + التكلفة التقديرية

### F. تحويل صفحات Client → Server Components
- [ ] `costs/page.tsx` → Server + `CostsClient.tsx` + `loading.tsx`
- [ ] `reports/page.tsx` → Server + `ReportsClient.tsx` + `loading.tsx`
- [ ] `settings/page.tsx` → Server + `SettingsClient.tsx` + `loading.tsx`
- [ ] `costing/page.tsx` — تخطي (لا يجلب بيانات من DB، يستخدم Zustand فقط)

---

## ترتيب التنفيذ
1. B (migrations) أولاً — الأساس
2. C + D معاً (تعديل costs page)
3. E (inventory)
4. F (server components)
5. A (نسخ migration 013)

---

## ملاحظات Migrations للمستخدم
بعد الانتهاء يجب تشغيل هذه في Supabase Dashboard → SQL Editor **بالترتيب**:
1. `supabase/migrations/012_rls_rbac_v2.sql`
2. `supabase/migrations/013_expiry_suppliers.sql`
3. `supabase/migrations/014_labor_budget.sql`

---

## مراجعة — 2026-06-09 (استيراد + تحويل وحدات) ✅

### ما تغيّر

| الملف | التغيير |
|---|---|
| `types/index.ts` | إضافة `UnitConversion` interface |
| `app/(dashboard)/ingredients/page.tsx` | جلب `unit_conversions` بالتوازي مع `ingredients` |
| `app/(dashboard)/ingredients/IngredientsClient.tsx` | زر **قالب استيراد** جديد + تمرير `convMap` للجدول |
| `components/ingredients/IngredientTable.tsx` | عمودان: **وحدة الوصفة** + **وحدة الشراء** (مع المعامل) |
| `components/ingredients/IngredientForm.tsx` | قسم "تحويل وحدة الشراء": يحمّل ويحفظ ويحذف من `unit_conversions` |

### كيف يعمل
- **قالب الاستيراد**: زر "⬇ قالب استيراد" يحمّل ملف Excel بأعمدة (SKU، الاسم، الفئة، الوحدة، التكلفة) — جاهز للتعبئة وإعادة الرفع بزر "⬆ استيراد بيانات"
- **جدول المواد الخام**: يعرض الآن عمودين — وحدة الوصفة (مثل جرام) + وحدة الشراء (مثل علبة ×1000)
- **نموذج التعديل**: قسم "تحويل وحدة الشراء" في أسفل النموذج — احذف وحدة الشراء لإزالة التحويل تلقائياً
- **TypeScript**: نظيف (0 أخطاء)

---

## مراجعة — 2026-06-09 ✅

### ما تغيّر

| الملف / المجال | التغيير |
|---|---|
| `supabase/migrations/013_expiry_suppliers.sql` | نسخة رسمية من tasks/migration_expiry_suppliers.sql |
| `supabase/migrations/014_labor_budget.sql` | جديد: عمود department في labor_costs + جدول monthly_budgets + RLS |
| `types/index.ts` | إضافة `LaborDept` + تحديث `LaborCost` (department) + `MonthlyBudget` |
| `app/(dashboard)/costs/CostsClient.tsx` | جديد: accepts initial props + department في العمالة + tab الميزانية |
| `app/(dashboard)/costs/page.tsx` | حُوِّل إلى Server Component |
| `app/(dashboard)/costs/loading.tsx` | جديد: skeleton loading |
| `app/(dashboard)/inventory/InventoryClient.tsx` | PAR banner أحمر + badge عدد على تبويب "طلبات الشراء" |
| `app/(dashboard)/settings/SettingsClient.tsx` | جديد: accepts initial props بدون useEffect |
| `app/(dashboard)/settings/page.tsx` | حُوِّل إلى Server Component |
| `app/(dashboard)/settings/loading.tsx` | جديد |
| `app/(dashboard)/reports/ReportsClient.tsx` | جديد: accepts initialBranches + initialFcLow/High |
| `app/(dashboard)/reports/page.tsx` | حُوِّل إلى Server Component |
| `app/(dashboard)/reports/loading.tsx` | جديد |
| `app/api/*/route.ts` (6 ملفات) | إصلاح Zod v4: `.errors` → `.issues` |

### Migrations يجب تشغيلها في Supabase Dashboard → SQL Editor
**بالترتيب:**
1. `supabase/migrations/012_rls_rbac_v2.sql`
2. `supabase/migrations/013_expiry_suppliers.sql`
3. `supabase/migrations/014_labor_budget.sql`

### ملاحظات
- **تبويب الميزانية**: يظهر الفعلي vs الهدف للإيراد + العمالة% + الثابتة%. FC% يستلزم تقرير P&L.
- **PAR alerts**: يستخدم الحقل الموجود `min_qty` — لا يحتاج تغيير DB.
- **costing/page.tsx**: لم يُحوَّل (لا يجلب بيانات من DB — Zustand فقط).
- **TypeScript**: نظيف تماماً (0 أخطاء).
