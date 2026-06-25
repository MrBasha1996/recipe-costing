-- =====================================================
-- Migration 009: Separate batches table
-- الباتشات (المنتجات الوسيطة) في جدول مستقل عن المنتجات
-- =====================================================

-- 1. إنشاء جدول الباتشات
create table if not exists batches (
  sku        text not null,
  brand_id   text not null references brands(id),
  name       text not null,
  unit       text not null default 'وحدة',
  created_at timestamptz default now(),
  primary key (sku, brand_id)
);

-- RLS: نفس سياسة products
alter table batches enable row level security;

create policy "authenticated users can manage batches"
  on batches for all
  to authenticated
  using (true)
  with check (true);

-- 2. ترحيل الباتشات الموجودة من products إلى batches (إن وجدت)
insert into batches (sku, brand_id, name, unit, created_at)
select sku, brand_id, name, coalesce(unit, 'وحدة'), created_at
from products
where category = 'Batch' or is_semi = true
on conflict (sku, brand_id) do nothing;

-- 3. حذف الباتشات من جدول products
delete from products where category = 'Batch' or is_semi = true;

-- 4. إزالة حقل is_semi من products (لم يعد مطلوباً)
-- نتركه للتوافق ولكنه لن يُستخدم

-- 5. فهرسة للبحث السريع
create index if not exists idx_batches_brand_id on batches(brand_id);
