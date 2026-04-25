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
import type { SchoolFeatures } from '@/lib/features'
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

const BADGE_HEX: Record<'green' | 'amber' | 'red', string> = {
  green: C.green,
  amber: C.amber,
  red:   C.red,
}

const FONT_DISPLAY = 'var(--font-display, Syne, sans-serif)'
const FONT_MONO    = 'var(--font-mono, "JetBrains Mono", monospace)'

// ── Small helper components ───────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily:    FONT_MONO,
      fontSize:      10,
      letterSpacing: '0.1em',
      color:         C.dim,
      textTransform: 'uppercase',
      marginBottom:  10,
    }}>
      {children}
    </p>
  )
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked:  boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      style={{
        width:      40,
        height:     22,
        borderRadius: 11,
        background: checked ? C.green : 'rgba(255,255,255,0.1)',
        border:     'none',
        position:   'relative',
        cursor:     disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s',
        opacity:    disabled ? 0.45 : 1,
        flexShrink: 0,
        padding:    0,
        outline:    'none',
      }}
    >
      <span style={{
        position:     'absolute',
        top:          3,
        left:         checked ? 21 : 3,
        width:        16,
        height:       16,
        borderRadius: '50%',
        background:   '#e8e6e1',
        transition:   'left 0.15s',
        display:      'block',
      }} />
    </button>
  )
}

// ── New-school form state type ────────────────────────────────

type NewSchoolForm = {
  name:          string
  county:        string
  sub_county:    string
  knec_code:     string
  student_count: string
  contact_name:  string
  contact_phone: string
  contact_email: string
}

const EMPTY_FORM: NewSchoolForm = {
  name:          '',
  county:        '',
  sub_county:    '',
  knec_code:     '',
  student_count: '',
  contact_name:  '',
  contact_phone: '',
  contact_email: '',
}

type FilterMode = 'all' | 'active' | 'suspended'

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function AdminSchoolsPage() {
  const [schools,        setSchools]        = useState<School[]>([])
  const [pricing,        setPricing]        = useState<GlobalPricing | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)
  const [showAddModal,   setShowAddModal]   = useState(false)
  const [search,         setSearch]         = useState('')
  const [filter,         setFilter]         = useState<FilterMode>('all')
  const [saving,         setSaving]         = useState<string | null>(null)
  const [form,           setForm]           = useState<NewSchoolForm>(EMPTY_FORM)
  const [submitting,     setSubmitting]     = useState(false)

  // ── Data fetch ──────────────────────────────────────────────
  async function fetchData() {
    const supabase = createClient()
    const [schoolsRes, pricingRes] = await Promise.all([
      supabase.from('schools')
        .select('*, tenant_configs(school_short_code)')
        .order('created_at', { ascending: false }),
      supabase.from('global_settings').select('addon_pricing').eq('id', 1).single(),
    ])
    if (schoolsRes.data)   setSchools(schoolsRes.data as School[])
    if (pricingRes.data)   setPricing(pricingRes.data.addon_pricing as GlobalPricing)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // ── Sync selectedSchool with fresh data after mutations ─────
  function patchSchool(updated: School) {
    setSchools(prev => prev.map(s => s.id === updated.id ? updated : s))
    setSelectedSchool(prev => prev?.id === updated.id ? updated : prev)
  }

  // ── Toggle feature add-on ───────────────────────────────────
  async function toggleFeature(school: School, featureKey: keyof SchoolFeatures) {
    const key = `${school.id}-${featureKey}`
    setSaving(key)
    const updatedFeatures: SchoolFeatures = {
      ...school.features,
      [featureKey]: !school.features[featureKey],
    }
    const supabase = createClient()
    const { error } = await supabase
      .from('schools')
      .update({ features: updatedFeatures })
      .eq('id', school.id)
    if (!error) patchSchool({ ...school, features: updatedFeatures })
    setSaving(null)
  }

  // ── Toggle school active/suspended ─────────────────────────
  async function toggleActive(school: School) {
    const confirmed = window.confirm(
      school.is_active
        ? `⚠️ Terminate access for "${school.name}"?\n\nThis will immediately block all staff, students and parents from logging in.\n\nSchool data is fully preserved and can be restored at any time.`
        : `Reactivate "${school.name}"?\n\nThis will restore full login access for all users at this school.`,
    )
    if (!confirmed) return

    const supabase = createClient()
    const { error } = await supabase
      .from('schools')
      .update({ is_active: !school.is_active })
      .eq('id', school.id)
    if (!error) patchSchool({ ...school, is_active: !school.is_active })
  }

  // ── Extend subscription ─────────────────────────────────────
  async function extendSubscription(school: School, months: number) {
    const savingKey = `${school.id}-subscription`
    setSaving(savingKey)
    const base     = new Date(Math.max(new Date(school.subscription_expires_at).getTime(), Date.now()))
    base.setMonth(base.getMonth() + months)
    const newIso   = base.toISOString()

    const supabase = createClient()
    const { error } = await supabase
      .from('schools')
      .update({ subscription_expires_at: newIso })
      .eq('id', school.id)
    if (!error) patchSchool({ ...school, subscription_expires_at: newIso })
    setSaving(null)
  }

  // ── Add school ──────────────────────────────────────────────
  async function handleAddSchool(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase.from('schools').insert({
      name:          form.name.trim(),
      county:        form.county.trim(),
      sub_county:    form.sub_county.trim()    || null,
      knec_code:     form.knec_code.trim()     || null,
      student_count: parseInt(form.student_count) || 0,
      contact_name:  form.contact_name.trim()  || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
      features: {
        gate_pass:        false,
        visitor_log:      false,
        staff_attendance: false,
        pocket_money:     false,
        bread_voucher:    false,
      },
      is_active: true,
    })
    if (!error) {
      setShowAddModal(false)
      setForm(EMPTY_FORM)
      await fetchData()
    }
    setSubmitting(false)
  }

  // ── Derived state ───────────────────────────────────────────
  const filteredSchools = schools
    .filter(s => {
      if (filter === 'active')    return s.is_active
      if (filter === 'suspended') return !s.is_active
      return true
    })
    .filter(s => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        s.name.toLowerCase().includes(q) ||
        s.county.toLowerCase().includes(q)
      )
    })

  const activeCount    = schools.filter(s => s.is_active).length
  const suspendedCount = schools.filter(s => !s.is_active).length

  // ── Shared input style ──────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width:           '100%',
    background:      C.elevated,
    border:          `1px solid ${C.borderStr}`,
    borderRadius:    6,
    color:           C.text,
    fontFamily:      FONT_DISPLAY,
    fontSize:        13,
    padding:         '9px 12px',
    outline:         'none',
    boxSizing:       'border-box',
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
            School Fleet
          </h1>
          <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.muted, margin: '5px 0 0' }}>
            <span style={{ color: C.green }}>{activeCount} active</span>
            <span style={{ color: C.dim, margin: '0 6px' }}>·</span>
            <span style={{ color: C.red }}>{suspendedCount} suspended</span>
            <span style={{ color: C.dim, margin: '0 6px' }}>·</span>
            <span>{schools.length} total</span>
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            background:   C.accent,
            color:        '#fff',
            border:       'none',
            borderRadius: 8,
            padding:      '10px 20px',
            fontFamily:   FONT_DISPLAY,
            fontWeight:   600,
            fontSize:     13,
            cursor:       'pointer',
            letterSpacing:'0.01em',
          }}
        >
          + Onboard School
        </button>
      </div>

      {/* ── Filter bar ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <input
          placeholder="Search by name or county…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            ...inputStyle,
            width:        260,
            background:   C.surface,
            border:       `1px solid ${C.borderSub}`,
          }}
        />
        {(['all', 'active', 'suspended'] as FilterMode[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding:      '8px 16px',
              borderRadius: 6,
              border:       `1px solid ${filter === f ? C.borderStr : C.borderSub}`,
              background:   filter === f ? C.elevated : 'transparent',
              color:        filter === f ? C.text : C.muted,
              fontFamily:   FONT_DISPLAY,
              fontSize:     12,
              fontWeight:   filter === f ? 600 : 400,
              cursor:       'pointer',
              transition:   'all 0.15s',
              textTransform:'capitalize',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* ── Content area ───────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* ── Main table ─────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
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
            ) : filteredSchools.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: C.dim, fontFamily: FONT_MONO, fontSize: 12 }}>
                No schools match current filter.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.borderSub}` }}>
                    {['Code', 'School', 'County', 'Students', 'Subscription', 'Add-ons', 'Annual Fee', 'Status', ''].map((col, i) => (
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
                    const isSelected  = selectedSchool?.id === school.id
                    const invoice     = pricing ? calculateYearlyInvoice(school, pricing) : null
                    const days        = getDaysUntilExpiry(school.subscription_expires_at)
                    const badge       = getExpiryBadge(days)
                    const addonCount  = ADDON_KEYS.filter(k => school.features?.[k]).length

                    return (
                      <tr
                        key={school.id}
                        onClick={() => setSelectedSchool(prev => prev?.id === school.id ? null : school)}
                        style={{
                          borderBottom: `1px solid ${C.borderSub}`,
                          cursor:       'pointer',
                          background:   isSelected ? 'rgba(232,89,60,0.06)' : 'transparent',
                          opacity:      school.is_active ? 1 : 0.45,
                          transition:   'background 0.12s',
                        }}
                        onMouseEnter={e => {
                          if (!isSelected)
                            (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.025)'
                        }}
                        onMouseLeave={e => {
                          if (!isSelected)
                            (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'
                        }}
                      >
                        {/* Short code */}
                        <td style={{ padding: '13px 14px' }}>
                          {(() => {
                            const code = Array.isArray(school.tenant_configs)
                              ? school.tenant_configs[0]?.school_short_code
                              : null
                            return code ? (
                              <span style={{
                                fontFamily:    FONT_MONO,
                                fontSize:      13,
                                fontWeight:    700,
                                color:         C.accent,
                                letterSpacing: '0.05em',
                              }}>
                                {code}
                              </span>
                            ) : (
                              <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.dim }}>—</span>
                            )
                          })()}
                        </td>

                        {/* School name */}
                        <td style={{ padding: '13px 14px' }}>
                          <span style={{ fontWeight: 500, fontSize: 13, color: C.text }}>
                            {school.name}
                          </span>
                          {!school.is_active && (
                            <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: C.red, letterSpacing: '0.1em', marginTop: 2 }}>
                              TERMINATED
                            </div>
                          )}
                        </td>

                        {/* County */}
                        <td style={{ padding: '13px 14px', fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>
                          {school.county}
                        </td>

                        {/* Students */}
                        <td style={{ padding: '13px 14px', fontFamily: FONT_MONO, fontSize: 12, color: C.text }}>
                          {school.student_count.toLocaleString('en-KE')}
                        </td>

                        {/* Subscription badge */}
                        <td style={{ padding: '13px 14px' }}>
                          <span style={{
                            fontFamily:    FONT_MONO,
                            fontSize:      10,
                            letterSpacing: '0.05em',
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

                        {/* Add-ons */}
                        <td style={{ padding: '13px 14px', fontFamily: FONT_MONO, fontSize: 12, color: addonCount > 0 ? C.blue : C.dim }}>
                          {addonCount} / 5
                        </td>

                        {/* Annual fee */}
                        <td style={{ padding: '13px 14px', fontFamily: FONT_MONO, fontSize: 12, color: invoice ? C.green : C.dim }}>
                          {invoice ? formatKES(invoice.totalYearly) : '—'}
                        </td>

                        {/* Status pill */}
                        <td style={{ padding: '13px 14px' }}>
                          <span style={{
                            fontFamily:    FONT_MONO,
                            fontSize:      10,
                            color:         school.is_active ? C.green : C.red,
                            background:    school.is_active ? `${C.green}15` : `${C.red}15`,
                            border:        `1px solid ${school.is_active ? C.green : C.red}30`,
                            borderRadius:  4,
                            padding:       '3px 8px',
                            whiteSpace:    'nowrap',
                          }}>
                            {school.is_active ? '● live' : '● off'}
                          </span>
                        </td>

                        {/* Arrow */}
                        <td style={{ padding: '13px 10px', color: isSelected ? C.accent : C.dim, fontSize: 14 }}>
                          ›
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Detail panel ─────────────────────────────────── */}
        {selectedSchool && (
          <div style={{
            width:        380,
            flexShrink:   0,
            background:   C.surface,
            border:       `1px solid ${C.borderSub}`,
            borderRadius: 12,
            overflow:     'hidden',
          }}>
            {/* Panel header */}
            <div style={{
              padding:      '16px 18px',
              borderBottom: `1px solid ${C.borderSub}`,
              display:      'flex',
              alignItems:   'flex-start',
              justifyContent: 'space-between',
              gap:          12,
            }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 14, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedSchool.name}
                </p>
                <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.muted, margin: '4px 0 0' }}>
                  {selectedSchool.county}
                  {selectedSchool.sub_county ? ` · ${selectedSchool.sub_county}` : ''}
                  {'  ·  '}
                  {selectedSchool.student_count.toLocaleString('en-KE')} students
                </p>
              </div>
              <button
                onClick={() => setSelectedSchool(null)}
                style={{
                  background: 'transparent',
                  border:     'none',
                  color:      C.muted,
                  fontSize:   18,
                  cursor:     'pointer',
                  padding:    0,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* ── School code ──────────────────────────────── */}
              {(() => {
                const code = Array.isArray(selectedSchool.tenant_configs)
                  ? selectedSchool.tenant_configs[0]?.school_short_code
                  : null
                return (
                  <div>
                    <SectionLabel>School Code</SectionLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontFamily:    FONT_MONO,
                        fontSize:      28,
                        fontWeight:    800,
                        color:         C.accent,
                        letterSpacing: '0.12em',
                      }}>
                        {code ?? '—'}
                      </span>
                      <button
                        onClick={async () => {
                          if (!window.confirm('Regenerate the 4-digit code for this school? The old code will stop working immediately.')) return
                          const supabase = createClient()
                          const { data: newCode } = await supabase.rpc('generate_school_short_code')
                          if (newCode) {
                            await supabase
                              .from('tenant_configs')
                              .update({ school_short_code: newCode })
                              .eq('school_id', selectedSchool.id)
                            await fetchData()
                          }
                        }}
                        style={{
                          padding:      '5px 10px',
                          borderRadius: 5,
                          border:       `1px solid ${C.borderStr}`,
                          background:   C.elevated,
                          color:        C.muted,
                          fontFamily:   FONT_MONO,
                          fontSize:     10,
                          cursor:       'pointer',
                          letterSpacing:'0.05em',
                        }}
                      >
                        ↺ REGEN
                      </button>
                    </div>
                    <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: C.dim, marginTop: 4, letterSpacing: '0.06em' }}>
                      PARENTS &amp; NTS SMS USE THIS CODE TO IDENTIFY THE SCHOOL
                    </p>
                  </div>
                )
              })()}

              {/* ── Invoice breakdown ────────────────────────── */}
              {pricing && (() => {
                const inv = calculateYearlyInvoice(selectedSchool, pricing)
                return (
                  <div>
                    <SectionLabel>Annual Invoice</SectionLabel>
                    <div style={{
                      background:   C.elevated,
                      border:       `1px solid ${C.borderSub}`,
                      borderRadius: 8,
                      padding:      '12px 14px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: C.muted }}>Base ({inv.tier})</span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: C.text }}>{formatKES(inv.basePrice)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: 12, color: C.muted }}>Add-ons</span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: C.text }}>{formatKES(inv.addonsPrice)}</span>
                      </div>
                      <div style={{ borderTop: `1px solid ${C.borderSub}`, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Total / year</span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 700, color: C.green }}>{formatKES(inv.totalYearly)}</span>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* ── Add-on modules ───────────────────────────── */}
              <div>
                <SectionLabel>Modules</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {ADDON_KEYS.map(key => {
                    const meta      = ADDON_META[key]
                    const isOn      = !!selectedSchool.features?.[key]
                    const isSaving  = saving === `${selectedSchool.id}-${key}`
                    return (
                      <div
                        key={key}
                        style={{
                          display:      'flex',
                          alignItems:   'center',
                          justifyContent: 'space-between',
                          padding:      '9px 12px',
                          borderRadius: 7,
                          background:   isOn ? 'rgba(29,158,117,0.06)' : 'transparent',
                          border:       `1px solid ${isOn ? 'rgba(29,158,117,0.12)' : 'transparent'}`,
                          gap:          10,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 500, color: isOn ? C.text : C.muted, margin: 0 }}>
                            {meta.label}
                          </p>
                          {pricing && (
                            <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.dim, margin: '2px 0 0' }}>
                              {formatKES(pricing[key])} / yr
                            </p>
                          )}
                        </div>
                        <Toggle
                          checked={isOn}
                          disabled={isSaving}
                          onChange={() => toggleFeature(selectedSchool, key)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── Subscription ─────────────────────────────── */}
              <div>
                <SectionLabel>Subscription</SectionLabel>
                <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.muted, marginBottom: 10 }}>
                  Expires{' '}
                  <span style={{ color: BADGE_HEX[getExpiryBadge(getDaysUntilExpiry(selectedSchool.subscription_expires_at)).color] }}>
                    {new Date(selectedSchool.subscription_expires_at).toLocaleDateString('en-KE', {
                      day:   'numeric',
                      month: 'long',
                      year:  'numeric',
                    })}
                  </span>
                </p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([3, 6, 12] as const).map(months => {
                    const isSavingSub = saving === `${selectedSchool.id}-subscription`
                    return (
                      <button
                        key={months}
                        onClick={() => extendSubscription(selectedSchool, months)}
                        disabled={!!isSavingSub}
                        style={{
                          flex:         1,
                          padding:      '7px 0',
                          borderRadius: 6,
                          border:       `1px solid ${C.borderStr}`,
                          background:   C.elevated,
                          color:        isSavingSub ? C.dim : C.text,
                          fontFamily:   FONT_MONO,
                          fontSize:     11,
                          cursor:       isSavingSub ? 'not-allowed' : 'pointer',
                          transition:   'background 0.15s',
                        }}
                        onMouseEnter={e => {
                          if (!isSavingSub)
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = C.elevated
                        }}
                      >
                        +{months}mo
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── Terminate / Reactivate ───────────────────── */}
              <button
                onClick={() => toggleActive(selectedSchool)}
                style={{
                  width:        '100%',
                  padding:      '10px 0',
                  borderRadius: 7,
                  border:       `1px solid ${selectedSchool.is_active ? C.red : C.green}50`,
                  background:   'transparent',
                  color:        selectedSchool.is_active ? C.red : C.green,
                  fontFamily:   FONT_DISPLAY,
                  fontSize:     12,
                  fontWeight:   600,
                  cursor:       'pointer',
                  transition:   'background 0.15s',
                  letterSpacing:'0.01em',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    selectedSchool.is_active ? `${C.red}0e` : `${C.green}0e`
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                }}
              >
                {selectedSchool.is_active ? '⛔ Terminate Access' : '✓ Reactivate School'}
              </button>

            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────
          Add School Modal
      ───────────────────────────────────────────────────── */}
      {showAddModal && (
        <div
          onClick={() => { setShowAddModal(false); setForm(EMPTY_FORM) }}
          style={{
            position:   'fixed',
            inset:      0,
            background: 'rgba(0,0,0,0.75)',
            zIndex:     100,
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding:    20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background:   C.surface,
              border:       `1px solid ${C.borderStr}`,
              borderRadius: 14,
              width:        '100%',
              maxWidth:     520,
              maxHeight:    '90vh',
              overflowY:    'auto',
              padding:      28,
            }}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <div>
                <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 18, color: C.text, margin: 0 }}>
                  Onboard School
                </h2>
                <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.06em' }}>
                  All add-ons default OFF — enable per-school after creation
                </p>
              </div>
              <button
                onClick={() => { setShowAddModal(false); setForm(EMPTY_FORM) }}
                style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', padding: 0 }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddSchool} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* School Name — full width */}
              <div>
                <label style={{ display: 'block', fontFamily: FONT_MONO, fontSize: 10, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
                  School Name *
                </label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Nkoroi Mixed Secondary"
                  style={inputStyle}
                />
              </div>

              {/* County + Sub-County */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontFamily: FONT_MONO, fontSize: 10, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
                    County *
                  </label>
                  <input
                    required
                    value={form.county}
                    onChange={e => setForm(p => ({ ...p, county: e.target.value }))}
                    placeholder="e.g. Kajiado"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: FONT_MONO, fontSize: 10, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
                    Sub-County
                  </label>
                  <input
                    value={form.sub_county}
                    onChange={e => setForm(p => ({ ...p, sub_county: e.target.value }))}
                    placeholder="e.g. Ngong"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* KNEC Code + Student Count */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontFamily: FONT_MONO, fontSize: 10, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
                    KNEC Code
                  </label>
                  <input
                    value={form.knec_code}
                    onChange={e => setForm(p => ({ ...p, knec_code: e.target.value }))}
                    placeholder="e.g. 10234001"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: FONT_MONO, fontSize: 10, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
                    Student Count
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.student_count}
                    onChange={e => setForm(p => ({ ...p, student_count: e.target.value }))}
                    placeholder="e.g. 1200"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Principal Name — full width */}
              <div>
                <label style={{ display: 'block', fontFamily: FONT_MONO, fontSize: 10, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
                  Principal Name
                </label>
                <input
                  value={form.contact_name}
                  onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))}
                  placeholder="e.g. Mr. James Mwangi"
                  style={inputStyle}
                />
              </div>

              {/* Phone + Email */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontFamily: FONT_MONO, fontSize: 10, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={form.contact_phone}
                    onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))}
                    placeholder="+254 7XX XXX XXX"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontFamily: FONT_MONO, fontSize: 10, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.contact_email}
                    onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))}
                    placeholder="principal@school.ac.ke"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: `1px solid ${C.borderSub}`, marginTop: 4 }} />

              {/* Submit */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setForm(EMPTY_FORM) }}
                  style={{
                    padding:    '10px 20px',
                    borderRadius: 7,
                    border:     `1px solid ${C.borderStr}`,
                    background: 'transparent',
                    color:      C.muted,
                    fontFamily: FONT_DISPLAY,
                    fontSize:   13,
                    cursor:     'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding:    '10px 24px',
                    borderRadius: 7,
                    border:     'none',
                    background: submitting ? C.dim : C.accent,
                    color:      '#fff',
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 600,
                    fontSize:   13,
                    cursor:     submitting ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {submitting ? 'Creating…' : 'Create School'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  )
}
