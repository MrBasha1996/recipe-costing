# خطة: تحويل الصفحات إلى Server Components (الحل الجذري للبطء)

## الهدف
كل صفحة الآن تجلب بياناتها بعد الـ mount في المتصفح → المستخدم يرى "جارٍ التحميل..." في كل تنقل.
الحل: تُجلب البيانات على السيرفر قبل إرسال الصفحة للمتصفح → المستخدم يرى المحتوى مباشرة.

## النمط المتبع لكل صفحة
```
قبل:  page.tsx ('use client') → useEffect → DB query → render
بعد:  page.tsx (Server) → DB query → PageClient.tsx ('use client' فقط للتفاعل)
```

## المتطلبات الأساسية (Phase 1)

### 1. تخزين brand في Cookie
- [ ] تعديل `stores/brandStore.ts` → كتابة cookie عند كل تغيير brand
- [ ] تعديل `app/(dashboard)/DashboardShell.tsx` → استدعاء `router.refresh()` عند تغيير brand حتى تتحدث بيانات السيرفر

### 2. مساعد قراءة brand من السيرفر
- [ ] إنشاء `lib/server-brand.ts` → دالة `getServerBrand()` تقرأ brand من الـ cookie

## تحويل الصفحات (Phase 2)

### صفحة products
- [ ] إنشاء `app/(dashboard)/products/ProductsClient.tsx` (الكود الحالي بدون load/useEffect + يقبل initialProducts)
- [ ] تحويل `app/(dashboard)/products/page.tsx` → Server Component يجلب البيانات
- [ ] إضافة `app/(dashboard)/products/loading.tsx`

### صفحة ingredients
- [ ] إنشاء `app/(dashboard)/ingredients/IngredientsClient.tsx`
- [ ] تحويل `app/(dashboard)/ingredients/page.tsx` → Server Component
- [ ] إضافة `app/(dashboard)/ingredients/loading.tsx`

### صفحة waste (+ إصلاح recharts)
- [ ] إنشاء `app/(dashboard)/waste/WasteClient.tsx`
- [ ] تحويل `app/(dashboard)/waste/page.tsx` → Server Component
- [ ] إضافة `app/(dashboard)/waste/loading.tsx`

### صفحة purchasing
- [ ] إنشاء `app/(dashboard)/purchasing/PurchasingClient.tsx`
- [ ] تحويل `app/(dashboard)/purchasing/page.tsx` → Server Component
- [ ] إضافة `app/(dashboard)/purchasing/loading.tsx`

### صفحة sales
- [ ] إنشاء `app/(dashboard)/sales/SalesClient.tsx`
- [ ] تحويل `app/(dashboard)/sales/page.tsx` → Server Component
- [ ] إضافة `app/(dashboard)/sales/loading.tsx`

### صفحة inventory (4 queries → أكبر أثر)
- [ ] إنشاء `app/(dashboard)/inventory/InventoryClient.tsx`
- [ ] تحويل `app/(dashboard)/inventory/page.tsx` → Server Component
- [ ] إضافة `app/(dashboard)/inventory/loading.tsx`

### صفحة dashboard (8 queries → الأعقد)
- [ ] إنشاء `app/(dashboard)/dashboard/DashboardClient.tsx`
- [ ] تحويل `app/(dashboard)/dashboard/page.tsx` → Server Component
- [ ] إضافة `app/(dashboard)/dashboard/loading.tsx`

## مراجعة

### ما تم إنجازه
تم تحويل **7 صفحات** من Client-side data fetching إلى Server Components:

| الصفحة | الملفات الجديدة | الاستعلامات المحوّلة |
|--------|-----------------|----------------------|
| products | ProductsClient.tsx, loading.tsx | 1 |
| ingredients | IngredientsClient.tsx, loading.tsx | 1 |
| waste | WasteClient.tsx, WasteAnalysis.tsx, loading.tsx | 1 (+ dynamic recharts) |
| purchasing | PurchasingClient.tsx, loading.tsx | 2 parallel |
| sales | SalesClient.tsx, loading.tsx | 1 batch summary |
| inventory | InventoryClient.tsx, loading.tsx | 4 parallel |
| dashboard | DashboardClient.tsx, loading.tsx | 10 parallel |

### الآلية
- `getServerBrand()` في `lib/server-brand.ts` يقرأ brand من cookie
- `brandStore.setBrand/pickBrand` يكتب cookie حتى يقرأه السيرفر
- `router.refresh()` يُطلق إعادة تنفيذ Server Components عند تغيير brand أو بعد أي mutation
- `useEffect([initialData])` في كل Client داخلي يزامن الحالة عندما يُعيد السيرفر بيانات جديدة
- `loading.tsx` يظهر skeleton فوري أثناء تحميل السيرفر (Suspense)

### ما يجب معرفته
- **recharts**: مُحمَّل بـ `dynamic()` في WasteClient — يُحمَّل فقط عند فتح تبويب التحليل
- **OpsSnapshot refresh**: زر التحديث يستدعي `router.refresh()` بدلاً من re-fetch مباشر
- **الصفحات المتبقية** (costs, reports, settings, costing) تعمل بالنمط القديم — يمكن تحويلها لاحقاً إذا احتاجت
- **الجرد الدوري (Stocktake)** يجلب بياناته بشكل lazy عند فتح التبويب — هذا مقصود
