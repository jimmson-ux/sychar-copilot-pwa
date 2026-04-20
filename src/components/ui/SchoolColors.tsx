'use client'

/**
 * SchoolColors
 *
 * Utility hook + components for using school theme colors safely in V0
 * components. Because Tailwind purges dynamic class strings like
 * `bg-[${color}]` at build time, all school-specific colors MUST be
 * applied via inline styles. This module provides typed helpers so V0
 * components never have to think about that constraint.
 *
 * ── HOOK ────────────────────────────────────────────────────────────────────
 *
 *   const colors = useSchoolColors()
 *
 *   colors.primary          "#1e40af"
 *   colors.secondary        "#22c55e"
 *   colors.gradientFrom     "#1e40af"
 *   colors.gradientTo       "#22c55e"
 *
 *   colors.bg.primary       { backgroundColor: "#1e40af" }
 *   colors.bg.secondary     { backgroundColor: "#22c55e" }
 *   colors.bg.gradient      { background: "linear-gradient(135deg, #1e40af, #22c55e)" }
 *   colors.bg.gradientH     { background: "linear-gradient(to right, #1e40af, #22c55e)" }
 *
 *   colors.text.primary     { color: "#1e40af" }
 *   colors.text.secondary   { color: "#22c55e" }
 *   colors.text.onPrimary   { color: "#ffffff" }  (white — always readable on dark primary)
 *
 *   colors.border.primary   { borderColor: "#1e40af" }
 *   colors.border.secondary { borderColor: "#22c55e" }
 *
 *   colors.ring.primary     { outlineColor: "#1e40af", outlineWidth: 2, outlineStyle: "solid" }
 *
 *   colors.alpha(colors.primary, 0.1)  → "rgba(..., 0.1)"  (soft bg tint)
 *
 * ── COMPONENTS ──────────────────────────────────────────────────────────────
 *
 *   <GradientBadge>Featured</GradientBadge>
 *   → pill with school gradient bg, white text
 *
 *   <PrimaryButton onClick={...}>Save</PrimaryButton>
 *   → button with school primary bg, hover darkens 10%
 *
 *   <GradientBar value={75} max={100} />
 *   → horizontal progress bar using school gradient
 *
 *   <AccentDivider />
 *   → 2px rule in school primary color
 */

import React, { CSSProperties } from 'react'
import { useSchool } from '@/hooks/useSchool'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SchoolColorSet {
  primary:      string
  secondary:    string
  gradientFrom: string
  gradientTo:   string

  bg: {
    primary:    CSSProperties
    secondary:  CSSProperties
    gradient:   CSSProperties   // 135deg diagonal
    gradientH:  CSSProperties   // left → right
    gradientV:  CSSProperties   // top → bottom
    soft:       CSSProperties   // 10% alpha primary tint
  }

  text: {
    primary:    CSSProperties
    secondary:  CSSProperties
    onPrimary:  CSSProperties   // white — always readable on primary bg
    gradient:   CSSProperties   // WebkitBackgroundClip text gradient
  }

  border: {
    primary:    CSSProperties
    secondary:  CSSProperties
  }

  ring: CSSProperties

  /** Convert a hex color to rgba with given opacity */
  alpha: (hex: string, opacity: number) => string
}

// ── Hex → RGBA helper ─────────────────────────────────────────────────────────

function hexToRgba(hex: string, opacity: number): string {
  const clean = hex.replace('#', '')
  const len   = clean.length
  const r = parseInt(len === 3 ? clean[0] + clean[0] : clean.slice(0, 2), 16)
  const g = parseInt(len === 3 ? clean[1] + clean[1] : clean.slice(2, 4), 16)
  const b = parseInt(len === 3 ? clean[2] + clean[2] : clean.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(30,64,175,${opacity})`
  return `rgba(${r},${g},${b},${opacity})`
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSchoolColors(): SchoolColorSet {
  const { theme } = useSchool()

  const primary   = theme.primary_color   || '#1e40af'
  const secondary = theme.secondary_color || '#22c55e'
  const from      = theme.gradient_from   || primary
  const to        = theme.gradient_to     || secondary

  const alpha = (hex: string, opacity: number) => hexToRgba(hex, opacity)

  return {
    primary,
    secondary,
    gradientFrom: from,
    gradientTo:   to,

    bg: {
      primary:   { backgroundColor: primary },
      secondary: { backgroundColor: secondary },
      gradient:  { background: `linear-gradient(135deg, ${from}, ${to})` },
      gradientH: { background: `linear-gradient(to right, ${from}, ${to})` },
      gradientV: { background: `linear-gradient(to bottom, ${from}, ${to})` },
      soft:      { backgroundColor: alpha(primary, 0.08) },
    },

    text: {
      primary:   { color: primary },
      secondary: { color: secondary },
      onPrimary: { color: '#ffffff' },
      gradient:  {
        background:              `linear-gradient(to right, ${from}, ${to})`,
        WebkitBackgroundClip:    'text',
        WebkitTextFillColor:     'transparent',
        backgroundClip:          'text',
      },
    },

    border: {
      primary:   { borderColor: primary },
      secondary: { borderColor: secondary },
    },

    ring: {
      outlineColor:  primary,
      outlineWidth:  2,
      outlineStyle:  'solid',
      outlineOffset: 2,
    },

    alpha,
  }
}

// ── Compound components ───────────────────────────────────────────────────────

/** Pill badge with school gradient background */
export function GradientBadge({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  const colors = useSchoolColors()
  return (
    <span
      className={className}
      style={{
        ...colors.bg.gradient,
        color:        '#ffffff',
        fontSize:     11,
        fontWeight:   700,
        padding:      '2px 10px',
        borderRadius: 999,
        display:      'inline-block',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  )
}

/** Primary action button using school color */
export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  className = '',
  type = 'button',
}: {
  children:   React.ReactNode
  onClick?:   () => void
  disabled?:  boolean
  className?: string
  type?:      'button' | 'submit' | 'reset'
}) {
  const colors = useSchoolColors()
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        ...colors.bg.gradient,
        color:        '#ffffff',
        border:       'none',
        borderRadius: 10,
        padding:      '10px 20px',
        fontWeight:   600,
        fontSize:     14,
        cursor:       disabled ? 'not-allowed' : 'pointer',
        opacity:      disabled ? 0.5 : 1,
        transition:   'opacity 0.15s, transform 0.1s',
        fontFamily:   'var(--font-dm-sans), DM Sans, sans-serif',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = '0.9' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.opacity = '1' }}
    >
      {children}
    </button>
  )
}

/** Horizontal progress bar using school gradient */
export function GradientBar({
  value,
  max = 100,
  height = 8,
  className = '',
}: {
  value:      number
  max?:       number
  height?:    number
  className?: string
}) {
  const colors = useSchoolColors()
  const pct    = Math.min(100, Math.max(0, Math.round((value / max) * 100)))
  return (
    <div
      className={className}
      style={{
        width:           '100%',
        height:          height,
        backgroundColor: '#f1f5f9',
        borderRadius:    height,
        overflow:        'hidden',
      }}
    >
      <div
        style={{
          width:        `${pct}%`,
          height:       '100%',
          borderRadius: height,
          transition:   'width 0.4s ease',
          ...colors.bg.gradientH,
        }}
      />
    </div>
  )
}

/** 2px horizontal rule in school primary color */
export function AccentDivider({ className = '' }: { className?: string }) {
  const colors = useSchoolColors()
  return (
    <div
      className={className}
      style={{
        height:          2,
        borderRadius:    1,
        width:           '100%',
        ...colors.bg.gradientH,
      }}
    />
  )
}
