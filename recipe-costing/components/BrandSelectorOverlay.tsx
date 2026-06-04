'use client'

import { useEffect, useState } from 'react'
import type { BrandId } from '@/types'

interface Props {
  visible: boolean
  currentBrand: BrandId
  onPick: (brand: BrandId) => void
  onClose: () => void
  canClose: boolean
}

const BRANDS = [
  {
    id: 'ti' as BrandId,
    name: 'Three In',
    nameAr: 'ثري إن',
    tagline: 'Burger & Steak',
    taglineAr: 'برجر وستيك',
    icon: '🍔',
    bg: 'linear-gradient(145deg, #0a1628 0%, #0e2040 40%, #1a3a6a 100%)',
    cardBorder: 'rgba(59,130,246,0.35)',
    cardGlow: 'rgba(59,130,246,0.15)',
    accentBar: 'linear-gradient(to right, #1e3a8a, #3b82f6, #93c5fd)',
    badgeBg: 'rgba(59,130,246,0.2)',
    badgeText: '#93c5fd',
    btnBg: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
    btnShadow: 'rgba(59,130,246,0.4)',
    stats: [
      { label: 'وجبات رئيسية', value: 'Meal' },
      { label: 'منتجات وسيطة', value: 'Batch' },
      { label: 'برجر وستيك', value: '' },
    ],
  },
  {
    id: 'bb' as BrandId,
    name: 'باب البلد',
    nameAr: 'Bab Al Balad',
    tagline: 'المطبخ العربي الأصيل',
    taglineAr: 'Traditional Arabic Kitchen',
    icon: '🫕',
    bg: 'linear-gradient(145deg, #120500 0%, #1c0a00 40%, #3d1a00 100%)',
    cardBorder: 'rgba(217,119,6,0.35)',
    cardGlow: 'rgba(217,119,6,0.12)',
    accentBar: 'linear-gradient(to right, #92400e, #d97706, #fbbf24)',
    badgeBg: 'rgba(217,119,6,0.2)',
    badgeText: '#fcd34d',
    btnBg: 'linear-gradient(135deg, #b45309, #d97706)',
    btnShadow: 'rgba(217,119,6,0.4)',
    stats: [
      { label: 'مطبق وفطيرة', value: '' },
      { label: 'فول وبيض', value: '' },
      { label: 'مشويات يمنية', value: '' },
    ],
  },
]

export default function BrandSelectorOverlay({ visible, currentBrand, onPick, onClose, canClose }: Props) {
  const [show, setShow] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [hoveredId, setHoveredId] = useState<BrandId | null>(null)

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
    setTimeout(() => {
      onPick(brand)
    }, 400)
  }

  function handleClose() {
    setLeaving(true)
    setTimeout(() => onClose(), 400)
  }

  if (!visible) return null

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
      {/* Slide panel */}
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {BRANDS.map((brand, idx) => {
            const isActive  = currentBrand === brand.id
            const isHovered = hoveredId === brand.id
            const scale     = isHovered ? 1.025 : 1

            return (
              <div
                key={brand.id}
                onClick={() => handlePick(brand.id)}
                onMouseEnter={() => setHoveredId(brand.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  background: brand.bg,
                  border: `1px solid ${isActive || isHovered ? brand.cardBorder : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 20,
                  padding: '32px 28px',
                  cursor: 'pointer',
                  transform: `scale(${scale})`,
                  transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), border-color 0.2s, box-shadow 0.25s',
                  boxShadow: isActive || isHovered
                    ? `0 20px 60px ${brand.cardGlow}, 0 0 0 1px ${brand.cardBorder}`
                    : '0 4px 20px rgba(0,0,0,0.3)',
                  position: 'relative',
                  overflow: 'hidden',
                  animationDelay: `${idx * 80}ms`,
                }}
              >
                {/* Active badge */}
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    top: 16,
                    left: 16,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    background: brand.badgeBg,
                    color: brand.badgeText,
                    padding: '4px 12px',
                    borderRadius: 20,
                    border: `1px solid ${brand.cardBorder}`,
                  }}>
                    ● الحالي
                  </div>
                )}

                {/* Top accent bar */}
                <div style={{ height: 3, background: brand.accentBar, borderRadius: 4, marginBottom: 24 }} />

                {/* Icon + Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 32,
                    background: 'rgba(255,255,255,0.08)',
                    border: `1px solid ${brand.cardBorder}`,
                    flexShrink: 0,
                  }}>
                    {brand.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                      {brand.name}
                    </div>
                    <div style={{ fontSize: 13, color: brand.badgeText, marginTop: 2 }}>
                      {brand.nameAr}
                    </div>
                  </div>
                </div>

                {/* Tagline */}
                <div style={{
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.55)',
                  marginBottom: 8,
                  lineHeight: 1.5,
                }}>
                  {brand.tagline}
                </div>
                <div style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.3)',
                  marginBottom: 24,
                }}>
                  {brand.taglineAr}
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 20 }} />

                {/* CTA Button */}
                <button
                  style={{
                    width: '100%',
                    padding: '12px 0',
                    borderRadius: 12,
                    border: 'none',
                    background: isActive ? brand.btnBg : 'rgba(255,255,255,0.08)',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: isActive ? `0 8px 24px ${brand.btnShadow}` : 'none',
                    letterSpacing: '0.03em',
                  }}
                >
                  {isActive ? '✓ متصل الآن' : 'دخول →'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Close / Cancel */}
        {canClose && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button
              onClick={handleClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.3)',
                fontSize: 13,
                cursor: 'pointer',
                padding: '8px 16px',
                transition: 'color 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
            >
              إغلاق ← الاستمرار مع {BRANDS.find(b => b.id === currentBrand)?.name}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
