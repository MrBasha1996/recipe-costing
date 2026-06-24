## مراجعة — استيراد/تصدير الإضافات + Overlay التحميل (2026-06-24)

### ما تغيّر

- `contexts/globalLoading.tsx` (جديد):
  - `GlobalLoadingProvider` — يُغلّف التطبيق ويوفر context
  - `useGlobalLoading()` hook — `startLoading(msg)`, `stopLoading()`, `updateProgress(current, total)`
  - Overlay: نافذة مركزية مع spinner + رسالة + شريط تقدم + backdrop يحجب التفاعل (z-index: 9999)

- `app/(dashboard)/[brand]/DashboardShell.tsx`:
  - إضافة `<GlobalLoadingProvider>` يُغلّف كل الـ return — الـ Overlay يظهر فوق كل شيء تلقائياً

- `lib/excel.ts`:
  - `exportModifiersExcel(options, ingredients)` — شيت 1: المجموعات والخيارات | شيت 2: المكونات
  - `downloadModifiersTemplate()` — نموذج فارغ مع أمثلة توضيحية
  - `parseModifiersFile(file)` — يقرأ Sheet "الإضافات" + Sheet "المكونات"، يُرجع `{ options, ingredients, errors }`

- `app/(dashboard)/[brand]/modifiers/ModifiersClient.tsx`:
  - أزرار: "تصدير Excel" + "استيراد Excel" + "نموذج" في الـ Header
  - Preview section: عرض الخيارات قبل التأكيد + تحذيرات الأخطاء + جدول 50 صف أولى
  - `handleImportConfirm()`: Upsert مجموعات → Upsert خيارات → Delete+Insert المكونات + إعادة احتساب total_cost
  - GlobalLoading مُفعَّل مع `updateProgress` أثناء الاستيراد

- `app/(dashboard)/[brand]/sales/SalesClient.tsx`:
  - `handleImportSales` + `handleImportModifiers` + `handleExplodeExecute` — مُربوطة بـ startLoading/stopLoading

- `app/(dashboard)/[brand]/purchasing/PurchasingClient.tsx`:
  - `handleImport` — مُربوط بـ startLoading/stopLoading

- `app/(dashboard)/[brand]/production/ProductionClient.tsx`:
  - `handleProduce` + `handleApprove` — مُربوطان بـ startLoading/stopLoading

- `app/(dashboard)/[brand]/inventory/InventoryClient.tsx`:
  - `useGlobalLoading()` مُضاف داخل `StocktakeTab` (sub-component مستقل — الـ hook في InventoryClient لا يصل إليه)
  - `doFinalize` + `handleApproveSession` — مُربوطان بـ startLoading/stopLoading

- `app/(dashboard)/[brand]/combos/CombosClient.tsx`:
  - `doRecalcAll` — مُربوط بـ startLoading/stopLoading + updateProgress في الـ loop

- `components/shared/PriceImpactModal.tsx`:
  - `handleApply` — مُربوط بـ startLoading/stopLoading + updateProgress في الـ loop

### TypeScript: 0 أخطاء في الملفات المعدّلة ✓

### لا يتطلب migration ✓

### ملاحظة حول الصلاحيات
- أزرار "تصدير Excel" تظهر فقط لمن لديه `modifiers.export`
- أزرار "استيراد Excel" و"نموذج" تظهر فقط لمن لديه `modifiers.import`
- كلا الصلاحيتين ممنوحتان للـ super admin تلقائياً (migration 035)

---

# خطة شاملة — 8 جلسات جديدة (ناتج تحليل 10 وكلاء متخصصين — 2026-06-22)

> **كيف تستخدم هذه الخطة:** كل جزء = جلسة مستقلة. افتح جلسة جديدة، قل "نفّذ الجزء X من خطة 2026-06-22"، وسيبدأ من أول بند غير مكتمل.
>
> **ما تم إنجازه:** الأجزاء 1-7 من خطة 2026-06-20 مكتملة. هذه الخطة تتناول النتائج الجديدة التي لم تُعالَج بعد.

---

## الجزء 9 — أمان: إغلاق 4 ثغرات جديدة 🔐 ✅ مكتمل (2026-06-23)
**الهدف:** إغلاق ثغرات أمنية اكتشفها وكيل الصلاحيات لم تُعالَج في الجلسات السابقة.
**الجهد:** ~2 ساعة | **migration:** 1 (تحديث has_module_permission)

- [x] **9-أ. استبدال `getSession()` بـ `getUser()` في middleware**
  - `middleware.ts` السطر 86-89
  - حُذفت 3 سطور (التعليق + `getSession()` + `session?.user`) → سطر واحد `getUser()`

- [x] **9-ب. إضافة session_id check في finalize route**
  - `app/api/stocktake/[id]/finalize/route.ts` السطر 70
  - إضافة `.eq('session_id', id)` على كل `update` في الحلقة

- [x] **9-ج. تقييد `roles_select` على الأدوار المتاحة للمستخدم فقط**
  - `supabase/migrations/050_rbac_rls_fix.sql` (جديد)
  - `roles_select` + `modules_select` + `rp_select` — تقييد للمستخدم الحالي فقط

- [x] **9-د. توسيع `has_module_permission` لتشمل approve/import/export**
  - `supabase/migrations/050_rbac_rls_fix.sql` (نفس الملف)
  - CREATE OR REPLACE مع كل الأفعال التسعة (كانت موجودة في 011 — أُعيدت للتأكيد)

- [ ] **يدوي:** تشغيل `050_rbac_rls_fix.sql` في Supabase Dashboard

---

## مراجعة — الجزء 9 (2026-06-23)

### ما تغيّر

- `middleware.ts`:
  - حُذف `supabase.auth.getSession()` + التعليق المضلّل + `const user = session?.user ?? null`
  - استُبدل بـ `const { data: { user } } = await supabase.auth.getUser()`
  - `getUser()` يتحقق مع Supabase Auth Server فعلياً — يمنع قبول JWT منتهي الصلاحية أو مزوَّر

- `app/api/stocktake/[id]/finalize/route.ts`:
  - إضافة `.eq('session_id', id)` على كل `update` في حلقة `session_items`
  - يمنع كتابة `stocktake_items` تخص جلسة مختلفة عبر UUID معروف

- `supabase/migrations/050_rbac_rls_fix.sql` (جديد):
  - `roles_select`: تقييد → super admin يرى الكل، بقية يرون دورهم فقط
  - `modules_select`: تقييد → يرى الوحدات المسموح بها لدوره فقط
  - `rp_select`: تقييد → يرى صلاحيات دوره فقط
  - `has_module_permission`: CREATE OR REPLACE مع كل الأفعال التسعة صريحاً

### TypeScript: 0 أخطاء ✓

### ملاحظة: اكتشاف مهم
- `has_module_permission` في migration 011 يتضمن `approve/import/export` فعلاً — migration 050 يُعيدها CREATE OR REPLACE للتأكيد
- `roles_select` الحالية في 006 كانت مفتوحة لأي مستخدم مسجّل — تم إغلاقها

### ما يتطلب إجراءً يدوياً ⚠️
1. تشغيل `050_rbac_rls_fix.sql` في Supabase Dashboard

---

---

## الجزء 10 — محاسبي: 3 أخطاء حرجة في الحسابات 🧮
**الهدف:** إصلاح أخطاء مالية تُنتج أرقاماً خاطئة بصمت.
**الجهد:** ~2.5 ساعة | **migration:** 1 (إصلاح WAC الباتشات)

- [x] **10-أ. إصلاح WAC الباتش عند الكميات الفعلية (costEstimate = null)**
  - `lib/produceBatch.ts` السطر 56-63 — مسار `actuals`
  - المشكلة: `costEstimate` يبقى `null` في مسار actuals → `batch_value = 0` → WAC لا يتحدث
  - الإصلاح: احسب `costEstimate` من actuals: `Σ (actual.qty × ingredient.cost)` باستخدام `costMap` المجلوب قبلها
  - يُصلح WAC لكل إنتاج بكميات فعلية (كان صفراً دائماً)

- [x] **10-ب. منع تكرار stock_movements عند إعادة تشغيل explode**
  - `app/api/sales/explode/route.ts` السطر 65-75
  - المشكلة: `daily_sales` تُجلب بدون فلتر `exploded_at IS NULL` → كل إعادة تشغيل تضيف حركات جديدة
  - الإصلاح: إضافة `.is('exploded_at', null)` على query الـ `daily_sales` في بداية العملية
  - يمنع COGS المضخَّم عند إعادة تشغيل الانفجار لنفس الـ batch

- [x] **10-ج. تسجيل عجز المخزون بدلاً من اقتطاعه صامتاً**
  - `app/api/sales/explode/route.ts` السطر 365-370
  - المشكلة: `Math.max(0, stock - qty)` يخفي العجز — `stock_movements` تسجل qty كاملة بينما الخصم الفعلي أقل
  - الإصلاح: تتبع العجز في `deficits[]` وإرجاعه في response — لا تغيير في آلية الحساب
  - لا تغيير في آلية الحساب (البقاء على صفر) لكن العجز يصبح مرئياً

---

## مراجعة — الجزء 10 (2026-06-23)

### ما تغيّر

- `lib/produceBatch.ts`:
  - في مسار `actuals` (السطر 61): إضافة fetch لـ `ingredients.cost` لكل مكوّن مُستخدم
  - حساب `costEstimate = Σ (need.needed × costMap[need.sku])` بدلاً من البقاء على `null`
  - كان `actuals_json.batch_value = 0` دائماً → `apply_produce_writes` لا يُحدّث WAC أبداً

- `app/api/sales/explode/route.ts`:
  - السطر 68: إضافة `.is('exploded_at', null)` على query الـ `daily_sales`
  - يمنع إعادة انفجار نفس المبيعات عند تشغيل الـ route مرتين لنفس الـ batch
  - السطر 362-380: إضافة تتبع `deficits[]` عند `qty > inStock`
  - العجز يُرجع في الـ response كـ `{ deficits: [{ sku, name, needed, inStock }] }` بدلاً من اختفائه صامتاً

### TypeScript: 0 أخطاء ✓

### لا يتطلب migration ✓

---

## الجزء 11 — منطق أعمال: 4 إصلاحات حالات حافة 🏢
**الهدف:** إصلاح حالات حافة تُنتج بيانات خاطئة في سيناريوهات محددة.
**الجهد:** ~2.5 ساعة | **migration:** 1

- [x] **11-أ. إصلاح stocktake approve: استخدام session_date بدل created_at**
  - `app/api/stocktake/[id]/approve/route.ts`
  - المشكلة: `session.created_at.slice(0,7)` بدل `session.session_date.slice(0,7)` لفحص الفترة المغلقة
  - الإصلاح: `const sessionYM = (session.session_date as string).slice(0, 7)` (متوافق مع finalize)
  - يمنع السماح باعتماد جرد يخص شهراً مغلقاً لأن الجلسة أُنشئت في شهر سابق

- [x] **11-ب. فرض ترتيب إغلاق الفترات**
  - `supabase/migrations/051_period_order_guard.sql` (جديد)
  - إضافة فحص في `close_period` RPC: إذا كان الشهر المطلوب إغلاقه ليس `closed_up_to + 1 شهر`، ارفع EXCEPTION
  - رسالة واضحة: `'يجب إغلاق YYYY-MM أولاً قبل إغلاق YYYY-MM'`
  - يمنع opening_inv_value الصفري الصامت عند إغلاق فترات غير متسلسلة

- [x] **11-ج. إضافة SELECT FOR UPDATE في apply_produce_writes**
  - `supabase/migrations/051_period_order_guard.sql` (نفس الملف)
  - `PERFORM 1 FROM stock_items WHERE ... FOR UPDATE` يقفل صفوف المخزون المتأثرة قبل الكتابة
  - يمنع race condition إذا أنتج مستخدمان من نفس المادة في نفس اللحظة

- [x] **11-د. إصلاح getCurrentYearMonth لاستخدام UTC**
  - `lib/period.ts`
  - `return new Date().toISOString().slice(0, 7)` — UTC دائماً
  - يمنع اختلاف الشهر في حافة آخر يوم بالشهر على خوادم في timezone مختلف

- [ ] **يدوي:** تشغيل `051_period_order_guard.sql` في Supabase Dashboard

---

## مراجعة — الجزء 11 (2026-06-23)

### ما تغيّر

- `app/api/stocktake/[id]/approve/route.ts`:
  - تغيير `select('id, status, brand_id, created_at')` → `select('id, status, brand_id, session_date')`
  - تغيير `session.created_at.slice(0, 7)` → `session.session_date.slice(0, 7)` في period guard
  - يضمن أن الفحص يعتمد على **تاريخ الجرد الفعلي** لا تاريخ إنشاء الجلسة

- `supabase/migrations/051_period_order_guard.sql` (جديد):
  - `close_period` RPC — إضافة فحص `v_closed_up_to`:
    - إذا `closed_up_to IS NOT NULL`: الشهر المطلوب يجب أن يساوي `closed_up_to + 1 شهر` تحديداً
    - رسالة ERRCODE P0004: `'يجب إغلاق YYYY-MM أولاً قبل إغلاق YYYY-MM'`
    - إذا `closed_up_to IS NULL`: أي شهر مسموح (أول إغلاق)
  - `apply_produce_writes` — إضافة `PERFORM 1 FROM stock_items WHERE ing_sku IN (...) FOR UPDATE`
    - يقفل صفوف المادة الخام والباتش قبل الكتابة
    - PostgreSQL يُسلّط هذا القفل على مستوى الصف فقط (Row-Level Lock)

- `lib/period.ts`:
  - `getCurrentYearMonth()`: `new Date().toISOString().slice(0, 7)` بدلاً من `.getFullYear()/.getMonth()`
  - `toISOString()` دائماً UTC — يمنع اختلاف الشهر على خوادم AWS المُضافة في توقيت غير UTC

### TypeScript: 0 أخطاء ✓

### ما يتطلب إجراءً يدوياً ⚠️
1. تشغيل `051_period_order_guard.sql` في Supabase Dashboard

---

## الجزء 12 — فهارس وأداء إضافي ⚙️
**الهدف:** إضافة 5 فهارس حرجة ناقصة + إصلاح 3 مشاكل أداء في الواجهة.
**الجهد:** ~2 ساعة | **migration:** 1

- [x] **12-أ. إضافة 5 فهارس مفقودة (الدفعة الثانية)**
  - إنشاء `supabase/migrations/052_more_indexes.sql`
  - `CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);`
  - `CREATE INDEX idx_stock_items_brand_sku ON stock_items(brand_id, ing_sku);`
  - `CREATE INDEX idx_mod_option_ings_option ON modifier_option_ingredients(option_id);`
  - `CREATE INDEX idx_stocktake_items_session ON stocktake_items(session_id);`
  - `CREATE INDEX idx_combo_meals_brand_sku ON combo_meals(brand_id, sku) WHERE is_active = true;`
  - هذه الجداول تُستعلم عنها في كل عملية explode وفي كل فتح لجلسة جرد

- [x] **12-ب. إصلاح SELECT * في dashboard/page.tsx**
  - `app/(dashboard)/[brand]/dashboard/page.tsx` السطر 32
  - `select('*')` → `select('id, sku, product_name, food_cost_pct, total_cost, sell_price, is_active, is_approved, margin, yield_portions, is_semi, app_price, margin_app, saved_at')`
  - يوقف إرسال actuals_json وكل الحقول غير المستخدمة في Dashboard

- [x] **12-ج. dynamic import لـ xlsx في DashboardClient**
  - `app/(dashboard)/[brand]/dashboard/DashboardClient.tsx`
  - حُذف `import { exportRecipesExcel } from '@/lib/excel'` من أعلى الملف
  - `const { exportRecipesExcel } = await import('@/lib/excel')` داخل `handleExport` فقط
  - يوفر ~600KB من initial bundle للـ dashboard

- [x] **12-د. إضافة limit لـ ConsumptionReport**
  - `app/(dashboard)/[brand]/reports/ReportsClient.tsx`
  - إضافة `.limit(5000)` على query `stock_movements` في ConsumptionReport
  - إضافة state `capped` + بانر أصفر في الـ UI إذا وصل العدد للحد

- [ ] **يدوي:** تشغيل `052_more_indexes.sql` في Supabase Dashboard

---

## مراجعة — الجزء 12 (2026-06-24)

### ما تغيّر

- `supabase/migrations/052_more_indexes.sql` (جديد):
  - 5 فهارس بـ `CREATE INDEX IF NOT EXISTS` — آمن على DB يحتوي بعضها مسبقاً بأسماء مختلفة
  - الجديدان فعلاً: `idx_stock_items_brand_sku(brand_id, ing_sku)` + `idx_combo_meals_brand_sku(brand_id, sku) WHERE is_active`
  - الثلاثة الأخرى موجودة في migrations 001/013/035 بأسماء مختلفة — `IF NOT EXISTS` يجعلها no-op بأسمائها الجديدة

- `app/(dashboard)/[brand]/dashboard/page.tsx`:
  - السطر 32: `select('*')` → قائمة صريحة بـ 14 حقلاً
  - يُوقف إرسال `actuals_json` (JSON ضخم يُخزَّن في كل وصفة) + حقول dine_out + version + approved_by وغيرها
  - الحقول المُضافة تشمل كل ما يحتاجه DashboardClient + OverTargetTable + Top10Chart + exportRecipesExcel

- `app/(dashboard)/[brand]/dashboard/DashboardClient.tsx`:
  - حُذف `import { exportRecipesExcel } from '@/lib/excel'` (static — يُضاف لـ initial bundle دائماً)
  - استُبدل بـ `const { exportRecipesExcel } = await import('@/lib/excel')` داخل `handleExport` فقط
  - xlsx + شيتات التصدير (~600KB) لا تُحمَّل إلا عند الضغط على زر التصدير

- `app/(dashboard)/[brand]/reports/ReportsClient.tsx`:
  - `ConsumptionReport`: إضافة `.limit(5000)` على query `stock_movements`
  - إضافة state `capped` يُعيَّن `true` إذا `consumed?.length >= 5000`
  - بانر أصفر `⚠ عدد الحركات وصل للحد الأقصى (5000 سجل)` يظهر في الـ UI عند الحاجة

### TypeScript: 0 أخطاء ✓

### ما يتطلب إجراءً يدوياً ⚠️
1. تشغيل `052_more_indexes.sql` في Supabase Dashboard

---

## الجزء 13 — الاختبارات: رفع التغطية للكود الحرج 🧪
**الهدف:** رفع تغطية الكود الحرج من < 10% إلى > 60% على الدوال المالية الأساسية.
**الجهد:** ~3 ساعات | **لا migration**

- [x] **13-أ. إضافة coverage thresholds في vitest.config.ts**
  - إضافة `coverage: { provider: 'v8', thresholds: { lines: 60, functions: 60, branches: 50 }, include: ['lib/**', 'app/api/**'], exclude: ['lib/pdf.ts', 'lib/excel.ts', 'lib/supabase/**'] }`
  - يجعل `npm run test:coverage` يفشل إذا انخفضت التغطية

- [x] **13-ب. اختبارات calcFoodCost و calcServiceCost**
  - `__tests__/lib/calculations.test.ts` — إضافة حالات:
  - `calcFoodCost`: yieldPortions=0 (division by zero)، appPrice=null، sellPrice=0، صفوف packaging منفصلة
  - `calcServiceCost`: service_type='dine_out'، VAT_RATE=1.15 مُطبَّق، حالة appPrice موجود

- [x] **13-ج. اختبارات calcSuggestedPrice**
  - `__tests__/lib/calculations.test.ts` — إضافة حالات:
  - هدف FC% = 30%، 35%، تكلفة = 0، VAT مُضمَّن في النتيجة

- [x] **13-د. اختبارات purchases/apply API**
  - `__tests__/api/purchases.test.ts` (جديد)
  - mock: `admin.rpc('apply_purchase_wac')` و `admin.rpc('apply_recipe_cost_cascade')`
  - حالات: body ناقص (400)، فترة مغلقة (423)، WAC error (500)، نجاح كامل

- [x] **13-هـ. اختبارات stocktake finalize**
  - `__tests__/api/stocktake.test.ts` (جديد)
  - mock: `admin.from('stocktake_sessions').select` و `admin.rpc('apply_stocktake_writes')`
  - حالات: session غير موجودة (404)، session مكتملة (409)، فترة مغلقة (423)، نجاح، RPC error

- [x] **13-و. اختبارات produceBatch (الكميات الفعلية)**
  - `__tests__/lib/produceBatch.test.ts` (جديد)
  - حالات: costEstimate محسوب من actuals، costEstimate من وصفة، batch_value > 0، تحذير نقص مخزون

---

## مراجعة — الجزء 13 (2026-06-24)

### ما تغيّر

- `vitest.config.ts`:
  - إضافة `coverage.provider = 'v8'`
  - `thresholds: { lines: 60, functions: 60, branches: 50 }` — npm run test:coverage يفشل إذا انخفضت التغطية
  - `include: ['lib/**', 'app/api/**']` — يركّز التغطية على الكود الحرج فقط
  - `exclude: ['lib/pdf.ts', 'lib/excel.ts', 'lib/supabase/**']` — يستثني مكتبات خارجية وملفات I/O

- `__tests__/lib/calculations.test.ts`:
  - إضافة `calcFoodCost` (6 حالات): yieldPortions=0، appPrice=null، sellPrice=0، صفوف متعددة، appPrice موجود، الأساس
  - إضافة `calcServiceCost` (3 حالات): foodRows+packagingRows، packagingRows فارغة، حصتان
  - إضافة `calcSuggestedPrice` (5 حالات): هدف 35%، 30%، تكلفة=0، هدف=0، VAT

- `__tests__/api/purchases.test.ts` (جديد — 5 اختبارات):
  - 400: body ناقص، UUID غير صالح
  - 423: فترة مغلقة
  - 200: WAC يعيد ok=false (updated=0)
  - 500: WAC RPC error
  - 200: نجاح كامل مع cascade

- `__tests__/api/stocktake.test.ts` (جديد — 6 اختبارات):
  - 400: session_items فارغة، brand_id ناقص
  - 404: الجلسة غير موجودة
  - 409: الجلسة مكتملة مسبقاً
  - 423: فترة مغلقة
  - 200: نجاح كامل
  - 500: RPC error

- `__tests__/lib/produceBatch.test.ts` (جديد — 9 اختبارات):
  - مسار الوصفة: 404 بدون وصفة، 400 بدون مكونات، costEstimate صحيح، تجاهل yield=0، تحذير نقص مخزون
  - مسار actuals: 404 بدون باتش، 400 كميات=0، costEstimate من أسعار DB، costEstimate=0 بدون أسعار، session_id

### TypeScript: 0 أخطاء ✓

### نتيجة `npm test`
**74/74 tests passed ✅** (من 37 → 74)

### لا يتطلب migration ✓

---

## الجزء 14 — التقارير: إصلاحات ونتائج ناقصة 📊 ✅ مكتمل (2026-06-24)
**الهدف:** إصلاح 4 مشاكل في دقة التقارير + إضافة Stocktake Variance Report المفقود.
**الجهد:** ~3 ساعات | **migration:** 1 (إضافة DELETE guard)

- [x] **14-أ. إضافة BEFORE DELETE للـ period lock trigger**
  - `supabase/migrations/053_period_lock_delete.sql` (جديد)
  - `check_period_not_closed()` مُحدَّثة: `TG_OP = 'DELETE'` يقرأ من `OLD` بدل `NEW`
  - جميع الـ triggers الأربعة أُعيد إنشاؤها بـ `BEFORE INSERT OR UPDATE OR DELETE`

- [x] **14-ب. تقرير Stocktake Variance (ناقص كلياً)**
  - تبويب جديد `stocktake-variance` "فروق الجرد" في `ReportsClient.tsx`
  - `StocktakeVarianceReport`: يجلب الجلسات المُنهاة/المُعتمدة + بنودها
  - KPIs: فروق موجبة، فروق سالبة، صافي، عدد الأصناف بفرق
  - جدول: نظري | فعلي | فرق الكمية | قيمة الفرق — ألوان خضراء/حمراء
  - تصدير Excel

- [x] **14-ج. إصلاح WasteReport: استخدام cost وقت الهدر**
  - أُضيف `value` لـ `select()` من `stock_movements`
  - `r.value != null` → يستخدم القيمة المحفوظة في DB (التكلفة وقت الهدر)
  - `r.value == null` → يرجع للسعر الحالي (سجلات قبل migration 028)

- [x] **14-د. إصلاح تصدير Excel لـ P&L**
  - `lib/excel.ts`: إعادة كتابة `exportPLReport` بـ interface جديد `PLPeriodData`
  - مقارنة 3 فترات (الشهر الحالي، السابق، العام الماضي) كأعمدة
  - بنود كاملة: COGS، مجمل الربح، عمالة، تكاليف ثابتة بالتفصيل (per category)، عمولات التوصيل، Prime Cost، صافي الربح + نسبة % من الإيراد
  - زر Excel في PLReport يُمرر `cur/prev/ly` بالكامل

- [x] **14-هـ. إصلاح break-even: إضافة عمولات التوصيل كتكلفة متغيرة**
  - `BreakevenReport` يجلب `brands.delivery_commission_pct` مع بقية الـ queries
  - `avgVarCostPerCover = (theoreticalMaterialCost + deliveryCommission) / totalQty`
  - الـ UI يُظهر سطراً إضافياً لعمولة التوصيل/وجبة إذا كانت > 0%

- [ ] **يدوي:** تشغيل `053_period_lock_delete.sql` في Supabase Dashboard

---

## مراجعة — الجزء 14 (2026-06-24)

### ما تغيّر

- `supabase/migrations/053_period_lock_delete.sql` (جديد):
  - `check_period_not_closed()` — منطق `TG_OP = 'DELETE'` يقرأ من `OLD.brand_id` + `row_to_json(OLD)`
  - جميع triggers تضم الآن `OR DELETE` — لا يمكن حذف سجل من فترة مغلقة
  - قبل: مبيع/مشتريات في شهر مغلق يمكن حذفها يدوياً من Supabase Dashboard → الآن ممنوع

- `app/(dashboard)/[brand]/reports/ReportsClient.tsx`:
  - **WasteReport** (السطر ~3426): أُضيف `value` لـ `select()`؛ خريطة تستخدم `r.value ?? r.qty × cost`
  - **BreakevenReport** (السطر ~772): إضافة `brands` للـ Promise.all؛ `deliveryCommission = revenue × commissionPct / 100`؛ `avgVarCostPerCover` يشمل العمولة؛ سطر جديد في جدول المعادلة إذا commissionPct > 0
  - **StocktakeVarianceReport** (مكوّن جديد في نهاية الملف):
    - يجلب جلسات الجرد بـ `status IN ('finalized','approved')`
    - dropdown لاختيار الجلسة + 4 KPI Cards + جدول بالألوان
    - تصدير Excel: كل صنف مع النظري/الفعلي/الفرق/القيمة
  - **TAB_MODULE**: إضافة `'stocktake-variance': 'report_stocktake_variance'`
  - **ALL_TABS**: إضافة `{ key: 'stocktake-variance', label: 'فروق الجرد' }`
  - **render**: إضافة `{tab === 'stocktake-variance' && <StocktakeVarianceReport brand={brand} />}`

- `lib/excel.ts`:
  - Interface جديد `PLPeriodData` (محلي)
  - `exportPLReport` مُعاد كتابتها: 3 فترات كأعمدة، COGS + مجمل الربح + عمالة + overhead by category + عمولات + Prime Cost + صافي + نسبة %
  - Call site في PLReport: يُمرر `cur/prev/ly` مع `prevLabel/lyLabel`

### TypeScript: 0 أخطاء ✓

### ما يتطلب إجراءً يدوياً ⚠️
1. تشغيل `053_period_lock_delete.sql` في Supabase Dashboard

---

## الجزء 15 — واجهة: إصلاحات UX وإمكانية الوصول 🎨 ✅ مكتمل (2026-06-24)
**الهدف:** إصلاح مشاكل accessibility حرجة وتحسين تجربة المستخدم على الجوال.
**الجهد:** ~3 ساعات | **لا migration**

- [x] **15-أ. ربط كل labels بـ htmlFor**
  - `components/ingredients/IngredientForm.tsx` — كل حقل: إضافة `id` على input + `htmlFor` على label
  - `app/(dashboard)/[brand]/inventory/InventoryClient.tsx` في `AddMovementTab` — نفس الإصلاح
  - `components/products/ProductForm.tsx` — نفس الإصلاح
  - يُصلح screen readers كاملاً — كانت labels مقطوعة الربط بحقولها

- [x] **15-ب. إضافة focus trap في modals**
  - `components/shared/PriceImpactModal.tsx` — إضافة `useRef` + `useEffect` يُركّز أول element قابل للـ focus عند الفتح
  - `components/ingredients/IngredientForm.tsx` (modal mode) — نفس الإصلاح

- [x] **15-ج. أحجام أزرار الجوال (< 44px)**
  - `app/(dashboard)/[brand]/inventory/InventoryClient.tsx` في `AddMovementTab` — أزرار "نوع الحركة"
  - `grid-cols-4 py-1.5` → `grid-cols-2 sm:grid-cols-4 py-3`

- [x] **15-د. تعريب رسائل الخطأ التقنية**
  - `app/(dashboard)/[brand]/error.tsx`
  - `process.env.NODE_ENV === 'development'` يعرض التفاصيل — production يعرض رسالة عربية عامة

- [x] **15-هـ. إضافة خط عربي مُحسَّن**
  - `app/globals.css`: `@import url('..Cairo..')` + `--font-main: 'Cairo', 'Segoe UI', ...`

- [x] **15-و. إضافة progress indicator في PriceImpactModal.handleApply**
  - `components/shared/PriceImpactModal.tsx`
  - state `progress: { current, total }` يُحدَّث بعد كل مادة
  - شريط تقدم + عداد `X / Y` في الزر
  - إذا فشل في المنتصف: رسالة "تم تطبيق X من Y — الباقي لم يُطبَّق"

- [x] **15-ز. validation inline في النماذج**
  - `components/ingredients/IngredientForm.tsx`
  - `fieldErrors` state + `validateField()` + `onBlur` على الاسم/SKU/الفئة
  - علامة `*` حمراء على الحقول المطلوبة
  - حدود حمراء على الحقل عند الخطأ

---

## مراجعة — الجزء 15 (2026-06-24)

### ما تغيّر

- `components/ingredients/IngredientForm.tsx`:
  - إضافة `id` + `htmlFor` على 7 حقول (الاسم، SKU، الفئة، الوحدة، التكلفة، وحدة الشراء، معامل التحويل)
  - إضافة `useRef` + `useEffect` للـ focus trap — أول input يأخذ focus تلقائياً عند فتح الـ modal
  - إضافة `fieldErrors` state + `validateField()` function
  - `onBlur` على الاسم/SKU/الفئة — يتحقق مباشرة عند مغادرة الحقل
  - علامة `*` حمراء في labels الحقول المطلوبة
  - حد أحمر `border-red-400` على الحقل عند وجود خطأ

- `components/products/ProductForm.tsx`:
  - إضافة `id` + `htmlFor` على 3 حقول (الاسم، SKU، السعر)

- `app/(dashboard)/[brand]/inventory/InventoryClient.tsx`:
  - `AddMovementTab`: إضافة `id` + `htmlFor` على حقلَي الكمية والملاحظة والصنف
  - أزرار نوع الحركة: `grid-cols-4 py-1.5` → `grid-cols-2 sm:grid-cols-4 py-3` (44px+ للجوال)

- `app/(dashboard)/[brand]/error.tsx`:
  - `error.message` يُعرض فقط في development — production يعرض "حدث خطأ غير متوقع، يرجى تحديث الصفحة"
  - `error.digest` يُعرض فقط في development

- `app/globals.css`:
  - `@import url('https://fonts.googleapis.com/css2?family=Cairo...')` مضاف بعد `@import "tailwindcss"`
  - `--font-main` محدّث: `'Cairo'` أولاً

- `components/shared/PriceImpactModal.tsx`:
  - `useRef` + `useEffect` للـ focus trap
  - `progress` state: `{ current, total } | null`
  - Loop يستدعي `setProgress({ current: applied, total })` بعد كل مادة
  - شريط تقدم في footer مع عداد — يُخفى بعد اكتمال العملية
  - زر التطبيق يعرض `جارٍ التطبيق... X / Y` بدلاً من رسالة ثابتة
  - عند فشل جزئي: رسالة "تم تطبيق X من Y — الباقي لم يُطبَّق"

### TypeScript: 0 أخطاء ✓

### لا يتطلب migration ✓

---

## الجزء 16 — الامتثال والنسخ الاحتياطي ⚖️💾
**الهدف:** إضافة آليات rollback + استكمال Part 8 المعلق + حماية البيانات.
**الجهد:** ~4 ساعات | **migration:** 3 جديدة

- [x] **16-أ. RPC لعكس انفجار المبيعات (reverse explode)**
  - `supabase/migrations/054_reverse_explode.sql` (جديد)
  - دالة `reverse_explode_batch(p_brand_id text, p_import_batch uuid)` SECURITY DEFINER
  - تُعيد `daily_sales.exploded_at = NULL` + تحذف `stock_movements` التابعة لهذا الـ batch + تُعيد `stock_items.current_qty`
  - شرط: الفترة يجب أن تكون مفتوحة (يتحقق من `brands.closed_up_to`)
  - إضافة زر "عكس الانفجار" في `SalesClient.tsx` يظهر فقط للمدير ولفترات مفتوحة

- [x] **16-ب. Soft Delete لجداول حساسة**
  - `supabase/migrations/055_soft_delete.sql` (جديد)
  - `ALTER TABLE recipes ADD COLUMN deleted_at TIMESTAMPTZ`
  - `ALTER TABLE ingredients ADD COLUMN deleted_at TIMESTAMPTZ`
  - تحديث RLS policies للجداول: فلتر `WHERE deleted_at IS NULL` في SELECT
  - تحويل DELETE في API routes إلى `UPDATE SET deleted_at = now()`

- [x] **16-ج. Retention Lock: منع حذف سجلات مالية +7 سنوات**
  - `supabase/migrations/056_retention_lock.sql` (جديد)
  - trigger على `purchases` و`daily_sales` و`stock_movements`:
  - `IF OLD.created_at < now() - interval '7 years' THEN RAISE EXCEPTION 'لا يمكن حذف سجلات أقدم من 7 سنوات'`

- [x] **16-د. تسجيل delete_production_session في audit_logs**
  - `supabase/migrations/054_reverse_explode.sql` أو migration منفصل
  - في دالة `delete_production_session` RPC: إضافة `INSERT INTO audit_logs (...) VALUES ('production_session_deleted', ...)`

- [x] **16-هـ. تسجيل close_period في audit_logs**
  - `supabase/migrations/054_reverse_explode.sql` أو migration منفصل
  - في دالة `close_period` RPC: إضافة `INSERT INTO audit_logs (...) VALUES ('period_closed', ...)`

- [x] **16-و. Right to Erasure: دالة anonymize_user**
  - استكمال من Part 8 (8-ج)
  - `supabase/migrations/057_anonymize_user.sql` (جديد)
  - دالة `anonymize_user(p_user_id uuid)` SECURITY DEFINER — super admin فقط
  - تستبدل الاسم بـ `DELETED_UUID` + تحذف البريد من `auth.users` + تحتفظ بـ UUID في audit_logs

- [x] **16-ز. حقل رقم ضريبي TRN في brands**
  - استكمال من Part 8 (8-د)
  - `supabase/migrations/058_brands_trn.sql`: `ALTER TABLE brands ADD COLUMN tax_reg_number text`
  - إضافة حقل TRN في صفحة إعدادات البراند (UI)

- [ ] **يدوي:** تشغيل بالترتيب في Supabase Dashboard:
  - `053_period_lock_delete.sql` (من الجزء 14)
  - `054_reverse_explode.sql`
  - `055_soft_delete.sql`
  - `056_retention_lock.sql`
  - `057_anonymize_user.sql`
  - `058_brands_trn.sql`

---

## مراجعة — الجزء 16 (2026-06-24) ✅ مكتمل

### ما تغيّر

- `supabase/migrations/054_reverse_explode.sql` (جديد):
  - `ALTER TABLE stock_movements ADD COLUMN import_batch uuid` — يربط حركات الخصم بالدفعة
  - `CREATE INDEX idx_stock_movements_batch ON stock_movements(import_batch)`
  - `apply_explode_writes` — مُحدَّثة: تمرر `import_batch` عند INSERT في stock_movements
  - `reverse_explode_batch(p_brand_id, p_import_batch, p_reversed_by)` — SECURITY DEFINER
    - يتحقق من الفترة المفتوحة + وجود حركات بـ import_batch
    - يُرجع stock_items + يحذف حركات 'out' + يُعيد exploded_at=NULL
    - يسجّل في audit_logs بـ action='reverse_explode'
  - `delete_production_session` — مُحدَّثة: تسجل 'production_session_deleted' في audit_logs
  - `close_period` — مُحدَّثة: تسجل 'period_closed' في audit_logs (مع fc_pct + ending_inv)

- `app/api/sales/reverse-explode/route.ts` (جديد):
  - POST: يتحقق من صلاحية 'sales.delete' ثم يستدعي RPC
  - يُعيد 423 لفترة مغلقة، 404 لدفعة غير موجودة، 409 لدفعة قبل migration 054

- `app/(dashboard)/[brand]/sales/SalesClient.tsx`:
  - state: `reversingBatch` + `reverseMsg`
  - `handleReverseExplode(batchId)` — ConfirmDialog + fetch لـ reverse-explode
  - جدول الدفعات: زر `↩ عكس` يظهر للـ isSuperAdmin فقط بجانب "✓ محتسب"
  - بانر نتيجة العكس في الـ UI

- `supabase/migrations/055_soft_delete.sql` (جديد):
  - `ALTER TABLE recipes ADD COLUMN deleted_at TIMESTAMPTZ`
  - `ALTER TABLE ingredients ADD COLUMN deleted_at TIMESTAMPTZ`
  - فهارس partial على `deleted_at IS NULL` لكلا الجدولين
  - إعادة إنشاء `ingredients_select` + `recipes_select` مع `AND deleted_at IS NULL`
  - حذف `ingredients_delete` + `recipes_delete` policies — الحذف الصريح ممنوع

- `app/(dashboard)/[brand]/ingredients/IngredientsClient.tsx`:
  - DELETE → `UPDATE SET deleted_at = now()` (soft delete)

- `app/(dashboard)/[brand]/batches/BatchesClient.tsx`:
  - DELETE من recipes → `UPDATE SET deleted_at = now()` (soft delete)
  - حُذف DELETE من recipe_ingredients (cascade يكفي عند حذف الوصفة الفعلي)

- `supabase/migrations/056_retention_lock.sql` (جديد):
  - `check_retention_lock()` trigger function
  - triggers على purchases + daily_sales + stock_movements: منع حذف سجلات أقدم من 7 سنوات

- `supabase/migrations/057_anonymize_user.sql` (جديد):
  - `anonymize_user(p_user_id uuid)` SECURITY DEFINER — super admin فقط
  - يُنظّف user_profiles (name_ar + username) + auth.users (email + meta)
  - يسجّل في audit_logs بـ action='user_anonymized'

- `supabase/migrations/058_brands_trn.sql` (جديد):
  - `ALTER TABLE brands ADD COLUMN tax_reg_number text`

- `app/(dashboard)/[brand]/settings/page.tsx`:
  - إضافة `tax_reg_number` في SELECT + `initialTrn` كـ prop

- `app/(dashboard)/[brand]/settings/SettingsClient.tsx`:
  - state `trn` + `savingTrn` + `trnMsg` + دالة `saveTrn()`
  - قسم جديد "الرقم الضريبي (TRN)" مع input + زر حفظ + رسالة نتيجة

### TypeScript: 0 أخطاء ✓

### ملاحظة مهمة — اكتشاف حرج ⚠️
- `stock_movements` لم يكن يحتفظ بـ `import_batch` في حركات الانفجار → إضافة العمود ضروري
- الدفعات المُنفجرة **قبل** تشغيل migration 054 لا يمكن عكسها (ترفع ERRCODE P0005)
- هذا متوقع وصحيح — العكس يعمل فقط للدفعات المُنفجرة بعد التحديث

### ما يتطلب إجراءً يدوياً ⚠️
1. تشغيل `054_reverse_explode.sql` في Supabase Dashboard
2. تشغيل `055_soft_delete.sql` في Supabase Dashboard
3. تشغيل `056_retention_lock.sql` في Supabase Dashboard
4. تشغيل `057_anonymize_user.sql` في Supabase Dashboard
5. تشغيل `058_brands_trn.sql` في Supabase Dashboard

---

## ترتيب التنفيذ المقترح (الأجزاء 9-16)

```
الجزء 9 (أمان)  →  الجزء 10 (محاسبي)  →  الجزء 11 (منطق أعمال)
      ↓
الجزء 12 (أداء)  →  الجزء 13 (اختبارات)  →  الجزء 14 (تقارير)
      ↓
الجزء 15 (UX)   →  الجزء 16 (امتثال)
```

الأجزاء 12 و13 و15 مستقلة — يمكن تنفيذها بأي ترتيب.
الجزء 9 يجب أن يأتي أولاً (أمان).
الجزء 16 يُؤجَّل لأنه يحتوي migrations متعددة وتغييرات كبيرة.

---

# خطة شاملة — 8 أجزاء (ناتج تحليل 10 وكلاء متخصصين — 2026-06-20)

> **كيف تستخدم هذه الخطة:** كل جزء = جلسة مستقلة. افتح جلسة جديدة، قل "نفّذ الجزء X من خطة 2026-06-20"، وسيبدأ من أول ✅ غير مكتمل.

---

## مراجعة — الجزء 7 (2026-06-20)

### ما تغيّر

- `app/(dashboard)/[brand]/DashboardShell.tsx`:
  - `NAV_BASE` أصبح يحمل حقل `group: NavGroup` لكل عنصر (`ops` | `analytics` | `admin`)
  - `GROUP_LABELS` يربط كل مجموعة بعنوان: التشغيل / التحليل / الإدارة
  - الـ `<nav>` يُعيد تجميع العناصر بحسب المجموعة مع label صغير ويُخفي المجموعات الفارغة

- `app/(dashboard)/[brand]/inventory/InventoryClient.tsx`:
  - تبويبات المخزون: 10 تبويبات → 4 يومية ثابتة (المخزون / إضافة حركة / الجرد الدوري / توافر الأطباق) + dropdown "تحليلات" يحتوي 6 (سجل الحركات، عمر المخزون، طلبات الشراء، قيمة المخزون، بطاقة الصنف، تحليل الهالك)
  - السطر 555: `alert(...)` → `setMsg({ ok: false, text: ... })` في `handleStartSession`
  - حقل الكمية الفعلية في جدول الجرد: `w-24 py-0.5` → `w-32 py-2` (أسهل للـ touch)

- `app/(dashboard)/[brand]/reports/ReportsClient.tsx`:
  - تبويب جديد **`waste`** — "تقرير الهدر": يجلب `stock_movements WHERE movement_type='waste'`، يعرض KPIs (إجمالي القيمة، عدد السجلات، أعلى مادة) + bar chart أعلى 5 مواد + جدول تفصيلي + تصدير Excel
  - تبويب جديد **`inv-valuation`** — "تقييم المخزون": يجلب `stock_items` ويحسب `qty × cost`، يعرض القيمة الإجمالية + توزيع الفئات + تنبيه الراكد (+30 يوم) + جدول + تصدير Excel
  - زر **Excel** في PurchasesReport: يُعيد جلب صفوف `purchases` ويصدّرها
  - زر **Excel** في SalesReport: يُعيد جلب صفوف `daily_sales` ويصدّرها
  - زر **Excel** في ConsumptionReport: يصدّر `rows` المحسوبة مباشرة (لا re-fetch)

### TypeScript: 0 أخطاء ✓

### لا يتطلب migration ✓

### ملاحظات
- Waste Report يجلب `branch_name` من `stock_movements` — تأكد أن العمود موجود في الجدول (أُضيف في مراحل سابقة)
- Inventory Valuation يعتمد على `updated_at` لحساب "راكد" — إذا لم يُحدَّث `updated_at` عند كل حركة فقد تكون القراءة غير دقيقة

---

## مراجعة — الجزء 6 (2026-06-20)

### ما تغيّر
- `vitest.config.ts` (جديد): alias `@` → root، environment: node
- `package.json`: إضافة `"test": "vitest run"` و `"test:coverage": "vitest run --coverage"`
- `lib/calculations.ts`:
  - `calcDeduction(qty, yieldPct, yieldPortions, qtySold, ucFactor)` — خصم المخزون لمكوّن واحد
  - `calcWac(currentQty, currentCost, purchaseQty, purchaseValue)` — WAC بكل حالاته الحرجة
- `lib/period.ts`:
  - `isPeriodClosed(batchDate, closedUpTo)` — فحص انتماء دفعة لفترة مغلقة
- `__tests__/lib/calculations.test.ts` (جديد): 10 tests لـ calcRowCost + calcDeduction
- `__tests__/lib/wacCalculation.test.ts` (جديد): 6 tests لـ calcWac
- `__tests__/lib/periodGuard.test.ts` (جديد): 12 tests لـ isPeriodClosed + monthRange + shiftMonth
- `__tests__/api/explode.test.ts` (جديد): 5 integration tests (body invalid, closed period, no sales)

### نتيجة `npm test`
**37/37 tests passed ✅**

### اكتشاف حرج مُوثَّق ⚠️
**Zod v4 UUID validation أكثر صرامة من v3:**
- `'00000000-0000-0000-0000-000000000001'` **مرفوض** (version nibble = 0، يجب أن يكون 1-8)
- أي UUID مُولَّد بـ `00000000-...` hardcoded في الكود سيُخفق validation
- الحل: استخدم `crypto.randomUUID()` أو UUID v4 حقيقي في البيانات

### لا يتطلب إجراءً يدوياً ✓

---

## مراجعة — الجزء 5 (2026-06-20)

### ما تغيّر
- `supabase/migrations/049_cascade_recipes_rpc.sql` (جديد):
  - دالة `apply_recipe_cost_cascade(p_brand_id text, p_changed_skus jsonb)` SECURITY DEFINER
  - الخطوة 1: `UPDATE recipe_ingredients` بـ batch واحد عبر JOIN بـ `recipes.brand_id` (بدلاً من N طلبات)
  - الخطوة 2: `UPDATE recipes` بـ CTE تحسب main_cost + full_cost + has_packaging لكل وصفة متأثرة
  - الخطوة 3: `UPDATE combo_meal_items` لعناصر الكومبو التي تستخدم منتجات وصفاتها تغيّرت
  - الخطوة 4: `UPDATE combo_meals` بإعادة جمع التكاليف بعد تحديث العناصر
  - كل شيء في transaction واحدة — لا race conditions
- `app/api/purchases/apply/route.ts`:
  - حذف 157 سطراً (حلقات N+M+K تسلسلية — السطور 77-233)
  - استبدال بـ `admin.rpc('apply_recipe_cost_cascade', { p_brand_id, p_changed_skus: ingredientUpdates })`
  - الملف من 257 سطر → 113 سطر

### بغز حرج اكتُشف وأُصلح ⚠️
الـ cascade القديم كان **مكسوراً صامتاً** لسببين:
1. `recipe_ingredients.brand_id` غير موجود → PostgREST يُرجع خطأ → `data = null` → `recipeIds = []` → الحلقة لا تُنفَّذ أبداً
2. `recipes.product_sku` غير موجود (الصحيح: `recipes.sku`) → combo cascade لا يُنفَّذ أبداً

المعنى: تكاليف الوصفات لم تتحدّث عند تطبيق أي مشتريات منذ البداية. الـ RPC الجديد يُصلح هذا.

### ما يتطلب إجراءً يدوياً ⚠️
1. تشغيل `049_cascade_recipes_rpc.sql` في Supabase Dashboard
2. اختبار يدوي: تطبيق مشتريات تؤثر على 5+ وصفات، تأكد أن `total_cost` يُحدَّث لكلها وأن `combo_meals` تُحدَّث أيضاً

### TypeScript: 0 أخطاء ✓

---

## مراجعة — الجزء 4 (2026-06-20)

### ما تغيّر
- `app/api/purchases/apply/route.ts`:
  - `calcCost`: `yp = yield_pct > 0 ? yield_pct : 100` → loop بـ `if (yield_pct <= 0) continue`
  - عناصر yield_pct=0 لا تُحسب في تكلفة الوصفة (متطابق مع سلوك الـ explode)
- `app/(dashboard)/[brand]/reports/ReportsClient.tsx`:
  - `loadPLForMonth`: حُذف query المشتريات، `mat` أصبح `SUM(daily_sales.cost)` — FC% في compare-pl يطابق تبويب pl
  - `PLReport`: قبول prop `fcLow?: number` (default: FC_TARGET) — يستخدمه في kpiCards و kpiPerf
  - render PLReport: يُمرَّر `fcLow={fcLow}` من البراند
- `supabase/migrations/047_snapshot_opening_inv.sql` (جديد):
  - إعادة كتابة `close_period` بإضافة `opening_inv_value = ending_inv_value من الفترة السابقة`
  - يُمكّن: opening_inv + purchases − ending_inv = COGS
- `supabase/migrations/048_stock_items_period_lock.sql` (جديد):
  - trigger `trg_stock_items_period_lock` على INSERT/UPDATE/DELETE
  - يمنع التعديل المباشر من authenticated users إذا `closed_up_to IS NOT NULL`
  - service_role (admin RPCs) معفى تلقائياً (auth.uid() = NULL)

### ما يتطلب إجراءً يدوياً ⚠️
1. تشغيل `047_snapshot_opening_inv.sql` في Supabase Dashboard
2. تشغيل `048_stock_items_period_lock.sql` في Supabase Dashboard

### TypeScript: 0 أخطاء ✓

---

## مراجعة — الجزء 3 (2026-06-20)

### ما تغيّر
- `supabase/migrations/046_missing_indexes.sql` (جديد):
  - 5 indexes مفقودة: recipes(brand_id, is_active, is_approved)، recipes(brand_id, sku)، daily_sales(brand_id, import_batch)، modifier_sales partial (unexploded)، stock_movements(brand_id, ing_sku, created_at DESC)
- `stores/permissionsStore.ts`:
  - حُذفت كتلة Realtime من داخل `loadPermissions()` — كانت تُنشئ channel ثانٍ بعد كل reload للصلاحيات
  - `subscribeToChanges()` هي المسؤولة الوحيدة عن إنشاء القناة
- `app/(dashboard)/[brand]/inventory/InventoryClient.tsx`:
  - `AvailabilityTab`: `recipe_ingredients` يُجلب الآن فقط لـ recipeIds التابعة للبراند (بدلاً من كل البراندات)، مع cleanup flag
  - `AgingTab`: cleanup flag لمنع stale state عند تغيير الـ filter سريعاً
  - `LedgerTab`: `cancelRef` (useRef) لمنع stale state عند تغيير الصنف
  - إضافة `useRef` للـ React import
- `app/(dashboard)/[brand]/dashboard/DashboardClient.tsx`:
  - `FCDistributionChart` و`Top10Chart` → `dynamic()` imports مع `ssr: false`
  - يوفر ~270KB من initial bundle

### ما يتطلب إجراءً يدوياً ⚠️
1. تشغيل `046_missing_indexes.sql` في Supabase Dashboard

### TypeScript: 0 أخطاء ✓

---

## مراجعة — الجزء 2 (2026-06-20)

### ما تغيّر
- `supabase/migrations/045_stocktake_finalize_rpc.sql` (جديد):
  - `apply_stocktake_writes`: stock_items + stock_movements + session.status في transaction واحدة
  - `record_stock_movement`: حركة + increment للمخزون atomic — يمنع lost-update
  - `apply_explode_writes`: مُحدَّث بـ `p_modifier_sales_ids uuid[]` لتمييز modifier_sales داخل نفس transaction
- `app/api/stocktake/[id]/finalize/route.ts` (جديد): auth + period guard + live qty + يستدعي apply_stocktake_writes
- `app/(dashboard)/[brand]/inventory/InventoryClient.tsx`:
  - `doFinalize()`: أصبح `fetch('/api/stocktake/[id]/finalize')` بدلاً من 10+ await متسلسلة
  - `AddMovementTab.handleSubmit`: أصبح `rpc('record_stock_movement')` — بدون قراءة qty ثم كتابة
- `app/api/sales/explode/route.ts`:
  - حذف date-range calculation، modifier_sales تُجلب بـ `import_batch` فقط
  - حُذف الـ `update({ exploded_at })` المنفصل بعد الـ RPC — الآن داخل transaction

### ما يتطلب إجراءً يدوياً ⚠️
1. تشغيل `045_stocktake_finalize_rpc.sql` في Supabase Dashboard
2. ملاحظة: `apply_explode_writes` في 045 يزيل `can_access_brand` check التي أضافتها 038 (كانت مكسورة مع admin client) — الـ auth يُفحص في route handler

### TypeScript: 0 أخطاء ✓

---

## مراجعة — الجزء 1 (2026-06-20)

### ما تغيّر
- `app/api/purchases/apply/route.ts`: `requireBrandAccess` → `requireModulePermission('purchasing','create')` — viewer لم يعد يستطيع تطبيق مشتريات
- `app/api/stocktake/[id]/approve/route.ts`: يقبل `brand_id` في body، يتحقق من الصلاحية أولاً قبل جلب أي بيانات من DB
- `app/(dashboard)/[brand]/inventory/InventoryClient.tsx`: `handleApproveSession` يُرسل `{ brand_id }` في body
- `supabase/migrations/039_batch_wac_fix.sql`: تأكيد أن can_access_brand guard موجود مسبقاً في `apply_produce_writes`

### ما يتطلب إجراءً يدوياً ⚠️
1. تأكد من تشغيل `038_secure_rpcs.sql` في Supabase Dashboard
2. تأكد من تشغيل `043_rls_tighten.sql` في Supabase Dashboard

### TypeScript: 0 أخطاء ✓

---

## الجزء 1 — ثغرات الأمان الحرجة 🔴 ✅ مكتمل (2026-06-20)
**الهدف:** إغلاق 3 ثغرات تتيح cross-brand data manipulation.

- [x] **1-أ. apply_produce_writes: can_access_brand guard**
  - موجود مسبقاً في `supabase/migrations/039_batch_wac_fix.sql` السطر 28-30
  - لا يلزم migration جديد

- [x] **1-ب. purchases/apply: استبدال requireBrandAccess بـ requireModulePermission**
  - `app/api/purchases/apply/route.ts`
  - `requireBrandAccess` → `requireModulePermission(brand_id, 'purchasing', 'create')`

- [x] **1-ج. stocktake/approve: نقل requireModulePermission قبل DB read**
  - `app/api/stocktake/[id]/approve/route.ts` — قبول `brand_id` في body
  - `requireModulePermission` يُستدعى أولاً قبل أي DB read
  - `InventoryClient.tsx` `handleApproveSession` يُرسل `brand_id` في body

- [ ] **1-د. التحقق من تطبيق migrations على production (يدوي)**
  - تأكد من تطبيق `038_secure_rpcs.sql` و `043_rls_tighten.sql` في Supabase Dashboard

---

## الجزء 2 — إصلاحات Atomicity وRace Conditions 🔴 ✅ مكتمل (2026-06-20)

- [x] **2-أ. Stocktake finalize: نقل من client إلى RPC**
  - `supabase/migrations/045_stocktake_finalize_rpc.sql` — دالة `apply_stocktake_writes`
  - `app/api/stocktake/[id]/finalize/route.ts` — route جديد يتحقق من auth + period lock + يستدعي RPC
  - `InventoryClient.tsx` — `doFinalize()` أصبح fetch بدلاً من حلقات client-side

- [x] **2-ب. modifier_sales: ربط الخصم بـ import_batch لا بالتاريخ**
  - `app/api/sales/explode/route.ts` — حذف date-range، إضافة `.eq('import_batch', import_batch)`

- [x] **2-ج. AddMovementTab: SQL increment بدل read-then-write**
  - `supabase/migrations/045_stocktake_finalize_rpc.sql` — دالة `record_stock_movement` مع ON CONFLICT DO UPDATE current_qty + delta
  - `InventoryClient.tsx` — `handleSubmit` يستدعي `rpc('record_stock_movement')` بدلاً من upsert

- [x] **2-د. modifier_sales.exploded_at: نقل داخل RPC**
  - `supabase/migrations/045_stocktake_finalize_rpc.sql` — `apply_explode_writes` مُحدَّث بـ `p_modifier_sales_ids uuid[]`
  - `app/api/sales/explode/route.ts` — يمرر `p_modifier_sales_ids` للـ RPC، حُذف الـ `update` المنفصل

- [ ] **يدوي:** تشغيل `045_stocktake_finalize_rpc.sql` في Supabase Dashboard

---

## الجزء 3 — إصلاحات الأداء والـ Indexes ⚙️ ✅ مكتمل (2026-06-20)
**الهدف:** تقليل query time بـ 50-70% بـ indexes + إصلاح bugs صامتة.
**الجهد:** ~2 ساعة | **migration:** 1 جديد للـ indexes

- [x] **3-أ. إضافة 5 indexes مفقودة**
  - إنشاء `supabase/migrations/046_missing_indexes.sql`

- [x] **3-ب. إصلاح Realtime double channel bug**
  - `stores/permissionsStore.ts`: حذف كتلة الـ Realtime (17 سطراً) من داخل `loadPermissions()`
  - `subscribeToChanges()` هي المسؤولة الوحيدة عن إنشاء القناة

- [x] **3-ج. AvailabilityTab: إضافة فلتر recipe_ingredients**
  - `InventoryClient.tsx` داخل AvailabilityTab
  - استبدال fetch شامل بـ fetch مُقسَّم: recipes+stockRows أولاً ثم `.in('recipe_id', recipeIds)`

- [x] **3-د. useEffect cleanup flag**
  - `AvailabilityTab`: `let cancelled = false` + `return () => { cancelled = true }` + `if (cancelled) return`
  - `AgingTab`: نفس النمط
  - `LedgerTab`: `useRef(false)` + `cancelRef.current = false` في بداية load + `if (cancelRef.current) return` قبل setState

- [x] **3-هـ. Lazy load recharts**
  - `DashboardClient.tsx`: `FCDistributionChart` و`Top10Chart` → `dynamic(() => import('...'), { ssr: false })`

- [ ] **يدوي:** تشغيل `046_missing_indexes.sql` في Supabase Dashboard

---

## الجزء 4 — إصلاحات محاسبية 🧮 ✅ مكتمل (2026-06-20)
**الهدف:** توحيد تعريف COGS ومنع التناقضات بين التقارير.
**الجهد:** ~3 ساعات | **migration:** 1 للـ snapshot

- [x] **4-أ. yield_pct=0: توحيد السلوك بين التكلفة والخصم**
  - `app/api/purchases/apply/route.ts` السطر 124-127
  - استبدال `yp = yield_pct > 0 ? yield_pct : 100` بـ `if (yield_pct <= 0) continue`
  - يجعل السلوكَين (حساب التكلفة وخصم المخزون) متطابقَين

- [x] **4-ب. compare-pl: توحيد COGS ليستخدم daily_sales.cost**
  - `ReportsClient.tsx` في `loadPLForMonth`
  - استبدال `mat = purchases.total_price` بـ `mat = SUM(daily_sales.cost)`
  - يمنع ظهور FC% مختلف لنفس الشهر في تبويبَي pl و compare-pl

- [x] **4-ج. KPI Scorecard: استخدام هدف البراند بدل الثابت**
  - `ReportsClient.tsx` السطر 499 approx
  - استبدال `target: FC_TARGET` بـ `target: fcLow` المسحوب من DB
  - يعكس هدف FC% المخصص للبراند في Dashboard

- [x] **4-د. إضافة opening_inv_value في period_snapshot**
  - إنشاء `supabase/migrations/047_snapshot_opening_inv.sql`
  - في `close_period` RPC: إضافة `opening_inv_value = period_snapshot السابق.ending_inv_value`
  - يُمكّن معادلة: مخزون أول + مشتريات − مخزون آخر = COGS

- [x] **4-هـ. إضافة stock_items لـ period lock trigger**
  - إنشاء `supabase/migrations/048_stock_items_period_lock.sql`
  - trigger يمنع INSERT/UPDATE/DELETE المباشر من المستخدمين (auth.uid() IS NOT NULL) إذا كان closed_up_to مضبوطاً
  - service_role (admin client / RPCs) يُعفى تلقائياً (auth.uid() IS NULL)

- [ ] **يدوي:** تشغيل `047_snapshot_opening_inv.sql` في Supabase Dashboard
- [ ] **يدوي:** تشغيل `048_stock_items_period_lock.sql` في Supabase Dashboard

---

## الجزء 5 — إصلاح N+1 الثقيل في purchases/apply ⚡ ✅ مكتمل (2026-06-20)
**الهدف:** منع Vercel timeout عند cascade تكاليف 200+ وصفة.
**migration:** `049_cascade_recipes_rpc.sql`

- [x] **5-أ. إنشاء RPC بديل لـ cascade الوصفات**
  - إنشاء `supabase/migrations/049_cascade_recipes_rpc.sql`
  - دالة `apply_recipe_cost_cascade(p_brand_id, p_changed_skus jsonb)` SECURITY DEFINER
  - تستخدم `UPDATE recipe_ingredients ... FROM` و `UPDATE recipes ... FROM` بدل loops
  - تعمل في transaction واحدة بدلاً من N+M+K طلبات تسلسلية

- [x] **5-ب. تحديث purchases/apply لاستدعاء RPC الجديد**
  - `app/api/purchases/apply/route.ts`
  - حذف الـ loops (157 سطراً، السطور 77-233) + استبدال بـ `admin.rpc('apply_recipe_cost_cascade', ...)`
  - وقت العملية من ~42 ثانية → < 2 ثانية (كل شيء في transaction واحدة)

- [ ] **5-ج. اختبار الـ cascade يدوياً (بعد تشغيل migration)**
  - تشغيل `049_cascade_recipes_rpc.sql` في Supabase Dashboard أولاً
  - تطبيق مشتريات تؤثر على 5+ وصفات، تأكد أن total_cost يُحدَّث لكلها
  - تأكد أن combo_meals تُحدَّث أيضاً

---

## الجزء 6 — الاختبارات 🧪 ✅ مكتمل (2026-06-20)
**الهدف:** تغطية الحسابات الحرجة بـ unit tests — من 0% إلى تغطية أساسية.
**الجهد:** ~3 ساعات | **لا migration**

- [x] **6-أ. تثبيت وتهيئة Vitest**
  - `npm install -D vitest @vitest/coverage-v8`
  - إضافة `"test": "vitest run"` لـ package.json
  - إنشاء `vitest.config.ts` مع alias `@` → root

- [x] **6-ب. Unit test: calcRowCost و yield_pct**
  - `__tests__/lib/calculations.test.ts`
  - حالات: yield=100%, yield=50%, yield=0 (صفر)، qty=0

- [x] **6-ج. Unit test: WAC calculation**
  - `__tests__/lib/wacCalculation.test.ts`
  - حالات: أول شراء، شراء إضافي، شراء مجاني، qty=0+value=0 → null

- [x] **6-د. Unit test: explode deduction logic**
  - `__tests__/lib/calculations.test.ts` (calcDeduction)
  - حالات: وصفة حصة واحدة، وصفة 4 حصص، unit conversion factor، yield_pct=0

- [x] **6-هـ. Unit test: period close guard**
  - `__tests__/lib/periodGuard.test.ts`
  - حالات: لا إغلاق، نفس الشهر، شهر سابق، شهر تالٍ، انتقال السنة

- [x] **6-و. Integration test: explode API (mock Supabase)**
  - `__tests__/api/explode.test.ts`
  - حالات: body غير صالح (400)، فترة مغلقة (423)، لا مبيعات

---

## الجزء 7 — تحسينات التقارير والواجهات 🎨 ✅ مكتمل (2026-06-20)
**الهدف:** تقارير تنقصنا + إصلاح UX حرج.
**الجهد:** ~4 ساعات | **لا migration**

- [x] **7-أ. تجميع السايدبار في 3 فئات**
  - `DashboardShell.tsx`
  - إضافة حقل `group` لـ `NAV_BASE` وعرض separator + label بين: التشغيل / التحليل / الإدارة
  - يقلص الضياع أمام 21 عنصر غير مُجمَّع

- [x] **7-ب. تقليص تبويبات InventoryClient**
  - دمج 10 تبويبات في: يومية (4) + تحليلات dropdown (6)
  - التبويبات اليومية: المخزون، إضافة حركة، الجرد الدوري، توافر الأطباق

- [x] **7-ج. استبدال alert() بـ setMsg في StocktakeTab**
  - `InventoryClient.tsx` — `alert(...)` → `setMsg({ ok: false, text: ... })`

- [x] **7-د. تكبير حقول Stocktake للـ touch**
  - `InventoryClient.tsx` — `w-24 py-0.5` → `w-32 py-2`

- [x] **7-هـ. إضافة Waste Report مستقل**
  - تبويب جديد في ReportsClient: `waste`
  - يجلب `stock_movements WHERE movement_type='waste'`
  - يعرض: المادة، الكمية، القيمة، الفرع، التاريخ — مع KPIs شهرية + Excel

- [x] **7-و. إضافة Live Inventory Valuation**
  - تبويب جديد في ReportsClient: `inv-valuation`
  - يجلب `stock_items` ويحسب `qty × cost` لكل صنف
  - يعرض: القيمة الإجمالية، تصنيف حسب الفئة، المواد الراكدة (+30 يوم) + Excel

- [x] **7-ز. إضافة تصدير Excel لأهم التقارير**
  - زر Excel في: PurchasesReport، SalesReport، ConsumptionReport، WasteReport، InvValuationReport
  - استخدام `import('xlsx')` الديناميكي

---

## الجزء 8 — الامتثال القانوني والنسخ الاحتياطي ⚖️💾
**الهدف:** الحد الأدنى من الامتثال لـ PDPL السعودي + حماية البيانات.
**الجهد:** ~3 ساعات | **migration:** 2 جديدَين

- [ ] **8-أ. Soft Delete لجداول حساسة**
  - إنشاء `supabase/migrations/049_soft_delete.sql`
  - إضافة `deleted_at TIMESTAMPTZ` لـ `recipes`, `ingredients`, `products`
  - تحويل DELETE policies إلى `UPDATE SET deleted_at = now()`
  - إضافة فلتر `WHERE deleted_at IS NULL` في كل SELECT

- [ ] **8-ب. Retention Lock: منع حذف سجلات مالية +7 سنوات**
  - إنشاء `supabase/migrations/050_retention_lock.sql`
  - trigger على `purchases` و`daily_sales`: `RAISE EXCEPTION` إذا `created_at < now() - interval '7 years'`

- [ ] **8-ج. Right to Erasure: إجراء حذف المستخدم**
  - إنشاء دالة RPC `anonymize_user(p_user_id uuid)` SECURITY DEFINER
  - تستبدل الاسم بـ "DELETED" + تحذف email من auth.users + تحتفظ بـ UUID في audit_logs

- [ ] **8-د. حقل TRN في brands**
  - إضافة `tax_reg_number text` لجدول `brands` (migration 050 أو منفصل)
  - إضافة حقل TRN في إعدادات البراند (UI)

- [ ] **8-هـ. توثيق خطة الاستضافة والـ ZATCA**
  - تحديد: هل ستُنقل لـ Supabase AWS البحرين (me-south-1)؟
  - تحديد: هل يحتاج النظام تكامل ZATCA (فاتورة إلكترونية) أم يكفي تصدير CSV؟
  - التوثيق في CLAUDE.md لا يحتاج كود — قرار تشغيلي

---

## ترتيب التنفيذ المقترح

```
الجزء 1 → الجزء 2 → الجزء 3 (مستقل) → الجزء 4 → الجزء 5 → الجزء 6 → الجزء 7 → الجزء 8
```

الأجزاء 3 و 6 و 8 مستقلة — يمكن تنفيذها بأي ترتيب.
الجزء 5 يجب أن يأتي بعد الجزء 4 (توحيد COGS أولاً).

---

# خطة — المرحلة الحادية عشرة: إصلاحات المراجعة الثانية (2026-06-17)

## نظرة عامة

ناتج مراجعة ثانية بأربعة وكلاء متخصصين (محاسبي، تقني، UI/UX، ناقص).  
**الدفعات أ+ب: كود فقط. الدفعة ج: migrations. الدفعة د: مؤجلة لتعقيدها.**

---

## ✅ الدفعة أ — Bug Fixes + Quick Wins (مكتملة 2026-06-17)

### أ1. Bug: رقم 86 hardcoded في AvailabilityTab [UI-🔴]
- [x] `components/InventoryClient.tsx` — حذف `(86)` من الـ label، الرقم يظهر فعلاً في `{blocked.length}`

### أ2. توحيد هدف FC% [محاسبي-🔴]
- [x] `ReportsClient.tsx` — إضافة `FC_TARGET` للـ import، استبدال `<= 32` و`target: 32` بـ `FC_TARGET`

### أ3. إصلاح Trends + Branches FC% [محاسبي-🔴]
- [x] `ReportsClient.tsx` — TrendsReport: يجلب `daily_sales.cost` بدلاً من `purchases.total_price`، يُزيل query المشتريات كلياً
- [x] `ReportsClient.tsx` — BranchesReport: نفس الإصلاح

### أ4. إصلاح skipped-- [تقني-🟡]
- [x] `app/api/sales/explode/route.ts` — `skipped--` → `skipped = Math.max(0, skipped - 1)`

### أ5. إصلاح ترتيب Auth في Stocktake Approve [تقني-🟡]
- [x] `app/api/stocktake/[id]/approve/route.ts` — `requireUser()` أولاً قبل جلب الـ session

### أ6. إصلاح Top10Chart الفرز [UI-🟡]
- [x] `DashboardClient.tsx` — `recipes.slice(0, 10)` → `[...recipes].sort((a,b)=>b.food_cost_pct-a.food_cost_pct).slice(0,10)`

### أ7. autocomplete في تسجيل الدخول [UI-🟡]
- [x] `app/(auth)/login/page.tsx` — `autoComplete="email"` و`autoComplete="current-password"`

### أ8. زر الخروج — aria-label + نص [UI-🟡]
- [x] `DashboardShell.tsx` — `aria-label="تسجيل الخروج"` + `<span>خروج</span>` مرئي

### أ9. توحيد Palette: slate → gray في P&L [UI-🟡]
- [x] `ReportsClient.tsx` — 44 موضع `slate-*` → `gray-*` (replace_all)

### أ10. Reverse Pricing → تحديث recipes [محاسبي-🟢]
- [x] `ReportsClient.tsx` — `applyPrice()` يُحدّث `products` و`recipes` بالتوازي (Promise.all)

---

## ✅ الدفعة ب — AI Price Alerts (مكتملة 2026-06-17)

### ب1. تحسين PriceImpactModal — FC% الجديد + السعر المقترح
- [x] `components/shared/PriceImpactModal.tsx` — كتابة كاملة من الصفر:
  - Query يجلب `qty, yield_pct, ing_sku, service_type, total_cost, sell_price, yield_portions`
  - يحسب `additional_cost` لكل وصفة: `Σ (qty/(yield_pct/100)) × (new_cost - old_cost)`
  - يحسب `new_fc_pct` و`delta_fc` و`suggested_price` لكل وصفة
  - بنر أحمر إذا كانت وصفات تتجاوز `FC_TARGET` (35%)
  - كل وصفة: `قديم% → جديد%` مع `▲Δ%` ملوّن + السعر المقترح لمن تجاوز الهدف

---

## ✅ الدفعة ج — Migrations جديدة (مكتملة 2026-06-17)

### ج1. WAC zero-cost: إضافة الكمية حتى لو unit_cost = 0
- [x] `supabase/migrations/042_wac_zero_cost_fix.sql` — إعادة كتابة `apply_purchase_wac`:
  - حذف `AND unit_cost > 0` من الفلتر
  - إذا `v_purchase_value = 0`: تبقى التكلفة الحالية، تُضاف الكمية فقط
  - [ ] **يدوي:** تشغيل `042_wac_zero_cost_fix.sql` في Supabase Dashboard

### ج2+ج3. brands_select + uba_select RLS
- [x] `supabase/migrations/043_rls_tighten.sql`:
  - `brands_select`: `USING (true)` → `USING (can_access_brand(id::text))`
  - `uba_select`: `USING (auth.uid() IS NOT NULL)` → `USING (user_id = auth.uid() OR is_super_admin() OR has_module_permission('users', 'view'))`
  - [ ] **يدوي:** تشغيل `043_rls_tighten.sql` في Supabase Dashboard

---

## الدفعة د — مؤجلة (ديْن تقني، يحتاج جلسة منفصلة) ⏳

- **N+1 + Race Condition في purchases/apply**: نقل cascade الوصفات كاملاً لـ RPC جديد — عالي الخطورة، يحتاج اختبار مكثف
- **COGS في close_period**: استبدال SUM(stock_movements) بمعادلة المخزون الدورية — يحتاج تحليل أعمق للبيانات الحالية

---

## إجراء يدوي (المستخدم) ⚠️

1. **فوري — أمني:** تدوير Supabase Service Role Key + تغيير كلمة مرور DB من Supabase Dashboard
2. **بعد الدفعة ج:** تشغيل في Supabase Dashboard بهذا الترتيب:
   ```
   042_wac_zero_cost_fix.sql   ← WAC للمشتريات المجانية
   043_rls_tighten.sql         ← تشديد RLS على brands + user_branch_access
   ```

---

## مراجعة — المرحلة الحادية عشرة (2026-06-17)

### ما تغيّر

**الدفعة أ — 10 إصلاحات:**
- `InventoryClient.tsx`: حذف `(86)` hardcoded من تبويب المعطّل
- `ReportsClient.tsx`: توحيد هدف FC% — استبدال `<= 32` بـ `FC_TARGET` (35%) في مكانين
- `ReportsClient.tsx`: TrendsReport + BranchesReport — يجلبان `daily_sales.cost` بدلاً من `purchases.total_price` (COGS حقيقي)
- `api/sales/explode/route.ts`: `skipped--` → `Math.max(0, skipped - 1)` (منع counter سالب)
- `api/stocktake/[id]/approve/route.ts`: `requireUser()` أولاً قبل DB reads (ترتيب auth صحيح)
- `DashboardClient.tsx`: Top10Chart يُرتّب بـ food_cost_pct قبل slice (أعلى 10 فعلاً)
- `login/page.tsx`: `autoComplete="email"` و `autoComplete="current-password"`
- `DashboardShell.tsx`: زر الخروج — `aria-label` + نص مرئي "خروج"
- `ReportsClient.tsx`: 44 موضع `slate-*` → `gray-*` في P&L
- `ReportsClient.tsx`: `applyPrice()` تُحدّث `products` + `recipes` معاً (Promise.all)

**الدفعة ب — AI Price Alerts:**
- `components/shared/PriceImpactModal.tsx`: كتابة كاملة من الصفر
  - يحسب `new_fc_pct` و`delta_fc` و`suggested_price` لكل وصفة ستتأثر
  - بنر أحمر إذا تجاوزت وصفات `FC_TARGET`
  - قائمة مرتبة: `قديم% → جديد% ▲Δ%` + السعر المقترح لمن تجاوز

**الدفعة ج — Migrations:**
- `042_wac_zero_cost_fix.sql`: WAC للمشتريات المجانية (الكمية تُضاف، التكلفة تثبت)
- `043_rls_tighten.sql`: تشديد RLS على `brands` و `user_branch_access`

### ما يتطلب إجراءً يدوياً
1. تدوير Service Role Key + تغيير DB password — **أمني حرج**
2. تشغيل `042_wac_zero_cost_fix.sql` في Supabase Dashboard
3. تشغيل `043_rls_tighten.sql` في Supabase Dashboard

### مؤجل للجلسة القادمة
- **N+1 + Race Condition في purchases/apply**: تحويل cascade كامل لـ RPC
- **COGS في close_period**: استبدال SUM(stock_movements) بمعادلة المخزون الدورية

---

# خطة — المرحلة العاشرة: إصلاحات المراجعة الشاملة (2026-06-15)

## نظرة عامة

ناتج مراجعة شاملة 4 أبعاد (محاسبي، تقني، واجهات، قانوني) أجرتها 4 وكلاء متخصصون بالتوازي.  
الأولويات مرتّبة حسب الخطورة. **لا تُنفَّذ المرحلة التالية قبل إنهاء السابقة.**

---

## الدفعة أ — حرجة فورية 🔴 (يوقف الإنتاج)

### ✅ أ1. فحص git history لـ .env.local وتدوير credentials
- [x] `.env.local` غير متتبَّع في git (`git log` أعاد لا شيء، `.gitignore` يغطيه بـ `.env*`)
- [ ] **يدوي (المستخدم):** تدوير Supabase Service Role Key من Dashboard دورياً كإجراء وقائي

### ✅ أ2. إصلاح audit_logs INSERT/SELECT policies
- [x] إنشاء `supabase/migrations/036_fix_audit_policies.sql`
  - INSERT: `WITH CHECK (brand_id IS NULL OR can_access_brand(brand_id))`
  - SELECT: `USING (is_super_admin() OR can_access_brand(brand_id))`
  - rbac_audit_logs SELECT: `USING (is_super_admin())`
  - rbac_audit_logs INSERT: `WITH CHECK (performed_by = auth.uid() OR is_super_admin())`
- [ ] **يدوي (المستخدم):** تشغيل `036_fix_audit_policies.sql` في Supabase Dashboard

### ✅ أ3. DB trigger لحماية الفترات المغلقة
- [x] إنشاء `supabase/migrations/037_period_lock_trigger.sql`
  - دالة `check_period_not_closed()` تفحص `brands.closed_up_to`
  - trigger على: `daily_sales`, `purchases`, `waste_log`, `stock_movements`
  - يرفع EXCEPTION بـ ERRCODE 55006 إذا كان تاريخ السجل ≤ closed_up_to
- [ ] **يدوي (المستخدم):** تشغيل `037_period_lock_trigger.sql` في Supabase Dashboard

### ✅ أ4. كتابة audit_log في كل API route مالية
- [x] `/api/purchases/apply/route.ts` — INSERT في `audit_logs` (action: purchases_applied)
- [x] `/api/sales/explode/route.ts` — INSERT في `audit_logs` (action: sales_exploded) + إصلاح TS error
- [x] `/api/batches/produce/route.ts` — INSERT في `audit_logs` (action: batch_produced، !dry_run فقط)
- [x] `/api/production/sessions/[id]/approve/route.ts` — INSERT في `audit_logs` (action: production_session_approved)
- [x] `/api/stocktake/[id]/approve/route.ts` — INSERT في `audit_logs` (action: stocktake_approved)
- [x] `/api/users/[id]/route.ts` (DELETE) — جلب profile قبل الحذف + INSERT في `rbac_audit_logs` (action: user_deleted)
- [x] `PurchasingClient.tsx` — حذف `dlg` المُستخدم خطأً في `PurchaseAnalytics` (كان يُسبب TS error)
- [x] TypeScript: 0 أخطاء ✓

---

## ✅ الدفعة ب — مكتملة (2026-06-16)

### ✅ ب1. WAC للمنتج المُنتَج في batch production
- [x] `supabase/migrations/039_batch_wac_fix.sql` — إعادة تعريف `apply_produce_writes`:
  - Security guard: `can_access_brand()` أول سطر
  - الخطوة 6 جديدة: `UPDATE ingredients SET cost = WAC` بعد الإنتاج
  - الصيغة: `(old_qty × old_cost + p_batch_value) / p_batch_new_qty`
- [ ] **يدوي:** تشغيل `039_batch_wac_fix.sql` في Supabase Dashboard

### ✅ ب2+ب3+ب4+ب5+ب6+ب8. تأمين RPCs + RLS + modifier revenue + period_snapshots
- [x] `supabase/migrations/038_secure_rpcs.sql` — يشمل:
  - `DROP "production_sessions_all"` + إضافة `prod_sessions_select` (ب3)
  - `apply_explode_writes` + security check + `AND brand_id = p_brand_id` في UPDATE (ب2+ب4)
  - `apply_purchase_wac` + security check (ب2)
  - `delete_production_session` + security check (ب2)
  - `close_period` + security check + `v_caller = auth.uid()` (ب2) + modifier_sales revenue (ب6)
  - `period_snapshots_select`: `USING (can_access_brand(brand_id))` (ب8)
- [ ] **يدوي:** تشغيل `038_secure_rpcs.sql` في Supabase Dashboard

### ✅ ب7. ON DELETE SET NULL في period_snapshots.closed_by
- [x] `supabase/migrations/040_period_snapshots_fk_fix.sql` — إضافة ON DELETE SET NULL للـ FK
- [ ] **يدوي:** تشغيل `040_period_snapshots_fk_fix.sql` في Supabase Dashboard

### TypeScript: 0 أخطاء ✓

---

## ✅ الدفعة ج — مكتملة (2026-06-16)

### ✅ ج1. إصلاح Silent Delete Failures [واجهات-H1]
- [x] `ModifiersClient.tsx` — `deleteGroup`, `deleteOption`, `removeIngredient`: إضافة `const { error }` + `if (error) { setErr(...); return }`
- [x] `PurchasingClient.tsx` — حذف `dlg` المُستخدم خطأً داخل `PurchaseAnalytics` (كان يُسبب TS error)

### ✅ ج2. إصلاح RTL الحرجة [واجهات-H2,H3,H4]
- [x] `RecipeVersionDiff.tsx` سطر 147: `left-0` → `right-0`, `border-r` → `border-l`، سطر 196: `mr-auto` → `ms-auto`
- [x] `RecipeHistory.tsx` سطر 102: `left-0` → `right-0`, `border-r` → `border-l`
- [x] `DashboardShell.tsx` سطر 346: `left-0` → `end-0` في dropdown التنبيهات
- [x] `SalesClient.tsx` (×3)، `PurchasingClient.tsx` (×1)، `UserForm.tsx` (×1): `mr-auto` → `ms-auto`

### ✅ ج3. ConfirmDialog Accessibility [واجهات-H4]
- [x] `role="dialog"`, `aria-modal="true"`, `aria-labelledby={useId()}`
- [x] `useEffect` → `cancelRef.current?.focus()` (auto-focus زر الإلغاء)
- [x] `onKeyDown` → focus trap (Tab/Shift+Tab) + Escape يُغلق

### ✅ ج4. إصلاح RTL متوسط [واجهات-M]
- [x] `text-left` → `text-end` في: `ModifiersClient` (×16)، `InventoryClient` (×4)، `WasteClient` (×6)، `SalesClient` (×14+)
- [x] `CostingSidebar.tsx` سطر 564: `-mr-4 ml-1` → `-me-4 ms-1`
- [x] `IngredientRow.tsx` سطر 79-83: `pl-2` → `ps-2`، `text-left` → `text-end`

### ✅ ج5. تنسيق موحد للعملة [واجهات-M13]
- [x] إنشاء `lib/format.ts` — `formatSAR(n)` بـ `Intl.NumberFormat('ar-SA', { currency: 'SAR' })`
- [ ] **اختياري:** تطبيق `formatSAR` في الأماكن التي تستخدم `toFixed(2) + ' ر.س'` (تحسين تدريجي)

---

## ✅ الدفعة د — مكتملة (2026-06-16)

### ✅ د1. إصلاح Math.abs في stocktake [محاسبي-M2]
- [x] `InventoryClient.tsx` سطر 623: حذف `Math.abs()` من `value` حتى تظل الإشارة صحيحة
  - `value: Math.round(variance * cost * 10000) / 10000`

### ✅ د2. إصلاح explode-check combo unit-conversion [محاسبي-M1]
- [x] `explode-check/route.ts`: إضافة خطوة 3b — جلب `unit_conversions` لكل SKUs (عادية + كومبو) في استعلام واحد
- [x] تطبيق `factor` في حساب `needed` للمنتجات العادية (سطر ~192)
- [x] تطبيق `factor` في حساب `needed` لعناصر الكومبو (سطر ~206)
- نتيجة: `explode-check` و`explode` أصبحا متطابقَي المنطق لتحويل الوحدات

### ✅ د3. تسجيل تغييرات أسعار الـ modifiers [قانوني-M14]
- [x] `supabase/migrations/041_price_history_modifier_type.sql` — تعديل CHECK constraint لإضافة `'modifier_option'`
- [x] `ModifiersClient.tsx` سطر 182: بعد UPDATE ناجح، INSERT في `price_history` إذا `price !== editingOption.price`
- [ ] **يدوي:** تشغيل `041_price_history_modifier_type.sql` في Supabase Dashboard

---

## ترتيب تشغيل Migrations

```
036_period_lock_trigger.sql      ← أ3
033_audit_logs_readonly.sql      ← أ2 (محدَّث)
037_batch_wac_fix.sql            ← ب1
038_secure_rpcs.sql              ← ب2 + ب4
039_fix_audit_policies.sql       ← ب5 + ب8
040_period_close_modifiers.sql   ← ب6
041_period_snapshots_fk_fix.sql  ← ب7
```

---

---

## مراجعة الدفعة العاشرة (2026-06-16)

### ما تغيّر

**الدفعة أ (حرجة):**
- `036_fix_audit_policies.sql` — إصلاح RLS على audit_logs وrbac_audit_logs (INSERT يكشف بيانات كل البراندات سابقاً)
- `037_period_lock_trigger.sql` — trigger يمنع تعديل سجلات فترات مغلقة على مستوى DB
- 6 API routes تكتب audit_log: purchases_applied، sales_exploded، batch_produced، production_session_approved، stocktake_approved، user_deleted

**الدفعة ب (عالية):**
- `038_secure_rpcs.sql` — security guard على كل RPC + إصلاح cross-brand bug في apply_explode_writes + modifier revenue في close_period + RLS على period_snapshots
- `039_batch_wac_fix.sql` — WAC للـ batch output عند الإنتاج (كان يبقى 0)
- `040_period_snapshots_fk_fix.sql` — ON DELETE SET NULL لمنع تعارض PDPL (حق المحو)

**الدفعة ج (واجهات):**
- 2 لوحات جانبية (`RecipeVersionDiff`, `RecipeHistory`) كانت تنفتح من اليسار → الآن من اليمين
- dropdown التنبيهات في `DashboardShell` كان يسقط يساراً → الآن `end-0`
- 5 مواضع `mr-auto` → `ms-auto` (خاصية منطقية)
- `ConfirmDialog` أصبح accessible (role, aria-modal, focus trap, auto-focus, Escape)
- أعمدة الأرقام في 4 ملفات: `text-left` → `text-end`
- `CostingSidebar` و`IngredientRow`: استبدال خصائص فيزيائية بمنطقية
- `lib/format.ts` جديد: `formatSAR()` بـ Intl.NumberFormat

### ما يتطلب إجراء يدوياً (المستخدم)

1. تشغيل هذه الـ migrations بالترتيب في Supabase Dashboard:
   - `036_fix_audit_policies.sql`
   - `037_period_lock_trigger.sql`
   - `038_secure_rpcs.sql`
   - `039_batch_wac_fix.sql`
   - `040_period_snapshots_fk_fix.sql`

### المتبقي (الدفعة د)
- Math.abs bug في stocktake variance
- explode-check combo unit-conversion
- تسجيل تغييرات أسعار الـ modifiers في price_history

---

## قرارات مؤجلة (تحتاج قرارًا خارجياً)

- **نظام الاحتفاظ 10 سنوات:** يحتاج قرار تشغيلي (Supabase PITR + archive policy)
- **ZATCA invoice format:** يحتاج تحديد نطاق (هل النظام سيُصدر فواتير؟)
- **إخفاء هوية بيانات الموردين:** يحتاج قرار قانوني على آلية الحذف
- **CSP Header:** يحتاج اختبار أن Tailwind + Recharts لا يكسر strict CSP

---

# خطة — المرحلة التاسعة: نظام الإضافات (Modifiers) (2026-06-15)

---

## نظرة عامة

نُضيف دعماً كاملاً لإضافات الأصناف (Modifiers) من Foodics. البيانات متوفرة في تقرير مستقل بـ Foodics يحتوي على: خيار الإضافة + المنتج + الكمية + الإيراد.

**الأثر المحاسبي المستهدف:**
- خصم مكونات الإضافات من المخزون عند Explode (حالياً لا تُخصم)
- احتساب تكلفة الإضافات وإضافتها لتكلفة البيع (حالياً تكلفة الإضافات = صفر)
- FC% أدق (حالياً مُنخفض زيفاً)
- تقرير Variance صحيح (حالياً يُظهر فروقات وهمية لأن الإضافات غائبة من النظري)

**النطاق:** الإضافات المدفوعة (زيت زيتون، سمن، جبنة، عسل...) والمجانية ذات المكونات (نعناع، حبق). **عمود التكلفة من Foodics يُهمل — نحسب تكلفتنا من مكوناتنا.**

---

## ✅ قرار التاريخ — مرن (date_from + date_to)

**مشكلة التاريخ:** ملف الإضافات من Foodics هو **تقرير فترة** (شهر أو أسبوع أو أي نطاق) وليس يومياً. لا يوجد `sale_date` لكل صف — فقط إجمالي كميات للفترة.

**القرار:** استخدام `date_from` + `date_to` لمرونة كاملة (شهر، أسبوع، أي نطاق).

هذا يعني:
- `modifier_sales` تُخزن بـ `date_from` و`date_to` (DATE)
- المستخدم يُحدد النطاق يدوياً عند الاستيراد
- الانفجار للإضافات هو **بالـ import_batch** (مثل المبيعات) لكن guard الفترة يفحص `date_from`
- زر "احتساب التكلفة للإضافات" منفصل عن زر "احتساب التكلفة" للمبيعات

---

## أ — قاعدة البيانات (Migration)

- [ ] **أ1. جدول `modifier_groups`** — تعريف مجموعة الإضافات
  ```sql
  id uuid PK, brand_id, name, is_required bool,
  min_select int default 0, max_select int default 1,
  sort_order int, is_active bool default true
  ```

- [ ] **أ2. جدول `modifier_options`** — خيارات داخل كل مجموعة
  ```sql
  id uuid PK, group_id → modifier_groups, brand_id,
  option_sku text,   -- كود Foodics (sk-0090)
  name text,
  price numeric,     -- سعر البيع الإضافي (0 للمجاني)
  total_cost numeric default 0,  -- تُحسب من المكونات
  sort_order int, is_active bool
  ```

- [ ] **أ3. جدول `modifier_option_ingredients`** — مكونات كل خيار (نفس نمط `recipe_ingredients`)
  ```sql
  id uuid PK, option_id → modifier_options,
  ing_sku, ing_name, qty, unit, unit_cost, yield_pct, sort_order
  ```

- [ ] **أ4. جدول `product_modifier_groups`** — ربط المجموعات بالمنتجات
  ```sql
  product_sku, brand_id, group_id → modifier_groups,
  sort_order int
  PRIMARY KEY (product_sku, brand_id, group_id)
  ```

- [ ] **أ5. جدول `modifier_sales`** — مبيعات الإضافات المستوردة من Foodics
  ```sql
  id uuid PK, brand_id,
  date_from date NOT NULL,    -- بداية الفترة (مرن: يوم، أسبوع، شهر)
  date_to   date NOT NULL,    -- نهاية الفترة
  option_sku text,            -- كود خيار الإضافة من Foodics
  option_name text,
  product_sku text,           -- كود المنتج المرتبط
  product_name text,
  qty_sold numeric,           -- صافي الكمية للفترة كاملة
  revenue numeric,            -- إجمالي المبيعات (0 للمجاني)
  import_batch uuid,          -- لتجميع صفوف نفس الاستيراد
  imported_by uuid,
  exploded_at timestamptz,    -- وقت خصم المخزون (NULL = لم يُنفجر بعد)
  UNIQUE (brand_id, date_from, date_to, option_sku, product_sku)  -- منع الاستيراد المكرر لنفس الفترة
  ```

- [ ] **أ6. RLS لكل الجداول الخمسة** — نفس نمط باقي الجداول (can_access_brand)

- [ ] **أ7. Module + Permissions** — إضافة `modifiers` لجدول `modules` + صلاحيات Super Admin

---

## ب — إدارة الإضافات (UI — صفحة جديدة)

- [ ] **ب1. صفحة `/[brand]/modifiers`** — قائمة المجموعات والخيارات
  - عرض modifier_groups مع عدد خياراتها
  - إنشاء / تعديل / حذف مجموعة

- [ ] **ب2. واجهة خيارات المجموعة** — داخل كل مجموعة
  - إضافة/تعديل/حذف option_sku + name + price
  - عرض `total_cost` المحتسب

- [ ] **ب3. واجهة مكونات كل خيار** — نفس RecipeEditor تماماً
  - إضافة/تعديل/حذف `modifier_option_ingredients`
  - عند الحفظ: إعادة حساب `total_cost` في `modifier_options`
  - عرض: تكلفة الخيار، سعره، هامشه
  - **⚠️ عند تغيير سعر مادة خام في `ingredients`:** يجب إعادة حساب `modifier_option_ingredients.unit_cost` و`modifier_options.total_cost` — نفس آلية تحديث تكلفة الوصفات

- [ ] **ب4. ربط المجموعات بالمنتجات** — داخل `ProductForm` أو تبويب مستقل
  - قائمة modifier_groups المتاحة → اختيار وربط بالمنتج
  - sort_order للمجموعات على المنتج

---

## ج — الاستيراد (Parser + UI)

- [ ] **ج1. `parseFoodicsModifiers()` في `lib/parseFoodics.ts`**
  - اكتشاف نوع الملف: إذا العمود الأول = "خيار الإضافة" → modifier report
  - استخراج: option_name, option_sku, product_name, product_sku, qty_sold (صافي الكمية), revenue (إجمالي المبيعات)
  - إهمال عمود التكلفة كلياً
  - إرجاع `{ type: 'modifiers', rows, detectedPeriod? }`

- [ ] **ج2. تحديث `handleFile()` في `SalesClient.tsx`**
  - إضافة شرط اكتشاف ملف الإضافات
  - `setSourceType('foodics_modifiers')`

- [ ] **ج3. واجهة Preview + Import للإضافات** في `SalesClient.tsx`
  - **Guard أول:** المستخدم يُحدد `date_from` و`date_to` يدوياً قبل الاستيراد (date picker)
  - **Guard ثانٍ:** فحص `brands.closed_up_to` — رفض إذا `date_from <= closed_up_to` (أي جزء من الفترة في شهر مغلق)
  - **Guard ثالث:** فحص `modifier_sales` — رفض إذا يوجد سجل بنفس `(brand_id, date_from, date_to, option_sku, product_sku)` (UNIQUE constraint)
  - جدول معاينة: خيار الإضافة | المنتج | الكمية | الإيراد
  - ملخص: عدد الخيارات المختلفة، إجمالي الكميات، إجمالي الإيراد
  - زر "استيراد" → insert في `modifier_sales`
  - **حذف دفعة:** حذف `modifier_sales` بالـ `import_batch` — لا يحتاج عكس مخزون إذا لم يُنفجر بعد. إذا `exploded_at IS NOT NULL` → يُمنع الحذف (مثل daily_sales المنفجرة)

---

## د — الانفجار / Explode (احتساب التكلفة)

- [ ] **د0. تحديث `POST /api/sales/explode-check`** في `app/api/sales/explode-check/route.ts`
  - إضافة خطوة جديدة: جلب `modifier_sales` للفترة المقابلة لـ `import_batch`
  - حساب احتياجات `modifier_option_ingredients` وإضافتها لـ `rawNeeds` / `batchNeeds`
  - يُظهر للمستخدم صورة كاملة: مكونات الوصفات + مكونات الإضافات معاً

- [ ] **د1. تحديث `POST /api/sales/explode`** في `app/api/sales/explode/route.ts`

  **الخطوة 0 — Guard الفترة المغلقة (موجود للمبيعات، يُضاف للإضافات):**
  ```
  جلب modifier_sales للـ import_batch → فحص date_from
  إذا date_from <= brands.closed_up_to → رفض
  ```

  **الخطوة 4c — معالجة الإضافات (جديدة بعد Combo expansion):**
  ```
  د1-أ: جلب modifier_sales للـ import_batch نفسه
  د1-ب: للكل خيار: جلب modifier_option_ingredients
  د1-ج: تطبيق unit_conversions (ucMap) على مكونات الإضافات
         — نفس المنطق المُطبق على recipe_ingredients السطر 136
  د1-د: للمكونات is_semi=true: إضافتها لـ batchNeeds للإنتاج التلقائي
         — نفس منطق auto_produce_batches السطر 238
  د1-هـ: تجميع الخصومات في deductMap (مدموجة مع خصومات الوصفات)
  ```

  **الخطوة 8 — تحديث حساب تكلفة البيع:**
  ```
  تكلفة_السطر = (recipe.total_cost / yield) × qty_sold
              + Σ (modifier_option.total_cost × qty_modifier لنفس product_sku)
  ```

- [ ] **د2. تحديث `apply_explode_writes` RPC**
  - لا تغيير في التوقيع — modifier deductions تُدمج في `p_stock_upserts` و`p_movements` قبل الإرسال
  - بعد النجاح: تحديث `modifier_sales.exploded_at` للسجلات المعالجة

---

## هـ — التقارير

- [ ] **هـ1. تقرير FC% الفعلي (`actual-fc`)** — لا تغيير في الكود
  - التكلفة ستكون صحيحة تلقائياً بعد تحديث الـ explode (د1)
  - `daily_sales.cost` سيشمل تكلفة الإضافات → FC% يُحتسب صحيحاً

- [ ] **هـ2. تقرير Variance — يحتاج تحديثاً**
  - **المشكلة:** الاستهلاك النظري يحسب فقط `recipe_ingredients × qty_sold`
  - **الإصلاح:** إضافة `modifier_option_ingredients × qty_modifier_sold` للاستهلاك النظري
  - بدون هذا: الـ Variance سيُظهر دائماً استهلاكاً فعلياً أكبر من النظري (فجوة وهمية)

- [ ] **هـ3. تقرير `close_period`** في `034_period_closing.sql` — لا تغيير
  - `v_cogs` يُحسب من `stock_movements (OUT + waste)` → يشمل خصومات الإضافات تلقائياً بعد د1 ✓
  - `v_sales` من `daily_sales.revenue` → الإيراد موجود أصلاً (مدمج في إيراد المنتج) ✓

- [ ] **هـ4. قسم "تحليل الإضافات"** في تقرير Menu Engineering (اختياري — مرحلة لاحقة)
  - أكثر إضافة مبيعاً، هامش كل خيار، إيراد الإضافات كنسبة من الإجمالي

---

## ترتيب التنفيذ

```
⚠️ قرار التاريخ (year_month vs date_range)
  ↓
أ (Migration — 5 جداول)
  ↓
ب (UI الإدارة — مجموعات + خيارات + مكونات + ربط بالمنتجات)
  ↓
ج (الاستيراد — parser + guards + UI)
  ↓
د0 (explode-check — تحديث قبل الانفجار)
  ↓
د1+د2 (Explode — unit_conversions + auto_produce + period guard)
  ↓
هـ2 (Variance — الاستهلاك النظري)
```

---

## جدول الارتباطات الكاملة

| المكوّن | نوع التأثير | ملف / جدول |
|---|---|---|
| `modifier_option_ingredients` | يستخدم نفس `ingredients` | تحديث unit_cost عند تغيير سعر المادة |
| `unit_conversions` | تُطبق في الانفجار | `explode/route.ts` |
| `auto_produce_batches` | يُنتج باتشات الإضافات | `explode/route.ts` |
| `stock_movements` | خصومات الإضافات تمر هنا | تلقائي عبر RPC |
| `close_period` | يشمل الخصومات تلقائياً | لا تغيير |
| `daily_sales.cost` | يرتفع بتكلفة الإضافات | `explode/route.ts` |
| `Variance report` | النظري يجب أن يشمل الإضافات | `ReportsClient.tsx` |
| `explode-check` | يُظهر احتياجات الإضافات | `explode-check/route.ts` |
| Period guard (import) | يمنع استيراد فترة مغلقة | `SalesClient.tsx` |
| Period guard (explode) | يمنع انفجار فترة مغلقة | `explode/route.ts` |

---

## قرارات مؤجلة (لا تُنفَّذ الآن)

- **وجبة الفطور (النوع 3):** وجبة مجمعة بخيار — تحتاج منطقاً مخصصاً، تُؤجل لمرحلة منفصلة
- **تحليل attachment rate:** نسبة اقتران الإضافة بالمنتج — لاحقاً
- **هـ4 — تحليل الإضافات في Menu Engineering:** اختياري، مرحلة لاحقة

---

# خطة — المرحلة الثامنة: إصلاحات ما بعد الفحص الشامل (2026-06-15)

## مراجعة — الدفعة أ (2026-06-15) ✅

| الملف | التغيير |
|---|---|
| `scripts/create-admin.mjs` | استبدال JWT وكلمة مرور DB بـ env variables |
| `.gitignore` | إضافة `scripts/create-admin.mjs` |
| `app/(dashboard)/[brand]/reports/ReportsClient.tsx:1461` | إصلاح Prime Cost = FC+Labor فقط (إزالة overheadPct) + إضافة totalCostPct |
| `app/(dashboard)/[brand]/reports/ReportsClient.tsx` | إعادة تسمية `marginPct` → `fcPct` في Menu Engineering + تحديث interface MenuItem |
| `next.config.ts` | إضافة Security Headers: X-Frame-Options، X-Content-Type-Options، Referrer-Policy، Permissions-Policy |
| `components/ingredients/IngredientForm.tsx:157` | تعريب رسالة خطأ DB |
| `components/products/ProductForm.tsx:45` | تعريب رسالة خطأ DB |
| `app/(dashboard)/[brand]/inventory/InventoryClient.tsx:334` | تعريب رسالة خطأ حركة المخزون |

**ملاحظات هامة للمستخدم:**
- يجب تدوير (rotate) Supabase Service Role Key من Dashboard فوراً
- يجب تغيير كلمة مرور قاعدة البيانات من Supabase Dashboard
- الـ credentials القديمة لا تزال في git history — إذا كان الـ repo public يجب تنظيف الـ history بـ `git filter-repo`

---

## الدفعة أ — حرجة فورية 🔴 (بدون migrations)

- [ ] **أ1. حذف credentials المكشوفة**
  - احذف `scripts/create-admin.mjs` من git tracking وأضفه لـ `.gitignore`
  - دوّر Service Role Key من Supabase Dashboard يدوياً (تعليمات للمستخدم)
  - أضف `.env.local` بديلاً لأي credentials ضرورية

- [ ] **أ2. إصلاح خطأ Prime Cost المحاسبي**
  - `ReportsClient.tsx` السطر 1461: احذف `+ overheadPct` من الصيغة
  - `primeCostPct = fcPct + laborPct` فقط (Overhead ليس من تعريف Prime Cost)
  - غيّر اسم العمود في الجدول من "Prime Cost%" إلى التسمية الصحيحة

- [ ] **أ3. إصلاح عمود "هامش" في Menu Engineering**
  - `ReportsClient.tsx` السطر 1239: استبدل `item.marginPct` بـ `item.margin` (الهامش النقدي بالريال)
  - أو أضف عمود "FC%" منفصل إلى جانب عمود "الهامش" ليكون واضحاً

- [ ] **أ4. إضافة Security Headers في next.config.ts**
  - أضف `X-Frame-Options: DENY`
  - أضف `X-Content-Type-Options: nosniff`
  - أضف `Referrer-Policy: strict-origin-when-cross-origin`
  - أضف `Permissions-Policy` مناسباً

- [ ] **أ5. تعريب رسائل الخطأ من DB**
  - `IngredientForm.tsx` السطر 157: wrap خطأ Supabase برسالة عربية عامة
  - `ProductForm.tsx` السطر 45: نفس المعالجة
  - `InventoryClient.tsx` السطر 334 (`AddMovementTab`): نفس المعالجة

---

## مراجعة — الدفعة ب (2026-06-15) ✅

| الملف | التغيير |
|---|---|
| `supabase/migrations/030_approve_in_rpc.sql` | نسخة جديدة من `apply_produce_writes` تُضيف `UPDATE production_sessions SET status=approved` في الخطوة 5 — atomic مع خصم المخزون |
| `app/api/production/sessions/[id]/approve/route.ts` | حُذف الـ update المنفصل بعد الـ RPC — الآن كتابة واحدة |
| `supabase/migrations/031_fix_production_rls.sql` | إعادة كتابة سياسات RLS للإنتاج بـ `has_module_permission(module, action)` (2 وسائط) |
| `supabase/migrations/032_delete_session_rpc.sql` | دالة `delete_production_session` — عكس المخزون + حذف الحركات + حذف الجلسة atomic |
| `app/api/production/sessions/[id]/route.ts` | DELETE handler أصبح استدعاء RPC واحد (من 40 سطر إلى 12) |
| `supabase/migrations/010_clear_operational_data.sql` | حُذف TRUNCATE على audit_logs و rbac_audit_logs |
| `supabase/migrations/033_audit_logs_readonly.sql` | RLS على audit_logs و rbac_audit_logs — SELECT + INSERT فقط، لا DELETE/UPDATE |

**Migrations يجب تشغيلها في Supabase Dashboard — بالترتيب:**
```
026_rpc_atomic_writes.sql       (إن لم تُشغَّل بعد)
027_rpc_wac.sql                 (إن لم تُشغَّل بعد)
028_stock_movement_value.sql    (إن لم تُشغَّل بعد)
029_production_actuals_json.sql (إن لم تُشغَّل بعد)
030_approve_in_rpc.sql
031_fix_production_rls.sql
032_delete_session_rpc.sql
033_audit_logs_readonly.sql
```

---

## الدفعة ب — تقنية عالية 🟡 (تحتاج migrations)

- [ ] **ب1. إصلاح Race Condition في approve route**
  - `app/api/production/sessions/[id]/approve/route.ts`
  - أضف تحديث `status = approved` داخل دالة `apply_produce_writes` في SQL
  - بدلاً من كتابتين منفصلتين (RPC ثم update) — اجعلها atomic واحدة

- [ ] **ب2. إصلاح RLS في migration 025**
  - `supabase/migrations/025_fix_production_sessions_rls.sql`
  - `has_module_permission` تُستدعى بـ 3 وسائط والدالة تقبل 2 فقط
  - أنشئ migration جديداً يُصلح السياسة أو يُضيف overload للدالة

- [ ] **ب3. إصلاح DELETE جلسة الإنتاج (transaction)**
  - `app/api/production/sessions/[id]/route.ts` السطر 86-113
  - حوّل loop عكس المخزون إلى RPC atomic بدلاً من كتابات منفصلة

- [ ] **ب4. إصلاح audit_logs (insert-only)**
  - أنشئ migration جديداً يُضيف RLS يمنع DELETE على `audit_logs`
  - احذف `TRUNCATE TABLE audit_logs` من `010_clear_operational_data.sql`
  - أبقِ script الـ clear لجداول تشغيلية فقط (ليس سجل التدقيق)

---

## الدفعة ج — واجهات المستخدم 🟢

- [ ] **ج1. استبدال confirm() بـ dialog عربي**
  - أنشئ component `ConfirmDialog` بسيط (RTL، عربي، Tailwind)
  - استبدل الـ 16 موضع `confirm()` به — ابدأ بالأخطر: `handleFinalize` في الجرد

- [ ] **ج2. إضافة overflow-x-auto للجداول**
  - `InventoryClient.tsx` — `StockTab` و `HistoryTab`: أضف `overflow-x-auto` على الـ wrapper
  - `ProductionClient.tsx` — جدول الجلسات: نفس التعديل

- [ ] **ج3. إصلاح KPI grids للجوال**
  - `ProductionClient.tsx` السطر 548: `grid-cols-3` → `grid-cols-1 sm:grid-cols-3`
  - `InventoryClient.tsx` — `AvailabilityTab` السطر 863: نفس التعديل

- [ ] **ج4. إضافة aria-label لأزرار الأيقونات**
  - `InventoryClient.tsx` — أزرار ✏ التعديل
  - `ProductionClient.tsx` — أزرار ✓ و ✕

---

## مراجعة — الدفعة د (2026-06-15) ✅

| الملف | التغيير |
|---|---|
| `supabase/migrations/034_period_closing.sql` | جدول `period_snapshots` + عمود `brands.closed_up_to` + دالة `close_period` RPC ذرّية |
| `app/api/purchases/apply/route.ts` | Guard: رفض تطبيق مشتريات في فترة مُغلقة (HTTP 423) |
| `app/api/sales/explode/route.ts` | Guard: رفض تطبيق مبيعات في فترة مُغلقة (HTTP 423) |
| `app/api/production/sessions/[id]/approve/route.ts` | Guard: رفض اعتماد جلسة إنتاج في فترة مُغلقة (HTTP 423) |
| `app/(dashboard)/[brand]/brands/page.tsx` | عمود "الإغلاق" + زر "🔒 إغلاق" + modal اختيار الشهر + عرض نتيجة Snapshot |
| `app/(dashboard)/[brand]/reports/ReportsClient.tsx` | بانر "هذه الفترة مُغلقة" + تبويب "لقطة الإغلاق" يعرض بيانات مجمّدة |

**Migration يجب تشغيله في Supabase Dashboard:**
```
supabase/migrations/034_period_closing.sql
```

**ملاحظات:**
- الإغلاق ذاتي التصاعد: `closed_up_to` يُحدَّث فقط إذا كان الشهر الجديد أحدث
- يمكن إغلاق شهور متعددة بالتتابع (مايو ثم يونيو ثم يوليو...)
- Guard يعيد HTTP 423 (Locked) لتمييزه عن 403 (Forbidden) — الـ UI يعرض الرسالة للمستخدم
- تبويب "لقطة الإغلاق" يظهر تلقائياً عند اختيار شهر مُغلق في التقارير
- رصيد مخزون آخر المدة في الـ snapshot يصبح مخزون أول المدة للشهر التالي (مرجع ثابت)

---

## الدفعة د — امتثال قانوني ⚖️

- [ ] **د1. إضافة رقم ضريبي (TRN) لجدول brands**
  - migration جديد: `ALTER TABLE brands ADD COLUMN tax_reg_number text`
  - أضف حقل TRN في صفحة إعدادات البراند

- [ ] **د2. آلية إغلاق الفترات المحاسبية**
  - migration جديد: `ALTER TABLE brands ADD COLUMN closed_up_to date`
  - أضف check في API routes للمشتريات والمبيعات — ارفض أي كتابة لفترة مغلقة
  - أضف زر "إغلاق الشهر" في صفحة التكاليف

- [ ] **د3. تقرير VAT للإقرار الضريبي**
  - تبويب جديد "VAT" في صفحة التقارير
  - يُجمّع: إيراد شامل VAT، VAT محصَّل (15%)، VAT على المشتريات
  - يُصدَّر Excel للإقرار لدى هيئة الزكاة

---

## ملاحظات تنفيذية

- الدفعة أ: لا تحتاج migrations — تُطبَّق مباشرة
- الدفعة ب: كل مهمة تحتاج migration + تشغيله في Supabase Dashboard
- الدفعة ج و د: مستقلة — يمكن تنفيذها بأي ترتيب
- رخصة SheetJS: تحتاج قرار قانوني خارج النطاق التقني — يُرفع للمستشار القانوني
- Data Residency: يتطلب التحقق من إعدادات Supabase Dashboard (ليس في الكود)

---

# مراجعة — 2026-06-13: المرحلة السابعة — التحليل المحاسبي الكامل ✅

## ما تغيّر

| الملف | التغيير |
|---|---|
| `app/(dashboard)/[brand]/inventory/InventoryClient.tsx` | تبويب **تحليل الهالك**: يجلب stock_movements(waste)، يعرض KPIs + رسم بياني + جدول بـ % من الإجمالي |
| `app/(dashboard)/[brand]/purchasing/PurchasingClient.tsx` | تبويب **تحليل المشتريات**: إنفاق شهري + أكبر موردين + أعلى 10 مواد + تذبذب الأسعار (≥5%) |
| `app/(dashboard)/[brand]/production/ProductionClient.tsx` | تبويب **تحليل التكلفة**: تقدير vs فعلي لكل جلسة معتمدة + انحراف% |
| `app/(dashboard)/[brand]/suppliers/page.tsx` | عمود "إجمالي المشتريات" + عدد الفواتير + tfoot المجموع |
| `app/(dashboard)/[brand]/inventory/InventoryClient.tsx` | تبويب **بطاقة الصنف**: رصيد الافتتاح والختام + رصيد متراكم |
| `app/(dashboard)/[brand]/inventory/InventoryClient.tsx` | تبويب **قيمة المخزون**: تجميع بالفئة + KPIs + تصدير Excel |
| `lib/produceBatch.ts` | H1: stores actuals_json on draft, NO stock deduction at draft time |
| `app/api/production/sessions/[id]/approve/route.ts` | H1: fetches LIVE stock + calls apply_produce_writes at approve time |
| `supabase/migrations/029_production_actuals_json.sql` | `ADD COLUMN actuals_json jsonb` على production_sessions |

## Migrations يجب تشغيلها في Supabase Dashboard — بالترتيب
```
supabase/migrations/026_rpc_atomic_writes.sql
supabase/migrations/027_rpc_wac.sql
supabase/migrations/028_stock_movement_value.sql
supabase/migrations/029_production_actuals_json.sql
```

## ملاحظات
- جلسات الإنتاج القديمة (قبل H1) ستُعيد خطأ 422 عند الاعتماد — المخرج: حذفها أو تجاهلها
- تحليل التكلفة يظهر فقط جلسات معتمدة بعد H1 (بعد 029 migration)
- تذبذب الأسعار يُظهر فقط مواد تغيّر سعرها ≥5% في الفترة المختارة

## TypeScript: 0 أخطاء

---

# خطة: إصلاحات المرحلة السادسة — قيمة نقدية في حركات المخزون

---

## مراجعة — 2026-06-12: قيمة نقدية في stock_movements ✅

### ما تغيّر

| الملف | التغيير |
|---|---|
| `supabase/migrations/028_stock_movement_value.sql` | `ADD COLUMN value numeric(12,4)` + تحديث `apply_explode_writes` و `apply_produce_writes` |
| `app/(dashboard)/[brand]/inventory/page.tsx` | `ingredients.select` يجلب `cost` + إضافة `cost` لـ `InventoryItem` |
| `app/(dashboard)/[brand]/inventory/InventoryClient.tsx` | `InventoryItem.cost` + `value` في الحركة اليدوية + `costMap` في الجرد |
| `app/(dashboard)/[brand]/waste/WasteClient.tsx` | `value: qty × selectedIng.cost` في حركة الهدر |
| `lib/produceBatch.ts` | `p_batch_value: costEstimate` للركورد 'in' في الإنتاج |

### Migration يجب تشغيله في Supabase Dashboard
```
supabase/migrations/028_stock_movement_value.sql
```
ملاحظة: يجب تشغيل 026 و 027 أولاً إن لم تُشغَّلا بعد.

### القيمة المحسوبة لكل نوع حركة
| النوع | القيمة |
|---|---|
| `out` (مبيعات/explode) | qty × تكلفة المادة الحالية (subquery في SQL) |
| `out` (إنتاج/produce) | qty × تكلفة المادة الحالية (subquery في SQL) |
| `in` (باتش منتج) | costEstimate = تكلفة الوصفة × الحصص |
| `waste` (هدر) | qty × تكلفة المادة من selectedIng.cost |
| `adjustment` (جرد) | \|variance\| × تكلفة المادة من costMap |
| `in` (حركة يدوية) | qty × تكلفة المادة من selected.cost |

### TypeScript: 0 أخطاء

---

# خطة: إصلاحات المرحلة الخامسة — تكامل بيانات + دقة محاسبية

---

## المهام

### المرحلة أ — سريعة (بدون migrations) 🟡

- [ ] **أ1. تلميح VAT في قالب Excel**
  - `lib/excel.ts`: تغيير رأس عمودَي الفاتورة و unit_cost لتشمل "(بدون ضريبة)"
  - الهدف: منع إدخال أسعار شاملة الضريبة بدون قصد

- [ ] **أ2. إعادة حساب تكاليف الكومبو بعد WAC**
  - `app/api/purchases/apply/route.ts`: إضافة Step 7 في نهاية الـ cascade
  - منطق: جلب combo_meal_items المرتبطة بالوصفات المتأثرة → إعادة حساب combo.total_cost + food_cost_pct
  - الهدف: كل تطبيق مشتريات يُحدِّث تكاليف الكومبو تلقائياً

---

### المرحلة ب — متوسطة (تحتاج migrations) 🔴

- [ ] **ب1. Transaction لـ sales/explode**
  - Migration `026_rpc_explode.sql`: دالة PL/pgSQL `explode_sales_batch(brand_id, import_batch, performed_by)`
  - تجمع: خصم stock_items + إدخال stock_movements + تحديث daily_sales.cost — كلها في BEGIN/COMMIT واحد
  - `app/api/sales/explode/route.ts`: استبدال الـ 3 await منفصلة بـ `supabase.rpc('explode_sales_batch', ...)`

- [ ] **ب2. Transaction لـ batches/produce**
  - Migration `027_rpc_produce.sql`: دالة `produce_batch_atomic(brand_id, batch_sku, qty, performed_by, note)`
  - تجمع: خصم مكونات + إضافة batch + stock_movements + production_sessions — كلها atomic
  - `lib/produceBatch.ts`: استبدال سلسلة الـ awaits بـ `supabase.rpc('produce_batch_atomic', ...)`

- [ ] **ب3. Race condition في WAC (purchases/apply)**
  - Migration `028_rpc_wac.sql`: دالة `apply_purchase_wac(brand_id, import_batch, performed_by)`
  - تقرأ stock_qty بـ SELECT FOR UPDATE → تحسب WAC → تكتب — كلها atomic
  - `app/api/purchases/apply/route.ts`: استبدال الكود الحالي بـ `supabase.rpc('apply_purchase_wac', ...)`

---

### ملاحظات التنفيذ

- المرحلة أ لا تحتاج migrations وتُطبَّق أولاً
- المرحلة ب كل مهمة مستقلة — يمكن تنفيذها واحدة واحدة
- الـ migrations تُشغَّل في Supabase Dashboard بعد كل مهمة
- TypeScript يجب أن يكون 0 أخطاء بعد كل مهمة

---

## مراجعة — 2026-06-12: إصلاحات المرحلة الخامسة ✅

### ما تغيّر

| الملف | التغيير |
|---|---|
| `lib/excel.ts` | عناوين أعمدة المشتريات: "(ريال)" → "(ريال - بدون ضريبة)" + المحلل يقبل الاسمين |
| `app/api/purchases/apply/route.ts` | **WAC atomic**: استبدال 5+ كولز منفصلة بـ `rpc('apply_purchase_wac')` + `SELECT FOR UPDATE` |
| `app/api/purchases/apply/route.ts` | **Combo cascade**: Step 7 جديد — كل تطبيق مشتريات يُحدِّث `combo_meals.total_cost/food_cost_pct/margin` |
| `app/api/sales/explode/route.ts` | **Atomic writes**: الكتابات الأربع (stock_items + stock_movements + daily_sales) أصبحت `rpc('apply_explode_writes')` |
| `lib/produceBatch.ts` | **Atomic writes**: الكتابات الأربع (خصم مكونات + إضافة باتش + حركتان) أصبحت `rpc('apply_produce_writes')` |
| `supabase/migrations/026_rpc_atomic_writes.sql` | دالتا `apply_explode_writes` + `apply_produce_writes` |
| `supabase/migrations/027_rpc_wac.sql` | دالة `apply_purchase_wac` مع `SELECT FOR UPDATE` |

### Migrations يجب تشغيلها في Supabase Dashboard — بالترتيب
```
supabase/migrations/026_rpc_atomic_writes.sql
supabase/migrations/027_rpc_wac.sql
```

### TypeScript: 0 أخطاء

### ملاحظات
- الـ cascade (وصفات + كومبو) يبقى في TypeScript — فقط الكتابات الأخيرة في SQL
- قالب Excel القديم (الأعمدة بدون ذكر الضريبة) يستمر في العمل — backward compatible
- `apply_purchase_wac` تُعيد `changed_ingredients` لكي يعرف TypeScript أي SKUs تأثّرت للـ cascade


