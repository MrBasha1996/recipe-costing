# خطة: 5 مهام لإكمال نظام recipe-costing

---

## مراجعة — 2026-06-11: إصلاحات موديول المخزون ✅

### ما تغيّر

| الملف | الإصلاح |
|---|---|
| `app/(dashboard)/[brand]/inventory/page.tsx` | الباتشات تُجلب من `batches` بدل `products` (migration 009 حذفها من products) |
| `InventoryClient.tsx` / `handleStartSession` | تكلفة الباتش من `recipes.total_cost / yield_portions` بدل `products.price` (كان سعر بيع لا تكلفة) |
| `InventoryClient.tsx` / `AgingTab` | نفس إصلاح التكلفة — قيمة المخزون الراكد صحيحة الآن |
| `InventoryClient.tsx` / `handleFinalize` | `min_qty: 0` → `minQtyMap.get(ing_sku) ?? 0` من `items` prop — مستويات PAR لا تُمسح بعد الجرد |
| `InventoryClient.tsx` / `handleFinalize` | `performed_by: null` → `user?.id ?? null` — حركات الجرد مربوطة بالمستخدم |
| `InventoryClient.tsx` / `AvailabilityTab` | إضافة `.eq('is_approved', true)` للوصفات — لا يظهر طبق وصفته غير معتمدة |

### ما لم يُصلح بعد (مرحلة 2 — مؤجلة)
- **Race Condition** في `AddMovementTab`: الكمية تُحسب في المتصفح ثم تُكتب — خطر فقدان حركة عند تزامن مستخدمين. الحل: RPC ذرّي في الخادم.
- **عدم ذرّية الإنهاء**: `handleFinalize` سلسلة awaits مستقلة. فشل في المنتصف يترك المخزون نصف محدَّث. الحل: Route Handler مع Transaction.
- **النظري يصبح قديماً**: `theoretical_qty` يُثبَّت عند بدء الجلسة — البيع المستمر أثناء الجرد يجعل الفروق غير دقيقة.

### لا migrations جديدة — التغييرات في ملفين فقط

---

## مراجعة — 2026-06-11: دعم الكومبو في explode ✅

### ما تغيّر

| الملف | التغيير |
|---|---|
| `app/api/sales/explode/route.ts` | مرحلة 4b: توسيع الكومبو — يجلب `combo_meals`، يحصل على وصفات العناصر، يجمع الخصومات في `deductMap`. التكلفة في مرحلة 8: `combo.total_cost * qty_sold` |
| `app/api/sales/explode-check/route.ts` | نفس المنطق للقراءة — `resolvedComboSkus` لا تظهر في `missing_recipes`؛ احتياجاتها تدخل `rawNeeds`/`batchNeeds` |

### كيف يعمل

**مسار الكومبو في explode:**
1. بعد معالجة المنتجات العادية، يُحدَّد كل SKU لم يُجد له وصفة في `recipes`
2. يُبحث عنه في `combo_meals` (نشط فقط)
3. لكل عنصر في الكومبو (`combo_meal_items`) → تُجلب وصفته (معتمدة + نشطة)
4. مكونات وصفة العنصر × كميته في الكومبو × الكمية المباعة → تُضاف للـ `deductMap`
5. التكلفة: `combo_meals.total_cost × qty_sold` (لكل سجل منفرداً)

**ملاحظة:** إذا لم يكن لأي عنصر في الكومبو وصفة معتمدة نشطة → الكومبو يُعدّ `skipped` (لا خصم، لا تكلفة).

### لا تغيير في schema — لا migration جديد مطلوب

---

## مراجعة — 2026-06-11: تكلفة المبيعات + شرط الوصفة المعتمدة ✅

### ما تغيّر

| الملف | التغيير |
|---|---|
| `supabase/migrations/019_sale_cost.sql` | جديد: `ALTER TABLE daily_sales ADD COLUMN cost numeric(12,4)` |
| `types/index.ts` | إضافة `cost: number \| null` إلى `DailySale` |
| `lib/produceBatch.ts` | إضافة `.eq('is_approved', true)` + تحويل `.single()` → `.maybeSingle()` |
| `app/api/batches/produce/route.ts` | نفس التعديل في مسار dry_run |
| `app/api/sales/explode/route.ts` | إضافة `is_approved`؛ جلب `id` و`total_cost`؛ حساب وحفظ cost لكل سجل |
| `app/api/sales/explode-check/route.ts` | إضافة `is_approved` في موضعين (وصفات المنتجات + وصفات الباتشات) |
| `components/costing/CostingSidebar.tsx` | إضافة `is_approved` في موضعي التصدير (وصفات + مكوّنات) |

### كيف يعمل

**تكلفة سجل المبيعات:**
- عند تنفيذ explode، يُحسب `cost = (recipe.total_cost / recipe.yield_portions) * qty_sold` لكل سجل منفرداً عبر `id`.
- إذا لا توجد وصفة معتمدة نشطة للمنتج: يبقى `cost = NULL`.
- التحديث لكل سجل على حدة يمنع تضاعف التكلفة عند تعدّد السجلات لنفس الـ sku في الدفعة (مثلاً عدة فروع).
- الدقة: `numeric(12,4)` لاستيعاب التكاليف الكسرية بدون خطأ تقريب.

**شرط الوصفة المعتمدة:**
- جميع العمليات التي تستهلك وصفة (إنتاج، تفجير مخزون، تصدير) تشترط الآن `is_active = true AND is_approved = true`.
- الاستثناء المقصود: `RecipeEditor.tsx:187` (جلب تكاليف semi للعرض في المحرر) — لا يشترط is_approved لأن المصمم يحتاج رؤية تكلفة الـ semi حتى قبل الاعتماد.
- تحويل `.single()` → `.maybeSingle()` ضروري لأن الفهرس الفريد يضمن وصفة نشطة واحدة لكن لا يضمن أنها معتمدة.

### قاعدة البيانات — يجب تشغيل في Supabase Dashboard → SQL Editor
```
supabase/migrations/019_sale_cost.sql
```

### TypeScript
نظيف تماماً (0 أخطاء متوقعة)

---

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

---

## خطة معدّلة (مراجعة Opus 4.8) — 2026-06-11: صلاحيات التقارير + البراندات + الفروع + صلاحيات الفروع

> راجعها Opus 4.8 بعمق وأضافت إدارة الفروع وصلاحيات الفروع على مستوى المستخدم

---

### 4 Features

| # | الوصف | الاعتمادية |
|---|---|---|
| A | صلاحيات التقارير (17 موديول) | مستقل |
| B | البراندات الديناميكية CRUD | مستقل |
| C | إدارة الفروع (تفعيل جدول branches) | مستقل |
| D | صلاحيات الفرع للمستخدم | C أولاً |

---

### Feature A — صلاحيات التقارير

**Migration 020 — report_modules.sql:**
- 17 موديول `report_*` + backward compat grant (INSERT ON CONFLICT DO NOTHING)
- `reports` الأب يبقى بوابة دخول الصفحة في middleware

| كود | التقرير |
|---|---|
| `report_pl` | الأرباح والخسائر |
| `report_fc` | تحليل Food Cost |
| `report_breakeven` | نقطة التعادل |
| `report_purchases` | تحليل المشتريات |
| `report_sales` | تحليل المبيعات |
| `report_menu` | هندسة القائمة |
| `report_variance` | مقارنة FC% |
| `report_primecost` | التكلفة الإجمالية |
| `report_pricing` | التسعير العكسي |
| `report_trends` | الاتجاهات |
| `report_branches` | مقارنة الفروع |
| `report_prices` | تاريخ الأسعار |
| `report_actual_fc` | FC فعلي vs نظري |
| `report_dine` | داخل vs توصيل |
| `report_discounts` | الخصومات والمرتجعات |
| `report_consumption` | استهلاك المواد |
| `report_compare_pl` | مقارنة الفترات |

**الملفات:**
- [ ] `supabase/migrations/020_report_modules.sql`
- [ ] `ReportsClient.tsx` — فلترة التبويبات بـ `hasPermission('report_XX','view')` + auto-switch
- [ ] `PermissionsMatrix.tsx` — group header "التقارير" قبل موديولات `report_*`

---

### Feature B — البراندات الديناميكية

**Migration 021 — brands_management.sql:**
- حذف `brand_access CHECK ('ti','bb','all')` + استبدال بـ FK ذكي (`'all' OR EXISTS brands`)
- موديول `brands` للـ RBAC

**Hardcoding في 3 مواضع (كلها تُزال):**
1. `middleware.ts:4` — `VALID_BRANDS = ['ti','bb']`
2. `lib/server-brand.ts:3` — قائمة ثابتة
3. `components/BrandSelectorOverlay.tsx:18,39` — أسماء وألوان

**الملفات:**
- [ ] `supabase/migrations/021_brands_management.sql`
- [ ] `types/index.ts` — `BrandId = string` (بعد إزالة hardcoding)
- [ ] `middleware.ts` — VALID_BRANDS ديناميكي من DB
- [ ] `lib/server-brand.ts` — ديناميكي
- [ ] `components/BrandSelectorOverlay.tsx` — جلب من DB
- [ ] `app/(dashboard)/[brand]/brands/page.tsx` + `BrandsClient.tsx` — CRUD كامل
- [ ] `DashboardShell.tsx` — إضافة "البراندات" للناف

---

### Feature C — إدارة الفروع

**الوضع الحالي:** جدول `branches` موجود في migration 004 لكن غير مستخدم. التقارير تقرأ `DISTINCT branch_name FROM daily_sales`.

**Migration 022 — branches_activation.sql:**
- موديول `branches` للـ RBAC
- حذف RLS القديم على `branches` (يستخدم `my_role()='accountant'`)
- إعادة بناء RLS بـ `has_module_permission('branches', ...)`
- مزامنة الفروع التاريخية: `INSERT INTO branches FROM SELECT DISTINCT branch_name FROM daily_sales`
- إضافة `UNIQUE(brand_id, name)` على `branches` إن لم يكن موجوداً

**الملفات:**
- [ ] `supabase/migrations/022_branches_activation.sql`
- [ ] `app/(dashboard)/[brand]/branches/page.tsx` + `BranchesClient.tsx` — CRUD
- [ ] `app/(dashboard)/[brand]/reports/page.tsx` — جلب الفروع من `branches` table بدل DISTINCT
- [ ] `DashboardShell.tsx` — إضافة "الفروع" للناف

---

### Feature D — صلاحيات الفرع للمستخدم

**القاعدة:** لا صفوف في `user_branch_access` = كل الفروع مسموحة.
**العزل:** RLS + UI فقط (الفرع غير موجود في URL).

**Migration 023 — user_branch_access.sql:**
- جدول `user_branch_access (user_id, branch_id)` + UNIQUE(user_id, branch_id)
- دالة `can_access_branch(brand_id, branch_name)` — تفحص: super admin OR لا قيود OR وصول صريح
- RLS على `daily_sales` — إضافة فحص `can_access_branch`

**الملفات:**
- [ ] `supabase/migrations/023_user_branch_access.sql`
- [ ] `UsersClient` — قسم "الفروع المتاحة" في نموذج تعديل المستخدم
- [ ] `ReportsClient.tsx` — فلترة قائمة الفروع بحسب `user_branch_access`
- [ ] `types/index.ts` — إضافة `UserBranchAccess` interface

---

### Migrations يجب تشغيلها بعد الانتهاء (Supabase Dashboard → SQL Editor)
بالترتيب:
1. `supabase/migrations/020_report_modules.sql`
2. `supabase/migrations/021_brands_management.sql`
3. `supabase/migrations/022_branches_activation.sql`
4. `supabase/migrations/023_user_branch_access.sql`

---

## مراجعة — 2026-06-11: صلاحيات التقارير + البراندات + الفروع + صلاحيات الفروع ✅

### ما تغيّر

| الملف | التغيير |
|---|---|
| `supabase/migrations/020_report_modules.sql` | 17 موديول `report_*` + backward compat للأدوار الموجودة |
| `supabase/migrations/021_brands_management.sql` | حذف constraint ثابتة + FK ذكي + موديول `brands` |
| `supabase/migrations/022_branches_activation.sql` | تفعيل `branches` table + RBAC policies + مزامنة تاريخية |
| `supabase/migrations/023_user_branch_access.sql` | جدول `user_branch_access` + دالتا `can_access_branch` + `get_accessible_branches` |
| `ReportsClient.tsx` | فلترة 17 تبويب بحسب `hasPermission(report_XX, 'view')` + auto-switch |
| `PermissionsMatrix.tsx` | group header قبل موديولات `report_*` مع prefix `↳` |
| `types/index.ts` | `BrandId=string`، `BrandAccess=string`، `UserBranchAccess` interface |
| `middleware.ts` | VALID_BRANDS ديناميكي من DB |
| `lib/server-brand.ts` | `getValidBrands()` ديناميكي من DB |
| `components/BrandSelectorOverlay.tsx` | بطاقات البراند ديناميكية + `BRAND_STYLES` للبراندات المعروفة |
| `brands/page.tsx` | CRUD كامل للبراندات + FC targets |
| `branches/page.tsx` | CRUD كامل للفروع مع `is_active` toggle |
| `reports/page.tsx` | يستدعي `get_accessible_branches(brand)` RPC بدلاً من SELECT |
| `components/users/UserForm.tsx` | براندات ديناميكية + قسم "تقييد الفروع" + حفظ `user_branch_access` |
| `DashboardShell.tsx` | إضافة "البراندات" و"الفروع" للناف |

### Migrations بالترتيب في Supabase Dashboard
1. `020_report_modules.sql`
2. `021_brands_management.sql`
3. `022_branches_activation.sql`
4. `023_user_branch_access.sql`

### ملاحظات
- migration 022: يُضيف `UNIQUE(brand_id, name)` — إن كانت هناك فروع مكررة بنفس الاسم ستفشل، احذف التكرارات أولاً
- UserForm: حفظ صلاحيات الفروع يعمل مباشرة عبر Supabase client — يعتمد على RLS policy `uba_insert` التي تشترط `has_module_permission('users', 'update')`
- القاعدة الذهبية لصلاحيات الفروع: لا صفوف = كل الفروع مسموحة (zero-restriction by default)

---

## المهام القديمة (معلقة)

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
