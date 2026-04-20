'use client'

/**
 * SchoolLogo
 *
 * Renders the school's logo from theme context.
 * Falls back to the Sychar default icon if the school has no logo configured.
 *
 * Usage:
 *   <SchoolLogo size="md" />
 *   <SchoolLogo size="lg" className="rounded-full" />
 *   <SchoolLogo size="sm" showName />
 *
 * Props:
 *   size     — 'sm' (32px) | 'md' (48px) | 'lg' (80px)
 *   showName — renders school short name beside the logo
 *   className — additional classes on the img element
 */

import React, { useState } from 'react'
import { useSchool } from '@/hooks/useSchool'

const SIZES = {
  sm:  32,
  md:  48,
  lg:  80,
} as const

const FALLBACK = '/icon-192.png'

interface SchoolLogoProps {
  size?:      keyof typeof SIZES
  showName?:  boolean
  className?: string
}

export function SchoolLogo({ size = 'md', showName = false, className = '' }: SchoolLogoProps) {
  const { theme, schoolName, shortName } = useSchool()
  const [imgError, setImgError] = useState(false)

  const px  = SIZES[size]
  const src = (!imgError && theme.logo_url) ? theme.logo_url : FALLBACK

  const img = (
    <img
      src={src}
      alt={schoolName}
      width={px}
      height={px}
      onError={() => setImgError(true)}
      className={className}
      style={{
        width:        px,
        height:       px,
        objectFit:    'contain',
        borderRadius: size === 'sm' ? 6 : size === 'md' ? 8 : 12,
        flexShrink:   0,
      }}
    />
  )

  if (!showName) return img

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size === 'sm' ? 6 : 10 }}>
      {img}
      <span style={{
        fontFamily:  'var(--font-space-grotesk), Space Grotesk, sans-serif',
        fontWeight:  700,
        fontSize:    size === 'sm' ? 13 : size === 'md' ? 15 : 20,
        color:       'var(--school-primary, #1e40af)',
        lineHeight:  1.2,
        letterSpacing: '-0.01em',
      }}>
        {shortName || schoolName}
      </span>
    </div>
  )
}
