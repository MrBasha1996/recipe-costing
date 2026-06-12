# خطة: 5 مهام لإكمال نظام recipe-costing

---

## مراجعة — 2026-06-12: إصلاحات تقنية ✅

### ما تغيّر

| الملف | التغيير |
|---|---|
| `app/api/stocktake/[id]/approve/route.ts` | **C1**: استبدال `createClient + getUser()` بـ `createAdminClient + requireModulePermission(brand_id, 'inventory', 'approve')` — لا يمكن الاعتماد إلا لمن يملك صلاحية approve على نفس البراند |
| `supabase/migrations/025_fix_production_sessions_rls.sql` | **C4**: حذف `production_sessions_all` (USING true) واستبدالها بـ 4 سياسات مقيدة تشترط `can_access_brand` + `has_module_permission` لكل عملية |
| `app/api/production/sessions/route.ts:41-42` | **M2**: `full_name` → `name_ar` — الاسم المنفذ يظهر الآن بدل `—` |
| `lib/produceBatch.ts:180,185,194` | **H3b**: كل `await insert/upsert` يُفحص الآن وإذا فشل يرجع `{ error, status:500 }` — لا audit trail يفشل صامتاً |
| `stores/permissionsStore.ts:97` | **H3a**: `catch {}` → `catch(err) { console.error(...) }` — فشل تحميل الصلاحيات يظهر في السجلات |

### ملاحظة مهمة — Migration 025
يجب تشغيله في Supabase Dashboard → SQL Editor:
```
supabase/migrations/025_fix_production_sessions_rls.sql
```

### ما لم يُصلح (مقصود — يتطلب إعادة هيكلة)
- **C2+C3 (Transactions)**: عمليات الإنتاج/التفجير/المشتريات بدون transactions — يحتاج تحويل كل عملية لـ Postgres RPC. مؤجل.
- **H1 (Production approval)**: خصم المخزون يحدث عند draft لا عند approve — تغيير السلوك يؤثر على البيانات الحالية.
- **M3 (Middleware cache staleness)**: التحسين الجزئي تم في مرحلة الأداء (permissions تُحمَّل من server). الـ 60s window مقبول.

### TypeScript: 0 أخطاء

---

## مراجعة — 2026-06-12: إصلاحات محاسبية ✅

### ما تغيّر

| الملف | التغيير |
|---|---|
| `app/(dashboard)/[brand]/reports/ReportsClient.tsx:176-185` | **C1+C2**: `loadPLMonthData` تحذف query المشتريات وتستبدلها بـ `daily_sales.cost` (COGS الفعلي). يُحسم هذا مشكلتين دفعةً واحدة: (1) COGS يعكس المبيعات الفعلية لا قيمة المشتريات، (2) القيمة بوحدة واحدة ex-VAT مثل الإيراد |
| `app/api/purchases/apply/route.ts` | **C4**: بعد تحديث WAC للمكونات يُطلق cascade تلقائياً: يحدّث `recipe_ingredients.unit_cost` لكل وصفة متأثرة، ثم يعيد حساب `recipes.total_cost`، `food_cost_pct`، `margin`، `dine_out_*` — أرقام التكاليف تبقى حديثة |
| `app/(dashboard)/[brand]/inventory/InventoryClient.tsx:596` | **H2**: `qty: Math.abs(variance)` → `qty: variance` — حركات الجرد تُسجَّل بعلامتها الصحيحة (موجب=زيادة، سالب=نقص)؛ سجل المراجعة يُمكن الآن من تمييز الهدر عن الزيادة |

### الأثر المحاسبي
- **P&L**: نسبة Food Cost ومجمل الربح تعكس الآن التكلفة الفعلية للمبيعات — لا تتأثر بتوقيت الشراء
- **تكاليف الوصفات**: كل تطبيق مشتريات يُحدّث الوصفات تلقائياً — لا حاجة لإعادة حفظ كل وصفة يدوياً
- **الجرد**: الفرق الجردي في `stock_movements` يحمل إشارته الصحيحة — يمكن حساب قيمة الهدر

### ما لم يُصلح (مقصود — يحتاج migrations جديدة)
- **C3**: لا قيمة نقدية في `stock_items` — يحتاج `ALTER TABLE stock_movements ADD COLUMN value numeric`
- **C5**: WAC يخلط وحدات الشراء بوحدات الوصفة — يحتاج إعادة هيكلة منطق `unit_conversions`
- **H1**: لا transactions على عمليات المخزون المتعددة — مؤجل للمرحلة التقنية

### TypeScript: 0 أخطاء

---

## مراجعة — 2026-06-12: إصلاحات الأداء (مرحلة الأداء) ✅

### ما تغيّر

| الملف | التغيير |
|---|---|
| `middleware.ts` | `getUser()` → `getSession()` — يزيل HTTP round-trip لـ Supabase Auth (~100-400ms) من كل navigation |
| `app/(dashboard)/[brand]/layout.tsx` | يجلب `roles(is_super_admin, name)` مع profile + يجلب `role_permissions` مع join لـ modules server-side |
| `stores/permissionsStore.ts` | إضافة `initFromServer()`: يهيدرات الـ store من بيانات الـ server بدون network calls + `subscribeToChanges()`: يفصل setup الـ realtime عن جلب البيانات |
| `app/(dashboard)/[brand]/DashboardShell.tsx` | يستقبل `initialPermissions`, `isSuperAdmin`, `roleName` props + يستدعي `initFromServer` بدلاً من `loadPermissions` + Zustand selectors بدلاً من destructuring كامل |
| `app/(dashboard)/[brand]/costing/page.tsx` | `RecipeEditor` → `next/dynamic` — recharts لا تُحمَّل حتى يفتح المستخدم المحرر |
| `next.config.ts` | `experimental.staleTimes: { dynamic: 30 }` — يكاش الصفحات الديناميكية 30 ثانية في router |

### الأثر المتوقع
- **كل نقرة navigation**: توفير 100-400ms (لا auth round-trip في middleware)
- **أول تحميل للداشبورد**: الـ sidebar يظهر فوراً (كان يتأخر 600ms+ لـ 3 client queries متسلسلة)
- **صفحة الوصفات (costing)**: أسرع تحميل أولي — recharts لا تُحمَّل حتى الحاجة
- **التنقل بين التبويبات**: الصفحات المزارة مؤخراً تُعاد من الـ cache (30s)

### TypeScript: 0 أخطاء

---

---

## مراجعة — 2026-06-12: 7 مهام شاملة ✅

### ما تغيّر

| الملف | التغيير |
|---|---|
| `supabase/migrations/024_brands_logo_stocktake_approval.sql` | جديد: `logo_url`, `primary_color` على brands + `approved_by`, `approved_at` على stocktake_sessions |
| `types/index.ts` | إضافة `logo_url`, `primary_color`, `delivery_commission_pct` لـ Brand + `production_session_id` لـ StockMovement |
| `brands/page.tsx` | نموذج تعديل كامل: شعار (URL) + color picker + معاينة فورية + عمولة التوصيل |
| `reports/ReportsClient.tsx` — PLReport | مقارنة ثلاثية: الشهر الحالي / السابق / نفس الشهر السنة الماضية (عمود السنة يظهر فقط إن وجدت بيانات) |
| `reports/ReportsClient.tsx` — BranchesReport | ديناميكي: يجلب جميع البراندات من DB بدل hardcode 'ti','bb' — يستخدم primary_color لكل براند في المخطط |
| `inventory/InventoryClient.tsx` — HistoryTab | عمود "المصدر": يكشف مصدر الحركة (إنتاج #XXXXXX / مشتريات / مبيعات / جرد) |
| `inventory/InventoryClient.tsx` — StocktakeTab | زر "اعتماد" للجلسات المنتهية + badge "معتمد ✓" بعد الاعتماد |
| `app/api/stocktake/[id]/approve/route.ts` | جديد: POST endpoint لاعتماد جلسة الجرد |
| `ingredients/IngredientsClient.tsx` | زر "⚠ غير مرتبطة بوصفات" يفلتر الأصناف التي لم تُستخدم في أي وصفة |

### قاعدة البيانات — يجب تشغيل في Supabase Dashboard
```
supabase/migrations/024_brands_logo_stocktake_approval.sql
```

### ملاحظات
- **الشعار**: يُخزَّن كـ URL نصي — يمكن رفع الصورة لـ Supabase Storage ثم لصق الرابط العام
- **P&L السنة الماضية**: العمود يظهر تلقائياً فقط إن كان الإيراد > 0 لنفس الشهر من السنة الماضية
- **P&L البراندات**: يعتمد على `primary_color` المحفوظ في brands — إن لم يُحدَّث سيستخدم ألواناً افتراضية
- **مصدر الحركة**: يعتمد على `production_session_id` للإنتاج، وعلى نص الملاحظة للباقي — إن أردت دقة أكبر للمشتريات/المبيعات أضف أعمدة مرجع منفصلة لاحقاً

---

## مراجعة — 2026-06-12: التحسينات (دور 3) ✅

### ما تغيّر

| الملف | التغيير |
|---|---|
| `package.json` | xlsx → SheetJS الرسمي tarball — ثغرة Prototype Pollution High مغلقة (الآن 0 ثغرات High) |
| `public/analytics-dashboard.html` | محذوف — كان معزولاً وغير مرجَّع ويُخدَم بدون مصادقة |
| `.gitignore` | إضافة `dev_out.txt` و`dev_output.txt` |
| git tracking | `git rm --cached` لـ dev_out.txt وdev_output.txt — خرجا من التتبع (يبقيان على الديسك) |
| `eslint.config.mjs` | إصلاح: كان broken تماماً (`nextVitals is not iterable`) → تحويل إلى FlatCompat مع `next/core-web-vitals` و`next/typescript` |

### ما لم يُنفَّذ (مقصود)
- `ignoreDuringBuilds: true` في next.config.ts: ESLint يعمل الآن لكن 1886 خطأ `no-explicit-any` تمنع حذف هذا الخيار — يحتاج جلسة لمعالجة `as any` أولاً
- **RPC ذري**: race conditions في الجرد والإنتاج — مؤجل (يحتاج migrations)

### TypeScript
**0 أخطاء** — نظيف تماماً

---

## مراجعة — 2026-06-12: إصلاح الأخطاء (دور 2) ✅

### ما تغيّر

| الملف | الإصلاح |
|---|---|
| `app/api/sales/explode/route.ts:167` | `new Set<string>()` — يحل خطأ TS2345 الذي كان يمنع البناء |
| `app/(dashboard)/[brand]/reports/ReportsClient.tsx` | `BranchesReport`: نقل الـ `return` المبكر لما بعد كل الـ hooks — يحل انتهاك Rules of Hooks |
| `app/(dashboard)/[brand]/layout.tsx` | `getValidBrands()` من DB بدل `['ti','bb']` الثابت — البراندات الجديدة تعمل الآن |
| `app/page.tsx` | نفس الإصلاح + fallback ديناميكي من `valid[0]` |
| `lib/auth.ts` | دالة `requireModulePermission(brandId, moduleCode, action)` جديدة — تفحص البراند + صلاحية الموديول معاً |
| `app/api/sales/explode/route.ts` | `requireModulePermission('sales','update')` بدل `requireBrandAccess` |
| `app/api/sales/explode-check/route.ts` | `requireModulePermission('sales','view')` |
| `app/api/production/sessions/[id]/route.ts` | PATCH: `('production','update')` · DELETE: `('production','delete')` |
| `app/api/production/sessions/[id]/approve/route.ts` | `requireModulePermission('production','approve')` |
| `app/api/batches/produce/route.ts` | `requireModulePermission('production','create')` |
| `stores/permissionsStore.ts` | تخزين مرجع channel + `supabase.removeChannel(prev)` قبل إنشاء قناة جديدة |
| `lib/server-brand.ts` | `brandFromParam` يعود بـ `valid[0]` بدل `'bb'` الثابت |
| `app/(dashboard)/[brand]/inventory/InventoryClient.tsx` | `handleStartSession`: `alert()` بدل فشل صامت عند خطأ إنشاء الجلسة |

### TypeScript
**0 أخطاء** — نظيف تماماً

---

## مراجعة — 2026-06-12: إصلاحات ثقل الموقع ✅

### ما تغيّر

| الملف | التغيير |
|---|---|
| `middleware.ts` | Cache بـ TTL لقائمة البراندات (60s) + صلاحيات الدور (60s) + بروفايل المستخدم (30s) → 3 من 4 استعلامات تختفي على الطلب الثاني |
| `app/(dashboard)/[brand]/reports/ReportsClient.tsx` | `exportToPDF` أصبح dynamic import عند الضغط على الزر — jspdf + html2canvas (~500KB) لا تُحمَّل إلا عند الحاجة |
| `components/costing/RecipeChartsRow.tsx` | ترحيل من `react-chartjs-2 Doughnut` → `recharts PieChart + Pie` |
| `components/costing/RecipePriceHistory.tsx` | ترحيل من `react-chartjs-2 Line` → `recharts LineChart + Line` |
| `package.json` | حذف `chart.js` و`react-chartjs-2` من dependencies |
| `app/(dashboard)/[brand]/DashboardShell.tsx` | `loadAlerts` يضيف `.or('min_qty.gt.0,expiry_date.not.is.null')` — يجلب فقط الأصناف القابلة للتنبيه |
| `components/BrandSelectorOverlay.tsx` | جلب البراندات مؤجَّل لأول فتح فعلي للـ overlay (useRef guard) |

### ما لم يُصلح (مقصود)
- `app/api/sales/explode/route.ts:167` — خطأ TypeScript موجود قبل هذه التغييرات، مخطط تنفيذه في مرحلة إصلاح الأخطاء

### TypeScript
نظيف ماعدا خطأ واحد قديم في `explode/route.ts:167` (لم نلمسه)

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
