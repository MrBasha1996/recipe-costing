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


