'use client'

import type { Product, FoodCostResult } from '@/types'
import { C, MONO } from './theme'

interface Props {
  product: Product
  diResult: FoodCostResult
  doResult: FoodCostResult
  sellPrice: number
  appPrice: number | null
  yieldPortions: number
  canEdit: boolean
  onSellPriceChange: (v: number) => void
  onAppPriceChange: (v: number | null) => void
  onYieldChange: (v: number) => void
  hasDoPackaging: boolean
}

export default function RecipeIdentityCard({
  product, diResult, doResult,
  sellPrice, appPrice, yieldPortions,
  canEdit, onSellPriceChange, onAppPriceChange, onYieldChange,
  hasDoPackaging,
}: Props) {
  const isBatch = product.is_semi
  const showAGG = !isBatch && (hasDoPackaging || (appPrice != null && appPrice > 0))
  const aggPrice = appPrice && appPrice > 0 ? appPrice : sellPrice
  const aggGP = doResult.marginApp ?? doResult.margin

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${isBatch ? C.accentBorder : C.border}`,
      borderRadius: 16,
      padding: '20px 24px',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: 24,
      alignItems: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>

      {/* ── Col 1: ID Badge ─────────────────────── */}
      <div style={{
        background: isBatch ? C.gold : C.primary,
        color: '#fff',
        borderRadius: 10,
        padding: '12px 18px',
        textAlign: 'center',
        minWidth: 88,
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {isBatch ? 'Batch' : 'Item ID'}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, marginTop: 3, wordBreak: 'break-all' }}>
          {product.sku}
        </div>
        <div style={{ fontSize: 10, opacity: 0.45, marginTop: 5 }}>
          {yieldPortions} {isBatch ? 'وحدة' : 'حصة'}
        </div>
      </div>

      {/* ── Col 2: Name block ───────────────────── */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.gray800, lineHeight: 1.3 }}>
          {product.name}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
            background: isBatch ? C.goldLight : C.blueLight,
            color: isBatch ? C.gold : C.blue,
          }}>
            ⚙ Batch — منتج وسيط
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
            background: C.goldLight, color: C.gold,
          }}>
            Unit: {(product as any).unit || 'وحدة'}
          </span>
        </div>

        {/* Batch: only yield portions — no sell price */}
        {isBatch ? (
          <div style={{ marginTop: 14, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <NumField
              label="عدد الوحدات المنتجة"
              value={yieldPortions}
              onChange={v => onYieldChange(Math.max(1, Math.round(Number(v) || 1)))}
              disabled={!canEdit}
              unit="وحدة"
              isInt
            />
            <div style={{ fontSize: 12, color: C.gray400, padding: '8px 0' }}>
              لا يوجد سعر بيع — يُستخدم كمكوّن في الوصفات الأخرى
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <NumField
              label="سعر البيع"
              value={sellPrice}
              onChange={v => onSellPriceChange(Number(v) || 0)}
              disabled={!canEdit}
              unit="ر.س"
            />
            <NumField
              label="سعر التطبيق"
              value={appPrice ?? ''}
              onChange={v => onAppPriceChange(v === '' ? null : Number(v) || null)}
              disabled={!canEdit}
              unit="ر.س"
              placeholder="—"
            />
            <NumField
              label="عدد الحصص"
              value={yieldPortions}
              onChange={v => onYieldChange(Math.max(1, Math.round(Number(v) || 1)))}
              disabled={!canEdit}
              unit="حصة"
              isInt
            />
          </div>
        )}
      </div>

      {/* ── Col 3: KPI boxes ────────────────────── */}
      {isBatch ? (
        /* Batch: show production cost per unit */
        <div style={{
          background: C.goldLight, border: `1px solid ${C.accentBorder}`,
          borderRadius: 10, padding: '12px 18px', minWidth: 155, flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.gold, marginBottom: 4 }}>
            Production Cost
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: C.primary }}>
            {diResult.totalCost.toFixed(3)}<span style={{ fontSize: 10, fontWeight: 400, marginRight: 2 }}> ر.س</span>
          </div>
          <div style={{ height: 1, background: C.border, margin: '6px 0' }} />
          <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: C.gray400 }}>تكلفة الوحدة</span>
              <span style={{ fontFamily: MONO, color: C.gray600 }}>
                {yieldPortions > 0 ? (diResult.totalCost / yieldPortions).toFixed(4) : '—'} ر.س
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: C.gray400 }}>الوحدات</span>
              <span style={{ fontFamily: MONO, color: C.gray600 }}>{yieldPortions}</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: showAGG ? '1fr 1fr' : '1fr',
          gap: 10,
          minWidth: showAGG ? 310 : 155,
          flexShrink: 0,
        }}>
          <KpiBox
            label="Sales Price"
            price={sellPrice}
            gp={diResult.margin}
            cost={diResult.perPortionCost}
            costLabel="Cost IN"
            bg={C.greenLight}
            border={C.greenBorder}
            labelColor={C.green}
            priceColor={C.primary}
            gpColor={C.green}
          />
          {showAGG && (
            <KpiBox
              label="AGG Price"
              price={aggPrice}
              gp={aggGP}
              cost={doResult.perPortionCost}
              costLabel="Cost OUT"
              bg={C.accentLight}
              border={C.accentBorder}
              labelColor={C.accent}
              priceColor={C.accent}
              gpColor={C.accent}
            />
          )}
        </div>
      )}
    </div>
  )
}

function KpiBox({
  label, price, gp, cost, costLabel,
  bg, border, labelColor, priceColor, gpColor,
}: {
  label: string; price: number; gp: number; cost: number; costLabel: string
  bg: string; border: string; labelColor: string; priceColor: string; gpColor: string
}) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: labelColor }}>
          {label}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: priceColor }}>
          {price.toFixed(2)}<span style={{ fontSize: 10, fontWeight: 400, marginRight: 2 }}> ر.س</span>
        </span>
      </div>
      <div style={{ height: 1, background: C.border, margin: '6px 0' }} />
      <div style={{ fontSize: 11, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: C.gray400 }}>Gross Profit</span>
          <span style={{ fontFamily: MONO, fontWeight: 500, color: gpColor }}>{gp.toFixed(2)} ر.س</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: C.gray400 }}>{costLabel}</span>
          <span style={{ fontFamily: MONO, color: C.gray600 }}>{cost.toFixed(3)} ر.س</span>
        </div>
      </div>
    </div>
  )
}

function NumField({
  label, value, onChange, disabled, unit, placeholder, isInt,
}: {
  label: string; value: number | string; onChange: (v: string) => void
  disabled: boolean; unit: string; placeholder?: string; isInt?: boolean
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11, color: C.gray400 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          min={isInt ? 1 : 0}
          step={isInt ? 1 : 0.5}
          style={{
            width: 76, background: '#fff', border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '4px 8px', fontSize: 13, color: C.gray800,
            textAlign: 'center', outline: 'none', opacity: disabled ? 0.45 : 1,
            fontFamily: MONO,
          }}
        />
        <span style={{ fontSize: 11, color: C.gray400 }}>{unit}</span>
      </div>
    </label>
  )
}
