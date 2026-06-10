export type BrandId = 'ti' | 'bb'
export type BrandAccess = 'ti' | 'bb' | 'all'
export type ProductCategory = 'Meal'
export type ItemType = 'ingredient' | 'product'

export interface Brand {
  id: BrandId
  name: string
  name_ar: string
}

export interface UserProfile {
  id: string
  username: string
  name_ar: string
  brand_access: BrandAccess
  role_id?: string | null
  created_at: string
}

export interface Product {
  sku: string
  brand_id: BrandId
  name: string
  category: ProductCategory
  price: number
  app_price: number | null
  app_sku: string | null
  unit: string | null
  is_base: boolean
  is_semi?: boolean
  created_at: string
}

export interface BatchProduct {
  sku: string
  brand_id: BrandId
  name: string
  unit: string
  created_at: string
}

export interface Ingredient {
  sku: string
  brand_id: BrandId
  name: string
  category: string
  unit: string
  cost: number
  is_base: boolean
  created_at: string
}

export interface UnitConversion {
  id: string
  brand_id: BrandId
  ing_sku: string
  ing_name: string
  buy_unit: string
  recipe_unit: string
  factor: number
}

export type IngredientSection = 'food' | 'packaging'
export type ServiceType = 'both' | 'dine_in' | 'dine_out'

export interface RecipeIngredientRow {
  id: string
  recipe_id: string
  ing_sku: string
  ing_name: string
  qty: number
  unit: string
  unit_cost: number
  yield_pct: number
  is_semi: boolean
  sort_order: number
  section: IngredientSection
  service_type: ServiceType
}

export interface Recipe {
  id: string
  sku: string
  brand_id: BrandId
  product_name: string
  is_semi: boolean
  version: number
  version_name: string | null
  is_active: boolean
  is_approved: boolean
  approved_by: string | null
  approved_at: string | null
  sell_price: number
  app_price: number | null
  yield_portions: number
  total_cost: number
  food_cost_pct: number
  margin: number
  margin_app: number | null
  dine_out_total_cost: number | null
  dine_out_food_cost_pct: number | null
  dine_out_margin: number | null
  saved_by: string | null
  saved_at: string
  recipe_ingredients?: RecipeIngredientRow[]
}

export interface PriceHistory {
  id: string
  brand_id: BrandId
  sku: string
  item_name: string
  item_type: ItemType
  old_price: number
  new_price: number
  changed_by: string | null
  changed_at: string
}

export interface AuditLog {
  id: string
  brand_id: string | null
  action: string
  entity_type: string
  entity_sku: string | null
  entity_name: string | null
  performed_by: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export type MovementType = 'in' | 'out' | 'waste' | 'adjustment'

export interface StockItem {
  id: string
  brand_id: BrandId
  ing_sku: string
  ing_name: string
  unit: string
  current_qty: number
  min_qty: number
  updated_at: string
}

export interface StockMovement {
  id: string
  brand_id: BrandId
  ing_sku: string
  ing_name: string
  movement_type: MovementType
  qty: number
  note: string | null
  performed_by: string | null
  created_at: string
}

// ── Costing / Calculation types ──────────────────────────────────

export interface RecipeRowDraft {
  id: string
  ing_sku: string
  ing_name: string
  qty: number
  unit: string
  unit_cost: number
  yield_pct: number
  is_semi: boolean
  section: IngredientSection
  service_type: ServiceType
}

export interface FoodCostResult {
  totalCost: number
  perPortionCost: number
  foodCostPct: number
  margin: number
  marginApp: number | null
}

// ── Operations ──────────────────────────────────────────────────

export interface Purchase {
  id: string
  brand_id: BrandId
  purchase_date: string
  supplier_name: string
  ing_sku: string | null
  ing_name: string
  qty: number
  unit: string
  total_price: number
  unit_cost: number
  import_batch: string
  imported_by: string | null
  created_at: string
}

export interface DailySale {
  id: string
  brand_id: BrandId
  sale_date: string
  product_sku: string
  product_name: string
  qty_sold: number
  revenue: number
  import_batch: string
  imported_by: string | null
  created_at: string
}

export type LaborDept = 'kitchen' | 'service' | 'cashier' | 'delivery' | 'admin' | 'other'

export interface LaborCost {
  id: string
  brand_id: BrandId
  month: string
  department: LaborDept
  description: string
  amount: number
  created_by: string | null
  created_at: string
}

export interface MonthlyBudget {
  id: string
  brand_id: BrandId
  month: string
  revenue_target: number | null
  fc_pct_target: number | null
  labor_pct_target: number | null
  overhead_pct_target: number | null
  created_by: string | null
  updated_at: string
}

export type OverheadCategory = 'rent' | 'electricity' | 'gas' | 'maintenance' | 'marketing' | 'other'

export interface OverheadCost {
  id: string
  brand_id: BrandId
  month: string
  category: OverheadCategory
  description: string
  amount: number
  created_by: string | null
  created_at: string
}

export interface Branch {
  id: string
  brand_id: BrandId
  name: string
  ref: string | null
  is_active: boolean
  created_at: string
}

export interface WasteLog {
  id: string
  brand_id: BrandId
  branch_name: string | null
  branch_ref: string | null
  log_date: string
  product_sku: string | null
  product_name: string
  qty: number
  value: number
  waste_type: 'cancellation' | 'return' | 'spoilage' | 'expiry' | 'other'
  reason: string | null
  order_ref: string | null
  was_wasted: boolean
  import_batch: string | null
  created_at: string
}

// ── Excel import row types ────────────────────────────────────────

export interface PurchaseRow {
  purchase_date: string
  supplier_name: string
  ing_sku: string
  ing_name: string
  qty: number
  unit: string
  total_price: number
  unit_cost: number
}

export interface SaleRow {
  sale_date: string
  product_sku: string
  product_name: string
  qty_sold: number
  revenue: number
  branch_name?: string
  branch_ref?: string
  tax_amount?: number
  discount_amount?: number
  return_amount?: number
  return_qty?: number
  cancel_amount?: number
  cancel_qty?: number
  cost_pos?: number
  source?: 'excel' | 'foodics'
}

export interface FoodicsCancellationRow {
  product_name: string
  branch_name: string
  branch_ref: string
  waste_type: 'cancellation' | 'return'
  order_ref: string
  qty: number
  value: number
  reason: string
  was_wasted: boolean
}

// ── Component search item (ingredient or semi-product) ──────────
export interface ComponentItem {
  sku: string
  name: string
  unit: string
  cost: number
  category: string
  is_semi: boolean
}

// ── RBAC ─────────────────────────────────────────────────────────

export interface RbacRole {
  id: string
  name: string
  description: string | null
  is_super_admin: boolean
  is_system: boolean
  created_at: string
}

export interface Module {
  id: string
  code: string
  name: string
  sort_order: number
  is_active: boolean
}

export interface RolePermission {
  id: string
  role_id: string
  module_id: string
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
  can_approve: boolean
  can_import: boolean
  can_edit_price: boolean
  can_post: boolean
  can_print: boolean
  can_export: boolean
}

export type PermissionAction =
  | 'view' | 'create' | 'update' | 'delete'
  | 'approve' | 'import' | 'edit_price'
  | 'post' | 'print' | 'export'

export interface PermissionsMap {
  [moduleCode: string]: {
    can_view: boolean
    can_create: boolean
    can_update: boolean
    can_delete: boolean
    can_approve: boolean
    can_import: boolean
    can_edit_price: boolean
    can_post: boolean
    can_print: boolean
    can_export: boolean
  }
}

export interface RbacAuditLog {
  id: string
  performed_by: string | null
  action: string
  entity_type: string
  entity_id: string | null
  entity_name: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  created_at: string
}
