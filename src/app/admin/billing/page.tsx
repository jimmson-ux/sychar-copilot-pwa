'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { School, GlobalPricing } from '@/lib/billing'
import {
  calculateYearlyInvoice,
  formatKES,
  getDaysUntilExpiry,
  getExpiryBadge,
  ADDON_KEYS,
} from '@/lib/billing'

// ── Design tokens ─────────────────────────────────────────────
const C = {
  bg:       '#0a0a0b',
  surface:  '#111114',
  elevated: '#18181d',
  borderSub:'rgba(255,255,255,0.07)',
  borderStr:'rgba(255,255,255,0.13)',
  text:     '#e8e6e1',
  muted:    '#7a7870',
  dim:      '#4a4845',
  accent:   '#e8593c',
  green:    '#1d9e75',
  amber:    '#ef9f27',
  red:      '#e24b4a',
  blue:     '#3b8bd4',
} as const

const BADGE_HEX: Record<'green' | 'amber' | 'red', string> = {
  green: C.green,
  amber: C.amber,
  red:   C.red,
}

const FONT_DISPLAY = 'var(--font-display, Syne, sans-serif)'
const FONT_MONO    = 'var(--font-mono, "JetBrains Mono", monospace)'

type FilterMode = 'all' | 'active' | 'suspended'

export default function AdminBillingPage() {
  const [schools,  setSchools]  = useState<School[]>([])
  const [pricing,  setPricing]  = useState<GlobalPricing | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<FilterMode>('all')

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const [schoolsRes, pricingRes] = await Promise.all([
        supabase.from('schools').select('*').order('name', { ascending: true }),
        supabase.from('global_settings').select('addon_pricing').eq('id', 1).single(),
      ])
      if (schoolsRes.data) setSchools(schoolsRes.data as School[])
      if (pricingRes.data) setPricing(pricingRes.data.addon_pricing as GlobalPricing)
      setLoading(false)
    }
    fetchData()
  }, [])

  // ── Derived stats ───────────────────────────────────────────
  const activeSchools   = schools.filter(s => s.is_active)
  const totalARR        = pricing
    ? schools.reduce((sum, s) => sum + calculateYearlyInvoice(s, pricing).totalYearly, 0)
    : 0
  const activeARR       = pricing
    ? activeSchools.reduce((sum, s) => sum + calculateYearlyInvoice(s, pricing).totalYearly, 0)
    : 0
  const expiringCount   = activeSchools.filter(s => {
    const d = getDaysUntilExpiry(s.subscription_expires_at)
    return d >= 0 && d <= 30
  }).length

  // ── Filtered rows ───────────────────────────────────────────
  const filteredSchools = schools
    .filter(s => {
      if (filter === 'active')    return s.is_active
      if (filter === 'suspended') return !s.is_active
      return true
    })
    .filter(s => {
      if (!search) return true
      const q = search.toLowerCase()
      return s.name.toLowerCase().includes(q) || s.county.toLowerCase().includes(q)
    })

  // ── CSV export ──────────────────────────────────────────────
  function exportCSV() {
    if (!pricing) return
    const header = 'School,County,Students,Tier,Base (KES),Add-ons (KES),Total/yr (KES),Expiry,Status'
    const rows   = filteredSchools.map(s => {
      const inv = calculateYearlyInvoice(s, pricing)
      return [
        `"${s.name}"`,
        `"${s.county}"`,
        s.student_count,
        `"${inv.tier}"`,
        inv.basePrice,
        inv.addonsPrice,
        inv.totalYearly,
        s.subscription_expires_at.split('T')[0],
        s.is_active ? 'Active' : 'Suspended',
      ].join(',')
    })
    const csv  = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `sychar-billing-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.text }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 26, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
            Billing Overview
          </h1>
          <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.muted, margin: '5px 0 0' }}>
            {activeSchools.length} active schools · {schools.length} total
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={!pricing || loading}
          style={{
            background:   C.elevated,
            color:        pricing ? C.text : C.dim,
            border:       `1px solid ${C.borderStr}`,
            borderRadius: 8,
            padding:      '10px 18px',
            fontFamily:   FONT_MONO,
            fontSize:     11,
            letterSpacing:'0.06em',
            cursor:       pricing ? 'pointer' : 'not-allowed',
          }}
        >
          ↓ EXPORT CSV
        </button>
      </div>

      {/* ── Stats row ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'TOTAL ARR',        value: formatKES(totalARR),        sub: 'all schools',     color: C.text  },
          { label: 'ACTIVE ARR',       value: formatKES(activeARR),       sub: 'live only',       color: C.green },
          { label: 'ACTIVE SCHOOLS',   value: String(activeSchools.length), sub: `of ${schools.length} total`, color: C.blue  },
          { label: 'EXPIRING ≤ 30D',   value: String(expiringCount),      sub: 'need renewal',    color: expiringCount > 0 ? C.amber : C.dim },
        ].map(stat => (
          <div key={stat.label} style={{
            background:   C.surface,
            border:       `1px solid ${C.borderSub}`,
            borderRadius: 10,
            padding:      '16px 18px',
          }}>
            <p style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.12em', color: C.dim, textTransform: 'uppercase', margin: '0 0 8px' }}>
              {stat.label}
            </p>
            <p style={{ fontFamily: FONT_MONO, fontSize: 22, fontWeight: 700, color: stat.color, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
              {loading ? '—' : stat.value}
            </p>
            <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.dim, margin: 0 }}>
              {stat.sub}
            </p>
          </div>
        ))}
      </div>

      {/* ── Expiry alert banner ────────────────────────────── */}
      {expiringCount > 0 && (
        <div style={{
          background:   'rgba(239,159,39,0.10)',
          border:       `1px solid rgba(239,159,39,0.25)`,
          borderRadius: 8,
          padding:      '10px 16px',
          marginBottom: 16,
          display:      'flex',
          alignItems:   'center',
          gap:          10,
        }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.amber }}>
            {expiringCount} school{expiringCount !== 1 ? 's' : ''} expiring within 30 days — highlighted in table below
          </span>
        </div>
      )}

      {/* ── Filter bar ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input
          placeholder="Search school or county…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width:        240,
            background:   C.surface,
            border:       `1px solid ${C.borderSub}`,
            borderRadius: 6,
            color:        C.text,
            fontFamily:   FONT_DISPLAY,
            fontSize:     13,
            padding:      '8px 12px',
            outline:      'none',
            boxSizing:    'border-box',
          }}
        />
        {(['all', 'active', 'suspended'] as FilterMode[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding:      '7px 14px',
              borderRadius: 6,
              border:       `1px solid ${filter === f ? C.borderStr : C.borderSub}`,
              background:   filter === f ? C.elevated : 'transparent',
              color:        filter === f ? C.text : C.muted,
              fontFamily:   FONT_DISPLAY,
              fontSize:     12,
              fontWeight:   filter === f ? 600 : 400,
              cursor:       'pointer',
              textTransform:'capitalize',
            }}
          >
            {f}
          </button>
        ))}
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.dim, marginLeft: 'auto' }}>
          {filteredSchools.length} rows
        </span>
      </div>

      {/* ── Billing table ──────────────────────────────────── */}
      <div style={{
        background:   C.surface,
        border:       `1px solid ${C.borderSub}`,
        borderRadius: 12,
        overflow:     'hidden',
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: FONT_MONO, fontSize: 12 }}>
            Loading…
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.borderSub}` }}>
                {['School', 'County', 'Students', 'Tier', 'Base', 'Add-ons', 'Total / yr', 'Expires', 'Status'].map((col, i) => (
                  <th key={i} style={{
                    padding:       '11px 14px',
                    textAlign:     'left',
                    fontFamily:    FONT_MONO,
                    fontSize:      10,
                    letterSpacing: '0.08em',
                    color:         C.dim,
                    textTransform: 'uppercase',
                    fontWeight:    500,
                    whiteSpace:    'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSchools.map(school => {
                const inv   = pricing ? calculateYearlyInvoice(school, pricing) : null
                const days  = getDaysUntilExpiry(school.subscription_expires_at)
                const badge = getExpiryBadge(days)
                const expiryRowBg = !school.is_active ? 'transparent'
                  : days < 0   ? 'rgba(226,75,74,0.07)'
                  : days <= 30 ? 'rgba(239,159,39,0.05)'
                  : 'transparent'

                return (
                  <tr
                    key={school.id}
                    style={{
                      borderBottom: `1px solid ${C.borderSub}`,
                      opacity:      school.is_active ? 1 : 0.45,
                      background:   expiryRowBg,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.02)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = expiryRowBg }}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{school.name}</span>
                      {!school.is_active && (
                        <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: C.red, letterSpacing: '0.1em', marginTop: 2 }}>TERMINATED</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: C.muted }}>{school.county}</td>
                    <td style={{ padding: '12px 14px', fontFamily: FONT_MONO, fontSize: 12, color: C.text }}>
                      {school.student_count.toLocaleString('en-KE')}
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: FONT_MONO, fontSize: 10, color: C.muted }}>
                      {inv?.tier ?? '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: FONT_MONO, fontSize: 12, color: C.text }}>
                      {inv ? formatKES(inv.basePrice) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: FONT_MONO, fontSize: 12, color: inv?.addonsPrice ? C.blue : C.dim }}>
                      {inv ? formatKES(inv.addonsPrice) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: C.green }}>
                      {inv ? formatKES(inv.totalYearly) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        fontFamily:    FONT_MONO,
                        fontSize:      10,
                        color:         BADGE_HEX[badge.color],
                        background:    BADGE_HEX[badge.color] + '18',
                        border:        `1px solid ${BADGE_HEX[badge.color]}30`,
                        borderRadius:  4,
                        padding:       '3px 7px',
                        whiteSpace:    'nowrap',
                      }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        fontFamily:    FONT_MONO,
                        fontSize:      10,
                        color:         school.is_active ? C.green : C.red,
                        background:    school.is_active ? `${C.green}15` : `${C.red}15`,
                        border:        `1px solid ${school.is_active ? C.green : C.red}30`,
                        borderRadius:  4,
                        padding:       '3px 8px',
                      }}>
                        {school.is_active ? '● live' : '● off'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {filteredSchools.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: C.dim, fontFamily: FONT_MONO, fontSize: 12 }}>
                    No schools match filter.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Totals footer */}
            {filteredSchools.length > 0 && pricing && (
              <tfoot>
                <tr style={{ borderTop: `1px solid ${C.borderStr}`, background: C.elevated }}>
                  <td colSpan={6} style={{ padding: '11px 14px', fontFamily: FONT_MONO, fontSize: 10, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Subtotal ({filteredSchools.length} schools)
                  </td>
                  <td style={{ padding: '11px 14px', fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: C.green }}>
                    {formatKES(filteredSchools.reduce((sum, s) => sum + calculateYearlyInvoice(s, pricing).totalYearly, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  )
}
