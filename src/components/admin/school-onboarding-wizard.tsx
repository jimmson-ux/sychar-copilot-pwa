'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

// ── Design tokens (mirrored from admin/schools/page.tsx) ──────────────────────
const C = {
  bg:        '#0a0a0b',
  surface:   '#111114',
  elevated:  '#18181d',
  borderSub: 'rgba(255,255,255,0.07)',
  borderStr: 'rgba(255,255,255,0.13)',
  text:      '#e8e6e1',
  muted:     '#7a7870',
  dim:       '#4a4845',
  accent:    '#e8593c',
  green:     '#1d9e75',
  amber:     '#ef9f27',
  red:       '#e24b4a',
  blue:      '#3b8bd4',
} as const

const FONT_DISPLAY = 'var(--font-display, Syne, sans-serif)'
const FONT_MONO    = 'var(--font-mono, "JetBrains Mono", monospace)'

const labelStyle: React.CSSProperties = {
  display:       'block',
  fontFamily:    FONT_MONO,
  fontSize:      10,
  color:         C.dim,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom:  5,
}

const inputStyle: React.CSSProperties = {
  width:        '100%',
  background:   C.elevated,
  border:       `1px solid ${C.borderStr}`,
  borderRadius: 6,
  color:        C.text,
  fontFamily:   FONT_DISPLAY,
  fontSize:     13,
  padding:      '9px 12px',
  outline:      'none',
  boxSizing:    'border-box',
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Step1 = {
  school_name:   string
  county:        string
  sub_county:    string
  knec_code:     string
  student_count: string
  short_name:    string
  tier:          'basic' | 'standard' | 'premium'
}

type Step2 = {
  admin_name:    string
  admin_email:   string
  contact_phone: string
  tsc_number:    string
}

type ProvisionResult = {
  school_id:         string
  school_short_code: string | null
  slug:              string | null
  staff_pwa_url:     string | null
  parent_pwa_url:    string
  temp_password:     string
  admin_email:       string
}

type StatusLine = { label: string; done: boolean; error?: boolean }

const EMPTY_STEP1: Step1 = {
  school_name:   '',
  county:        '',
  sub_county:    '',
  knec_code:     '',
  student_count: '',
  short_name:    '',
  tier:          'basic',
}

const EMPTY_STEP2: Step2 = {
  admin_name:    '',
  admin_email:   '',
  contact_phone: '',
  tsc_number:    '',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label:    string
  required?: boolean
  children:  React.ReactNode
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}{required && <span style={{ color: C.accent }}> *</span>}
      </label>
      {children}
    </div>
  )
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width:        i === current ? 20 : 6,
            height:       6,
            borderRadius: 3,
            background:   i === current ? C.accent : i < current ? C.green : C.dim,
            transition:   'all 0.2s',
          }}
        />
      ))}
    </div>
  )
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{
      display:        'flex',
      justifyContent: 'space-between',
      alignItems:     'center',
      padding:        '8px 12px',
      borderRadius:   6,
      background:     C.elevated,
      gap:            10,
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
          {label}
        </p>
        <p style={{ fontFamily: FONT_MONO, fontSize: 12, color: C.text, margin: '2px 0 0', wordBreak: 'break-all' }}>
          {value}
        </p>
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }}
        style={{
          flexShrink:   0,
          padding:      '4px 9px',
          borderRadius: 4,
          border:       `1px solid ${C.borderStr}`,
          background:   copied ? `${C.green}20` : C.elevated,
          color:        copied ? C.green : C.muted,
          fontFamily:   FONT_MONO,
          fontSize:     10,
          cursor:       'pointer',
          transition:   'all 0.15s',
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}

// ── Wizard ────────────────────────────────────────────────────────────────────

export default function SchoolOnboardingWizard({
  open,
  onClose,
  onProvisioned,
}: {
  open:          boolean
  onClose:       () => void
  onProvisioned: () => void
}) {
  const [step,     setStep]     = useState(0)
  const [step1,    setStep1]    = useState<Step1>(EMPTY_STEP1)
  const [step2,    setStep2]    = useState<Step2>(EMPTY_STEP2)
  const [status,   setStatus]   = useState<StatusLine[]>([])
  const [result,   setResult]   = useState<ProvisionResult | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [allCopied, setAllCopied] = useState(false)

  function reset() {
    setStep(0)
    setStep1(EMPTY_STEP1)
    setStep2(EMPTY_STEP2)
    setStatus([])
    setResult(null)
    setError(null)
    setAllCopied(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function provision() {
    setStep(2)
    setError(null)
    setStatus([
      { label: 'Creating auth user…',    done: false },
      { label: 'Registering school…',    done: false },
      { label: 'Sending welcome SMS…',   done: false },
    ])

    // Use a progressive status update: we can't get real step-by-step from a
    // single HTTP call, so we fake progress then fill in on response.
    await new Promise(r => setTimeout(r, 300))
    setStatus(s => s.map((l, i) => i === 0 ? { ...l, done: true } : l))
    await new Promise(r => setTimeout(r, 400))
    setStatus(s => s.map((l, i) => i === 1 ? { ...l, done: true } : l))

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch('/api/admin/onboard-school', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          ...(session?.access_token
            ? { 'Authorization': `Bearer ${session.access_token}` }
            : {}
          ),
        },
        body: JSON.stringify({ ...step1, ...step2 }),
      })

      const json = await res.json() as ProvisionResult & { error?: string }

      if (!res.ok) {
        setError(json.error ?? 'Provisioning failed')
        setStatus(s => s.map(l => ({ ...l, error: true })))
        return
      }

      setStatus(s => s.map((l, i) => i === 2 ? { ...l, done: true } : l))
      setResult(json)
      setStep(3)
      onProvisioned()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
      setStatus(s => s.map(l => ({ ...l, error: true })))
    }
  }

  function copyAll(r: ProvisionResult) {
    const text = [
      `School: ${step1.school_name}`,
      `School ID: ${r.school_id}`,
      `Short Code: ${r.school_short_code ?? 'pending'}`,
      `Slug: ${r.slug ?? 'pending'}`,
      `Staff PWA: ${r.staff_pwa_url ?? 'pending'}`,
      `Parent PWA: ${r.parent_pwa_url}`,
      `Principal Email: ${r.admin_email}`,
      `Temp Password: ${r.temp_password}`,
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setAllCopied(true)
      setTimeout(() => setAllCopied(false), 2000)
    })
  }

  if (!open) return null

  const btnPrimary: React.CSSProperties = {
    padding:      '10px 24px',
    borderRadius: 7,
    border:       'none',
    background:   C.accent,
    color:        '#fff',
    fontFamily:   FONT_DISPLAY,
    fontWeight:   600,
    fontSize:     13,
    cursor:       'pointer',
  }

  const btnSecondary: React.CSSProperties = {
    padding:      '10px 20px',
    borderRadius: 7,
    border:       `1px solid ${C.borderStr}`,
    background:   'transparent',
    color:        C.muted,
    fontFamily:   FONT_DISPLAY,
    fontSize:     13,
    cursor:       'pointer',
  }

  return (
    <div
      onClick={handleClose}
      style={{
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.78)',
        zIndex:         200,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:   C.surface,
          border:       `1px solid ${C.borderStr}`,
          borderRadius: 16,
          width:        '100%',
          maxWidth:     540,
          maxHeight:    '92vh',
          overflowY:    'auto',
          padding:      '28px 30px',
          display:      'flex',
          flexDirection:'column',
          gap:          24,
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 20, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
              {step === 3 ? 'School Provisioned' : 'Onboard New School'}
            </h2>
            <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.06em' }}>
              {['STEP 1 OF 2 — SCHOOL DETAILS', 'STEP 2 OF 2 — PRINCIPAL', 'PROVISIONING…', 'COMPLETE'][step]}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
            {step < 3 && <StepDots current={Math.min(step, 1)} total={2} />}
            <button
              onClick={handleClose}
              style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Step 1: School Details ── */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="School Name" required>
              <input
                required
                value={step1.school_name}
                onChange={e => setStep1(p => ({ ...p, school_name: e.target.value }))}
                placeholder="e.g. Nkoroi Mixed Secondary"
                style={inputStyle}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="County" required>
                <input
                  required
                  value={step1.county}
                  onChange={e => setStep1(p => ({ ...p, county: e.target.value }))}
                  placeholder="e.g. Kajiado"
                  style={inputStyle}
                />
              </Field>
              <Field label="Sub-County">
                <input
                  value={step1.sub_county}
                  onChange={e => setStep1(p => ({ ...p, sub_county: e.target.value }))}
                  placeholder="e.g. Ngong"
                  style={inputStyle}
                />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="KNEC Code">
                <input
                  value={step1.knec_code}
                  onChange={e => setStep1(p => ({ ...p, knec_code: e.target.value }))}
                  placeholder="e.g. 10234001"
                  style={inputStyle}
                />
              </Field>
              <Field label="Student Count">
                <input
                  type="number"
                  min="0"
                  value={step1.student_count}
                  onChange={e => setStep1(p => ({ ...p, student_count: e.target.value }))}
                  placeholder="e.g. 850"
                  style={inputStyle}
                />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Short Name">
                <input
                  value={step1.short_name}
                  onChange={e => setStep1(p => ({ ...p, short_name: e.target.value }))}
                  placeholder="e.g. NMS"
                  style={inputStyle}
                />
              </Field>
              <Field label="Tier">
                <div style={{ display: 'flex', gap: 6, paddingTop: 1 }}>
                  {(['basic', 'standard', 'premium'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setStep1(p => ({ ...p, tier: t }))}
                      style={{
                        flex:         1,
                        padding:      '8px 0',
                        borderRadius: 5,
                        border:       `1px solid ${step1.tier === t ? C.accent : C.borderStr}`,
                        background:   step1.tier === t ? `${C.accent}18` : 'transparent',
                        color:        step1.tier === t ? C.accent : C.muted,
                        fontFamily:   FONT_MONO,
                        fontSize:     10,
                        letterSpacing:'0.05em',
                        textTransform:'capitalize',
                        cursor:       'pointer',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                style={btnPrimary}
                onClick={() => {
                  if (!step1.school_name.trim() || !step1.county.trim()) return
                  setStep(1)
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Principal ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Principal Full Name" required>
              <input
                required
                value={step2.admin_name}
                onChange={e => setStep2(p => ({ ...p, admin_name: e.target.value }))}
                placeholder="e.g. Mr. James Mwangi"
                style={inputStyle}
              />
            </Field>

            <Field label="Principal Email" required>
              <input
                type="email"
                required
                value={step2.admin_email}
                onChange={e => setStep2(p => ({ ...p, admin_email: e.target.value }))}
                placeholder="principal@school.ac.ke"
                style={inputStyle}
              />
            </Field>

            <Field label="Contact Phone (receives SMS credentials)" required>
              <input
                type="tel"
                required
                value={step2.contact_phone}
                onChange={e => setStep2(p => ({ ...p, contact_phone: e.target.value }))}
                placeholder="+254 7XX XXX XXX"
                style={inputStyle}
              />
            </Field>

            <Field label="TSC Number">
              <input
                value={step2.tsc_number}
                onChange={e => setStep2(p => ({ ...p, tsc_number: e.target.value }))}
                placeholder="e.g. TSC/123456"
                style={inputStyle}
              />
            </Field>

            <div style={{
              padding:      '12px 14px',
              borderRadius: 8,
              background:   `${C.amber}10`,
              border:       `1px solid ${C.amber}25`,
            }}>
              <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.amber, margin: 0, letterSpacing: '0.06em' }}>
                A temp password will be auto-generated and sent via SMS to the phone number above.
                The principal must change it on first login.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 4 }}>
              <button style={btnSecondary} onClick={() => setStep(0)}>← Back</button>
              <button
                style={btnPrimary}
                onClick={() => {
                  if (!step2.admin_name.trim() || !step2.admin_email.trim() || !step2.contact_phone.trim()) return
                  provision()
                }}
              >
                Confirm &amp; Provision
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Provisioning ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {status.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        12,
                    padding:    '11px 14px',
                    borderRadius: 8,
                    background: s.error
                      ? `${C.red}10`
                      : s.done
                        ? `${C.green}10`
                        : C.elevated,
                    border: `1px solid ${s.error ? C.red + '30' : s.done ? C.green + '30' : C.borderSub}`,
                  }}
                >
                  <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>
                    {s.error ? '✗' : s.done ? '✓' : '⋯'}
                  </span>
                  <span style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize:   13,
                    color:      s.error ? C.red : s.done ? C.green : C.muted,
                  }}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            {error && (
              <div style={{
                padding:      '12px 14px',
                borderRadius: 8,
                background:   `${C.red}10`,
                border:       `1px solid ${C.red}30`,
              }}>
                <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.red, margin: 0 }}>
                  Error: {error}
                </p>
                <button
                  onClick={() => setStep(1)}
                  style={{ ...btnSecondary, marginTop: 10, padding: '7px 14px', fontSize: 12 }}
                >
                  ← Go back
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Success ── */}
        {step === 3 && result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              padding:      '12px 14px',
              borderRadius: 8,
              background:   `${C.green}10`,
              border:       `1px solid ${C.green}30`,
              marginBottom: 4,
            }}>
              <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.green, margin: 0, letterSpacing: '0.04em' }}>
                {step1.school_name} has been provisioned successfully.
                Credentials sent via SMS to {step2.contact_phone}.
              </p>
            </div>

            <CopyRow label="School ID"        value={result.school_id} />
            <CopyRow label="Short Code (Study PIN)" value={result.school_short_code ?? 'pending'} />
            <CopyRow label="Slug"              value={result.slug ?? 'pending'} />
            {result.staff_pwa_url && (
              <CopyRow label="Staff PWA URL"   value={result.staff_pwa_url} />
            )}
            <CopyRow label="Parent PWA URL"    value={result.parent_pwa_url} />
            <CopyRow label="Principal Email"   value={result.admin_email} />
            <CopyRow label="Temp Password (shown once)" value={result.temp_password} />

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 8 }}>
              <button
                onClick={() => copyAll(result)}
                style={{
                  ...btnSecondary,
                  color:   allCopied ? C.green : C.muted,
                  border:  `1px solid ${allCopied ? C.green + '50' : C.borderStr}`,
                }}
              >
                {allCopied ? '✓ Copied all' : 'Copy all'}
              </button>
              <button
                onClick={handleClose}
                style={btnPrimary}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
