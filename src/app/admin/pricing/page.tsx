'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { GlobalPricing } from '@/lib/billing'
import { formatKES, ADDON_KEYS } from '@/lib/billing'
import { ADDON_META } from '@/lib/features'

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

const FONT_DISPLAY = 'var(--font-display, Syne, sans-serif)'
const FONT_MONO    = 'var(--font-mono, "JetBrains Mono", monospace)'

// ── Population tiers — reference only ────────────────────────
const TIERS = [
  { label: 'Under 400 students',    max: '≤ 399',      base: 48000  },
  { label: '400–900 students',      max: '400–900',    base: 53500  },
  { label: '901–1,500 students',    max: '901–1,500',  base: 57500  },
  { label: '1,501–2,500 students',  max: '1,501–2,500',base: 62500  },
  { label: 'Over 2,500 students',   max: '> 2,500',    base: 68000  },
]

export default function AdminPricingPage() {
  const [pricing,  setPricing]  = useState<GlobalPricing | null>(null)
  const [edited,   setEdited]   = useState<GlobalPricing | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data } = await supabase
        .from('global_settings')
        .select('addon_pricing')
        .eq('id', 1)
        .single()
      if (data) {
        const p = data.addon_pricing as GlobalPricing
        setPricing(p)
        setEdited({ ...p })
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  const isDirty = pricing && edited && JSON.stringify(pricing) !== JSON.stringify(edited)

  async function handleSave() {
    if (!edited) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('global_settings')
      .update({ addon_pricing: edited })
      .eq('id', 1)
    if (!error) {
      setPricing({ ...edited })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
    setSaving(false)
  }

  function handleReset() {
    if (pricing) setEdited({ ...pricing })
  }

  function updateField(key: keyof GlobalPricing, raw: string) {
    const value = parseInt(raw.replace(/\D/g, ''), 10)
    if (!edited) return
    setEdited(prev => prev ? { ...prev, [key]: isNaN(value) ? 0 : value } : prev)
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.text, maxWidth: 700 }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 26, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
          Global Pricing
        </h1>
        <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.muted, margin: '5px 0 0' }}>
          Changes apply to new invoices only — existing subscriptions are not affected
        </p>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontFamily: FONT_MONO, fontSize: 12 }}>
          Loading…
        </div>
      ) : (
        <>
          {/* ── Add-on pricing ───────────────────────────── */}
          <div style={{
            background:   C.surface,
            border:       `1px solid ${C.borderSub}`,
            borderRadius: 12,
            overflow:     'hidden',
            marginBottom: 24,
          }}>
            <div style={{
              padding:      '14px 18px',
              borderBottom: `1px solid ${C.borderSub}`,
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.12em', color: C.dim, textTransform: 'uppercase' }}>
                Add-on Module Prices
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.dim }}>
                per school / year
              </span>
            </div>

            {ADDON_KEYS.map((key, i) => {
              const meta    = ADDON_META[key]
              const current = pricing?.[key]
              const value   = edited?.[key] ?? 0
              const changed = current !== value

              return (
                <div
                  key={key}
                  style={{
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent: 'space-between',
                    padding:      '14px 18px',
                    borderBottom: i < ADDON_KEYS.length - 1 ? `1px solid ${C.borderSub}` : 'none',
                    gap:          16,
                    background:   changed ? 'rgba(232,89,60,0.04)' : 'transparent',
                    transition:   'background 0.2s',
                  }}
                >
                  {/* Label */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: C.text, margin: 0 }}>
                      {meta.label}
                    </p>
                    <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.muted, margin: '3px 0 0' }}>
                      {meta.description}
                    </p>
                  </div>

                  {/* Price input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {changed && (
                      <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.dim, textDecoration: 'line-through' }}>
                        {formatKES(current ?? 0)}
                      </span>
                    )}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{
                        position:   'absolute',
                        left:       10,
                        fontFamily: FONT_MONO,
                        fontSize:   11,
                        color:      C.dim,
                        pointerEvents: 'none',
                        userSelect: 'none',
                      }}>
                        KES
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={value.toLocaleString('en-KE')}
                        onChange={e => updateField(key, e.target.value)}
                        style={{
                          background:   C.elevated,
                          border:       `1px solid ${changed ? C.accent + '60' : C.borderStr}`,
                          borderRadius: 6,
                          color:        changed ? C.accent : C.text,
                          fontFamily:   FONT_MONO,
                          fontSize:     13,
                          fontWeight:   600,
                          padding:      '7px 10px 7px 38px',
                          width:        130,
                          outline:      'none',
                          textAlign:    'right',
                          boxSizing:    'border-box',
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Save / reset bar ─────────────────────────── */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '14px 18px',
            background:     C.surface,
            border:         `1px solid ${C.borderSub}`,
            borderRadius:   10,
            marginBottom:   32,
          }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: saved ? C.green : isDirty ? C.amber : C.dim }}>
              {saved ? '✓ Changes saved' : isDirty ? '● Unsaved changes' : '— No changes'}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleReset}
                disabled={!isDirty || saving}
                style={{
                  padding:      '8px 16px',
                  borderRadius: 6,
                  border:       `1px solid ${C.borderStr}`,
                  background:   'transparent',
                  color:        isDirty ? C.muted : C.dim,
                  fontFamily:   FONT_DISPLAY,
                  fontSize:     12,
                  cursor:       isDirty ? 'pointer' : 'not-allowed',
                }}
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={!isDirty || saving}
                style={{
                  padding:      '8px 20px',
                  borderRadius: 6,
                  border:       'none',
                  background:   isDirty && !saving ? C.accent : C.dim,
                  color:        '#fff',
                  fontFamily:   FONT_DISPLAY,
                  fontWeight:   600,
                  fontSize:     12,
                  cursor:       isDirty && !saving ? 'pointer' : 'not-allowed',
                  transition:   'background 0.15s',
                }}
              >
                {saving ? 'Saving…' : 'Commit Changes'}
              </button>
            </div>
          </div>

          {/* ── Population tiers (reference) ─────────────── */}
          <div style={{
            background:   C.surface,
            border:       `1px solid ${C.borderSub}`,
            borderRadius: 12,
            overflow:     'hidden',
          }}>
            <div style={{
              padding:      '14px 18px',
              borderBottom: `1px solid ${C.borderSub}`,
            }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.12em', color: C.dim, textTransform: 'uppercase' }}>
                Platform Base Fees — Population Tiers
              </span>
              <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.dim, margin: '4px 0 0' }}>
                These are hardcoded in the billing engine. Contact dev to update.
              </p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.borderSub}` }}>
                  {['Tier', 'Student Range', 'Base / yr'].map((col, i) => (
                    <th key={i} style={{
                      padding:       '10px 18px',
                      textAlign:     'left',
                      fontFamily:    FONT_MONO,
                      fontSize:      9,
                      letterSpacing: '0.1em',
                      color:         C.dim,
                      textTransform: 'uppercase',
                      fontWeight:    500,
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIERS.map((tier, i) => (
                  <tr
                    key={tier.label}
                    style={{ borderBottom: i < TIERS.length - 1 ? `1px solid ${C.borderSub}` : 'none' }}
                  >
                    <td style={{ padding: '11px 18px', fontSize: 12, color: C.text, fontWeight: 500 }}>
                      {tier.label}
                    </td>
                    <td style={{ padding: '11px 18px', fontFamily: FONT_MONO, fontSize: 11, color: C.muted }}>
                      {tier.max}
                    </td>
                    <td style={{ padding: '11px 18px', fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: C.green }}>
                      {formatKES(tier.base)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
