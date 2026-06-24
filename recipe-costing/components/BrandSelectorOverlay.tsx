'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BrandId } from '@/types'

interface Props {
  visible: boolean
  currentBrand: BrandId
  onPick: (brand: BrandId) => void
  onClose: () => void
  canClose: boolean
}

interface BrandStyle {
  icon: string
  bg: string
  cardBorder: string
  cardGlow: string
  accentBar: string
  badgeBg: string
  badgeText: string
  btnBg: string
  btnShadow: string
}

// Visual styles per known brand ID — new brands get DEFAULT_STYLE
const BRAND_STYLES: Record<string, BrandStyle> = {
  ti: {
    icon: '🍔',
    bg: 'linear-gradient(145deg, #0a1628 0%, #0e2040 40%, #1a3a6a 100%)',
    cardBorder: 'rgba(59,130,246,0.35)',
    cardGlow: 'rgba(59,130,246,0.15)',
    accentBar: 'linear-gradient(to right, #1e3a8a, #3b82f6, #93c5fd)',
    badgeBg: 'rgba(59,130,246,0.2)',
    badgeText: '#93c5fd',
    btnBg: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
    btnShadow: 'rgba(59,130,246,0.4)',
  },
  bb: {
    icon: '🫕',
    bg: 'linear-gradient(145deg, #120500 0%, #1c0a00 40%, #3d1a00 100%)',
    cardBorder: 'rgba(217,119,6,0.35)',
    cardGlow: 'rgba(217,119,6,0.12)',
    accentBar: 'linear-gradient(to right, #92400e, #d97706, #fbbf24)',
    badgeBg: 'rgba(217,119,6,0.2)',
    badgeText: '#fcd34d',
    btnBg: 'linear-gradient(135deg, #b45309, #d97706)',
    btnShadow: 'rgba(217,119,6,0.4)',
  },
}

const DEFAULT_STYLE: BrandStyle = {
  icon: '🏪',
  bg: 'linear-gradient(145deg, #0f172a 0%, #1e293b 40%, #334155 100%)',
  cardBorder: 'rgba(148,163,184,0.35)',
  cardGlow: 'rgba(148,163,184,0.12)',
  accentBar: 'linear-gradient(to right, #475569, #94a3b8, #cbd5e1)',
  badgeBg: 'rgba(148,163,184,0.2)',
  badgeText: '#cbd5e1',
  btnBg: 'linear-gradient(135deg, #475569, #64748b)',
  btnShadow: 'rgba(148,163,184,0.4)',
}

interface BrandRow {
  id: string
  name: string
  name_ar: string
  is_standalone: boolean
  external_url: string | null
  primary_color: string | null
}

export default function BrandSelectorOverlay({ visible, currentBrand, onPick, onClose, canClose }: Props) {
  const [show, setShow] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [brands, setBrands] = useState<BrandRow[]>([])
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!visible || fetchedRef.current) return
    fetchedRef.current = true
    const supabase = createClient()
    ;(supabase.from('brands') as any)
      .select('id, name, name_ar, is_standalone, external_url, primary_color')
      .order('id')
      .then(({ data }: any) => { if (data) setBrands(data) })
  }, [visible])

  useEffect(() => {
    if (visible) {
      setLeaving(false)
      const t = setTimeout(() => setShow(true), 20)
      return () => clearTimeout(t)
    } else {
      setShow(false)
      setLeaving(false)
    }
  }, [visible])

  function handlePick(brand: BrandId) {
    setLeaving(true)
    setTimeout(() => { onPick(brand) }, 400)
  }

  function handleClose() {
    setLeaving(true)
    setTimeout(() => onClose(), 400)
  }

  if (!visible) return null

  const regularBrands = brands.filter(b => !b.is_standalone)
  const standaloneBrands = brands.filter(b => b.is_standalone)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        opacity: (show && !leaving) ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 900,
          padding: '0 20px',
          transform: (show && !leaving) ? 'translateY(0)' : 'translateY(-60px)',
          transition: 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 13, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 10 }}>
            Restaurant Analytics
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.2 }}>
            اختر العلامة التجارية
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>
            كل براند بيئة مستقلة — بيانات، تكاليف، وتقارير منفصلة
          </p>
        </div>

        {/* Brand Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: regularBrands.length === 1 ? '1fr' : '1fr 1fr', gap: 20 }}>

          {regularBrands.map((brand, idx) => {
            const style = BRAND_STYLES[brand.id] ?? DEFAULT_STYLE
            const isActive  = currentBrand === brand.id
            const isHovered = hoveredId === brand.id

            return (
              <div
                key={brand.id}
                onClick={() => handlePick(brand.id)}
                onMouseEnter={() => setHoveredId(brand.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  background: style.bg,
                  border: `1px solid ${isActive || isHovered ? style.cardBorder : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 20,
                  padding: '32px 28px',
                  cursor: 'pointer',
                  transform: `scale(${isHovered ? 1.025 : 1})`,
                  transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), border-color 0.2s, box-shadow 0.25s',
                  boxShadow: isActive || isHovered
                    ? `0 20px 60px ${style.cardGlow}, 0 0 0 1px ${style.cardBorder}`
                    : '0 4px 20px rgba(0,0,0,0.3)',
                  position: 'relative',
                  overflow: 'hidden',
                  animationDelay: `${idx * 80}ms`,
                }}
              >
                {isActive && (
                  <div style={{
                    position: 'absolute', top: 16, left: 16,
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                    background: style.badgeBg, color: style.badgeText,
                    padding: '4px 12px', borderRadius: 20,
                    border: `1px solid ${style.cardBorder}`,
                  }}>
                    ● الحالي
                  </div>
                )}
                <div style={{ height: 3, background: style.accentBar, borderRadius: 4, marginBottom: 24 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 32, background: 'rgba(255,255,255,0.08)',
                    border: `1px solid ${style.cardBorder}`, flexShrink: 0,
                  }}>
                    {style.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{brand.name_ar}</div>
                    <div style={{ fontSize: 13, color: style.badgeText, marginTop: 2 }}>{brand.name}</div>
                  </div>
                </div>
                <button style={{
                  width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
                  background: isActive ? style.btnBg : 'rgba(255,255,255,0.08)',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: isActive ? `0 8px 24px ${style.btnShadow}` : 'none',
                  letterSpacing: '0.03em',
                }}>
                  {isActive ? '✓ متصل الآن' : 'دخول →'}
                </button>
              </div>
            )
          })}

          {/* ── Standalone systems — one per row, full width ── */}
          {standaloneBrands.map((brand) => {
            const isHovered = hoveredId === brand.id
            const color = brand.primary_color ?? '#22c55e'
            const colorAlpha = (a: number) => {
              // Parse hex to rgba for dynamic color usage
              const r = parseInt(color.slice(1, 3), 16)
              const g = parseInt(color.slice(3, 5), 16)
              const b = parseInt(color.slice(5, 7), 16)
              return `rgba(${r},${g},${b},${a})`
            }

            return (
              <div
                key={brand.id}
                onClick={() => { if (brand.external_url) window.location.href = brand.external_url }}
                onMouseEnter={() => setHoveredId(brand.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  gridColumn: '1 / -1',
                  background: isHovered
                    ? `linear-gradient(145deg, #052010 0%, #0a3018 40%, #0f4a28 100%)`
                    : `linear-gradient(145deg, #041a0d 0%, #072415 40%, #0c3820 100%)`,
                  border: `1px solid ${isHovered ? colorAlpha(0.45) : colorAlpha(0.18)}`,
                  borderRadius: 20,
                  padding: '24px 28px',
                  cursor: brand.external_url ? 'pointer' : 'default',
                  transition: 'border-color 0.2s, box-shadow 0.25s, background 0.25s',
                  boxShadow: isHovered
                    ? `0 16px 50px ${colorAlpha(0.15)}, 0 0 0 1px ${colorAlpha(0.35)}`
                    : '0 4px 20px rgba(0,0,0,0.3)',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 28,
                }}
              >
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: `linear-gradient(to right, ${color}88, ${color}, ${color}aa)`,
                  borderRadius: '20px 20px 0 0',
                }} />
                <div style={{
                  position: 'absolute', top: 16, left: 16,
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                  background: colorAlpha(0.15), color: color,
                  padding: '4px 12px', borderRadius: 20,
                  border: `1px solid ${colorAlpha(0.3)}`,
                }}>
                  ↗ نظام مستقل
                </div>
                <div style={{
                  width: 72, height: 72, borderRadius: 18, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 36, background: colorAlpha(0.1),
                  border: `1px solid ${colorAlpha(0.3)}`,
                }}>
                  🥬
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{brand.name}</div>
                  <div style={{ fontSize: 13, color, marginTop: 2 }}>{brand.name_ar}</div>
                  {brand.external_url && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 4, fontFamily: 'monospace' }}>
                      {brand.external_url}
                    </div>
                  )}
                </div>
                <button style={{
                  padding: '12px 28px', borderRadius: 12, border: 'none', flexShrink: 0,
                  background: isHovered ? color : colorAlpha(0.12),
                  color: isHovered ? '#fff' : color,
                  fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: isHovered ? `0 8px 24px ${colorAlpha(0.35)}` : 'none',
                  letterSpacing: '0.03em', whiteSpace: 'nowrap',
                }}>
                  فتح النظام ↗
                </button>
              </div>
            )
          })}

        </div>

        {canClose && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button
              onClick={handleClose}
              style={{
                background: 'none', border: 'none',
                color: 'rgba(255,255,255,0.3)',
                fontSize: 13, cursor: 'pointer', padding: '8px 16px',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
            >
              إغلاق ← الاستمرار مع {regularBrands.find(b => b.id === currentBrand)?.name_ar ?? currentBrand}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
