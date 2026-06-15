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


