export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      brands: {
        Row: { id: string; name: string; name_ar: string }
        Insert: { id: string; name: string; name_ar: string }
        Update: { id?: string; name?: string; name_ar?: string }
      }
      user_profiles: {
        Row: {
          id: string
          username: string
          name_ar: string
          brand_access: 'ti' | 'bb' | 'all'
          role_id: string | null
          created_at: string
        }
        Insert: {
          id: string
          username: string
          name_ar: string
          brand_access: 'ti' | 'bb' | 'all'
          role_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          username?: string
          name_ar?: string
          brand_access?: 'ti' | 'bb' | 'all'
          role_id?: string | null
          created_at?: string
        }
      }
      batches: {
        Row: {
          sku: string
          brand_id: string
          name: string
          unit: string
          created_at: string
        }
        Insert: {
          sku: string
          brand_id: string
          name: string
          unit?: string
          created_at?: string
        }
        Update: {
          sku?: string
          brand_id?: string
          name?: string
          unit?: string
          created_at?: string
        }
      }
      products: {
        Row: {
          sku: string
          brand_id: string
          name: string
          category: 'Meal'
          price: number
          app_price: number | null
          app_sku: string | null
          unit: string | null
          is_base: boolean
          created_at: string
        }
        Insert: {
          sku: string
          brand_id: string
          name: string
          category?: 'Meal'
          price?: number
          app_price?: number | null
          app_sku?: string | null
          unit?: string | null
          is_base?: boolean
          created_at?: string
        }
        Update: {
          sku?: string
          brand_id?: string
          name?: string
          category?: 'Meal'
          price?: number
          app_price?: number | null
          app_sku?: string | null
          unit?: string | null
          is_base?: boolean
          created_at?: string
        }
      }
      ingredients: {
        Row: {
          sku: string
          brand_id: string
          name: string
          category: string
          unit: string
          cost: number
          is_base: boolean
          created_at: string
        }
        Insert: {
          sku: string
          brand_id: string
          name: string
          category: string
          unit: string
          cost?: number
          is_base?: boolean
          created_at?: string
        }
        Update: {
          sku?: string
          brand_id?: string
          name?: string
          category?: string
          unit?: string
          cost?: number
          is_base?: boolean
          created_at?: string
        }
      }
      recipes: {
        Row: {
          id: string
          sku: string
          brand_id: string
          product_name: string
          is_semi: boolean
          sell_price: number
          app_price: number | null
          yield_portions: number
          total_cost: number
          food_cost_pct: number
          margin: number
          margin_app: number | null
          saved_by: string | null
          saved_at: string
        }
        Insert: {
          id?: string
          sku: string
          brand_id: string
          product_name: string
          is_semi?: boolean
          sell_price?: number
          app_price?: number | null
          yield_portions?: number
          total_cost?: number
          food_cost_pct?: number
          margin?: number
          margin_app?: number | null
          saved_by?: string | null
          saved_at?: string
        }
        Update: {
          id?: string
          sku?: string
          brand_id?: string
          product_name?: string
          is_semi?: boolean
          sell_price?: number
          app_price?: number | null
          yield_portions?: number
          total_cost?: number
          food_cost_pct?: number
          margin?: number
          margin_app?: number | null
          saved_by?: string | null
          saved_at?: string
        }
      }
      recipe_ingredients: {
        Row: {
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
        }
        Insert: {
          id?: string
          recipe_id: string
          ing_sku: string
          ing_name: string
          qty?: number
          unit: string
          unit_cost?: number
          yield_pct?: number
          is_semi?: boolean
          sort_order?: number
        }
        Update: {
          id?: string
          recipe_id?: string
          ing_sku?: string
          ing_name?: string
          qty?: number
          unit?: string
          unit_cost?: number
          yield_pct?: number
          is_semi?: boolean
          sort_order?: number
        }
      }
      price_history: {
        Row: {
          id: string
          brand_id: string
          sku: string
          item_name: string
          item_type: 'ingredient' | 'product'
          old_price: number
          new_price: number
          changed_by: string | null
          changed_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          sku: string
          item_name: string
          item_type: 'ingredient' | 'product'
          old_price: number
          new_price: number
          changed_by?: string | null
          changed_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          sku?: string
          item_name?: string
          item_type?: 'ingredient' | 'product'
          old_price?: number
          new_price?: number
          changed_by?: string | null
          changed_at?: string
        }
      }
      suppliers: {
        Row: {
          id: string
          brand_id: string
          name: string
          phone: string | null
          contact_person: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          name: string
          phone?: string | null
          contact_person?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          name?: string
          phone?: string | null
          contact_person?: string | null
          notes?: string | null
          created_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          brand_id: string | null
          action: string
          entity_type: string
          entity_sku: string | null
          entity_name: string | null
          performed_by: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          brand_id?: string | null
          action: string
          entity_type: string
          entity_sku?: string | null
          entity_name?: string | null
          performed_by?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string | null
          action?: string
          entity_type?: string
          entity_sku?: string | null
          entity_name?: string | null
          performed_by?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
    }
  }
}
