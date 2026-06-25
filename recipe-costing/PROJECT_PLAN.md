# مخطط تطوير نظام تكاليف الوصفات
## Recipe Costing System — Next.js + Supabase

---

## المشروع

تحويل ملف HTML وحيد (3000+ سطر) إلى تطبيق Next.js + TypeScript احترافي مع Supabase كـ Backend حقيقي.

| البند | التفاصيل |
|---|---|
| **العلامتان التجاريتان** | Three In (TI) + باب البلد (BB) |
| **الأدوار** | accountant / ops / kitchen |
| **URL** | https://aadboqtyinjzgshcazfx.supabase.co |

---

## Stack التقني

| الطبقة | التقنية |
|---|---|
| Framework | Next.js 15 + App Router |
| Language | TypeScript (strict) |
| UI | Tailwind CSS |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| State | Zustand |
| Tables | TanStack Table |
| Charts | Recharts |
| Excel | SheetJS (xlsx) |
| Forms | React Hook Form + Zod |

---

## حسابات Food Cost

```
totalCost     = SUM( qty / (yieldPct/100) × unitCost )
perPortion    = totalCost / yieldPortions
foodCostPct   = (perPortion / sellPrice) × 100
margin        = sellPrice − perPortion
target FC%    = 35%
```

---

## قاعدة البيانات — الجداول

| الجدول | الوصف |
|---|---|
| `brands` | ti / bb |
| `user_profiles` | امتداد Supabase Auth — role + brand_access |
| `products` | منتجات Meal + Batch لكل brand |
| `ingredients` | مواد خام لكل brand |
| `recipes` | الوصفات المحفوظة |
| `recipe_ingredients` | مكونات كل وصفة |
| `price_history` | تاريخ تغييرات الأسعار |
| `audit_logs` | سجل كل العمليات |

---

## بيانات المستخدمين (جاهزة)

| Email | Password | Role | Brand |
|---|---|---|---|
| admin@threein.sa | Admin@123456 | accountant | all |
| ops.ti@threein.sa | Ops@123456 | ops | ti |
| ops.bb@threein.sa | Ops@123456 | ops | bb |
| kitchen@threein.sa | Kitchen@123 | kitchen | all |

---

## هيكل المشروع

```
recipe-costing/
├── app/
│   ├── (auth)/login/page.tsx          ✅ جاهز
│   ├── (dashboard)/
│   │   ├── layout.tsx                 ⬜ TopBar + BrandTabs + Nav
│   │   ├── costing/page.tsx           ⬜ صفحة الوصفات
│   │   ├── products/page.tsx          ⬜ صفحة المنتجات
│   │   ├── ingredients/page.tsx       ⬜ صفحة المواد الخام
│   │   ├── dashboard/page.tsx         ⬜ Dashboard
│   │   └── users/page.tsx             ⬜ إدارة المستخدمين
│   └── api/
│       ├── sheets/route.ts            ⬜ Google Sheets sync
│       └── excel/route.ts             ⬜ Excel export
├── components/
│   ├── costing/
│   │   ├── CostingSidebar.tsx         ⬜ قائمة المنتجات
│   │   ├── RecipeEditor.tsx           ⬜ محرر الوصفة
│   │   ├── IngredientRow.tsx          ⬜ صف مكوّن
│   │   ├── FoodCostBar.tsx            ⬜ شريط FC%
│   │   └── MetricsGrid.tsx            ⬜ بطاقات الإحصاء
│   ├── products/
│   │   ├── ProductForm.tsx            ⬜
│   │   └── ProductTable.tsx           ⬜
│   ├── ingredients/
│   │   ├── IngredientForm.tsx         ⬜
│   │   └── IngredientTable.tsx        ⬜
│   ├── dashboard/
│   │   ├── KPICards.tsx               ⬜
│   │   ├── FCDistributionChart.tsx    ⬜
│   │   └── Top10Chart.tsx             ⬜
│   └── shared/
│       ├── TopBar.tsx                 ⬜
│       ├── BrandTabs.tsx              ⬜
│       ├── NavTabs.tsx                ⬜
│       └── IngredientAutocomplete.tsx ⬜
├── lib/
│   ├── supabase/
│   │   ├── client.ts                  ✅ جاهز
│   │   ├── server.ts                  ✅ جاهز
│   │   └── types.ts                   ✅ جاهز
│   ├── calculations.ts                ⬜ دوال Food Cost
│   ├── excel.ts                       ⬜ Import/Export
│   └── sheets.ts                      ⬜ Google Sheets
├── stores/
│   ├── brandStore.ts                  ⬜ Zustand
│   ├── costingStore.ts                ⬜ Zustand
│   └── userStore.ts                   ⬜ Zustand
├── types/index.ts                     ✅ جاهز
├── middleware.ts                      ✅ جاهز
├── supabase/
│   ├── migrations/001_schema.sql      ✅ مُطبَّق
│   ├── migrations/002_rls.sql         ✅ مُطبَّق
│   └── seed.sql                       ✅ مُطبَّق
└── scripts/
    ├── migrate.mjs                    ✅ جاهز
    └── create-admin.mjs               ✅ جاهز
```

---

## الخطة التنفيذية — 5 مراحل

---

### ✅ المرحلة 1 — الإعداد والبنية التحتية (مكتملة)

- [x] إنشاء مشروع Next.js بـ TypeScript + Tailwind
- [x] تثبيت التبعيات (Supabase, Zustand, TanStack, Recharts, xlsx, zod)
- [x] إنشاء قاعدة البيانات — 8 جداول
- [x] تطبيق RLS Policies (brand isolation + role permissions)
- [x] رفع البيانات الأساسية (TI: 53+26 منتج + 127 مكوّن / BB: 95+18 منتج + 171 مكوّن)
- [x] إنشاء 4 مستخدمين في Supabase Auth مع user_profiles
- [x] صفحة تسجيل الدخول
- [x] Middleware لحماية المسارات
- [x] TypeScript types كاملة

---

### ⬜ المرحلة 2 — إدارة البيانات الأساسية

**الهدف:** CRUD كامل للمنتجات والمواد الخام

#### المهام:
- [ ] `stores/brandStore.ts` — Zustand: brand الحالية + nav
- [ ] `stores/userStore.ts` — Zustand: session + role
- [ ] `app/(dashboard)/layout.tsx` — TopBar + BrandTabs + NavTabs
- [ ] `components/shared/TopBar.tsx` — اسم المستخدم + تسجيل خروج + brand switcher
- [ ] `components/shared/BrandTabs.tsx` — Three In / باب البلد
- [ ] `components/shared/NavTabs.tsx` — Costing / Products / Ingredients / Dashboard
- [ ] `app/(dashboard)/products/page.tsx` — جدول المنتجات (TanStack Table)
- [ ] `components/products/ProductForm.tsx` — نموذج إضافة/تعديل (Zod)
- [ ] `app/(dashboard)/ingredients/page.tsx` — جدول المواد الخام
- [ ] `components/ingredients/IngredientForm.tsx` — نموذج مع تاريخ الأسعار
- [ ] إخفاء أعمدة الأسعار عن role=ops و kitchen

#### التحقق:
- [ ] إضافة منتج جديد ويظهر في الجدول
- [ ] تعديل سعر مادة خام ويُسجَّل في price_history
- [ ] مستخدم ops لا يرى أعمدة الأسعار
- [ ] مستخدم TI لا يرى بيانات BB

---

### ⬜ المرحلة 3 — نظام الوصفات (الميزة الأساسية)

**الهدف:** محرر الوصفات الكامل مع حسابات دقيقة

#### المهام:
- [ ] `lib/calculations.ts` — دوال pure: calcFoodCost, calcMargin, calcSuggestedPrice
- [ ] `stores/costingStore.ts` — حالة المحرر الحالي
- [ ] `components/costing/CostingSidebar.tsx` — قائمة المنتجات + بحث + فلتر saved
- [ ] `components/costing/RecipeEditor.tsx` — المحرر الكامل
- [ ] `components/costing/IngredientRow.tsx` — صف مع qty + yield% + unit_cost
- [ ] `components/shared/IngredientAutocomplete.tsx` — بحث مواد خام + Batch
- [ ] `components/costing/FoodCostBar.tsx` — شريط لوني (أخضر < 35% / أحمر > 35%)
- [ ] `components/costing/MetricsGrid.tsx` — بطاقات: تكلفة / FC% / هامش
- [ ] `app/(dashboard)/costing/page.tsx` — الصفحة الرئيسية
- [ ] دعم Semi-products (Batch) مع cascade costing
- [ ] حفظ الوصفة في Supabase (recipes + recipe_ingredients)
- [ ] طباعة الوصفة للمطبخ (print view)

#### التحقق:
- [ ] اختيار منتج → يفتح المحرر
- [ ] إضافة مكوّن بـ autocomplete → تظهر التكاليف
- [ ] حفظ الوصفة → يُسجَّل في Supabase
- [ ] Semi-product يأخذ تكلفته من وصفته المحفوظة
- [ ] طباعة تفتح نافذة جديدة قابلة للطباعة

---

### ⬜ المرحلة 4 — Dashboard + Excel + Sheets

**الهدف:** التحليلات + الاستيراد/التصدير

#### المهام:
- [ ] `app/(dashboard)/dashboard/page.tsx`
  - KPI Cards (متوسط FC% / هامش / عدد فوق الهدف)
  - FC% Distribution Chart (Recharts)
  - Top 10 أغلى وصفات
  - جدول الوصفات فوق 35%
- [ ] `lib/excel.ts` — تصدير + استيراد + bulk price update
- [ ] `app/api/excel/route.ts` — API لتحميل ملفات Excel
- [ ] `app/api/sheets/route.ts` — Google Sheets sync (قراءة + كتابة)
- [ ] Price Impact Modal — عرض تأثير تغيير الأسعار قبل التطبيق

#### التحقق:
- [ ] Dashboard يعرض إحصاءات صحيحة
- [ ] تصدير Excel يحتوي على 3 sheets
- [ ] رفع ملف أسعار → modal التأثير → تطبيق
- [ ] Sheets sync يجلب الوصفات المحفوظة

---

### ⬜ المرحلة 5 — الأمان + المستخدمون + Audit

**الهدف:** نظام صلاحيات كامل وسجل تدقيق

#### المهام:
- [ ] `app/(dashboard)/users/page.tsx` — إدارة المستخدمين (accountant فقط)
- [ ] Middleware: حماية `/users` و `/dashboard` بالدور
- [ ] Audit Logs: تسجيل كل تغيير مع من غيّر + متى
- [ ] `scripts/migrate-from-localstorage.ts` — أداة ترحيل البيانات من localStorage

#### التحقق:
- [ ] إضافة مستخدم من الواجهة → يستطيع الدخول
- [ ] كل تغيير يُسجَّل في audit_logs
- [ ] kitchen لا يستطيع الوصول لـ /users أو /dashboard

---

## الميزات المستقبلية (بعد المراحل الخمس)

| الميزة | الأولوية |
|---|---|
| تصدير PDF للوصفات | عالية |
| Inventory Tracking (مخزون + هالك) | عالية |
| Recipe Versioning (تاريخ إصدارات) | متوسطة |
| Real-time تحديثات (Supabase Realtime) | متوسطة |
| PWA + Offline Support | منخفضة |
| Notifications (تنبيه > 35%) | منخفضة |

---

## الحالة الحالية

```
المرحلة 1  ████████████████████  100% ✅
المرحلة 2  ░░░░░░░░░░░░░░░░░░░░    0% ⬜
المرحلة 3  ░░░░░░░░░░░░░░░░░░░░    0% ⬜
المرحلة 4  ░░░░░░░░░░░░░░░░░░░░    0% ⬜
المرحلة 5  ░░░░░░░░░░░░░░░░░░░░    0% ⬜
```

**التالي:** المرحلة 2 — Layout + Brand/Nav Stores + صفحات المنتجات والمواد الخام
