'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import SchoolOnboardingWizard from '@/components/admin/school-onboarding-wizard'

// ── Design tokens ─────────────────────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────
type SchoolRow = {
  id:             string
  name:           string
  is_active:      boolean
  county:         string | null
  sub_county:     string | null
  knec_code:      string | null
  student_count:  number | null
  short_name:     string | null
  contact_name:   string | null
  contact_phone:  string | null
  contact_email:  string | null
  tier:           string | null
  tenant_configs: { slug: string | null; school_short_code: string | null }[] | null
}

type StaffRow = {
  id:           string
  full_name:    string
  sub_role:     string
  email:        string | null
  phone_number: string | null
  user_id:      string | null
  created_at:   string
}

type Tab = 'details' | 'staff' | 'broadcast'

// ── Small helpers ─────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width:        '100%',
  background:   '#18181d',
  border:       '1px solid rgba(255,255,255,0.13)',
  borderRadius: 6,
  color:        '#e8e6e1',
  fontFamily:   FONT_DISPLAY,
  fontSize:     13,
  padding:      '9px 12px',
  outline:      'none',
  boxSizing:    'border-box',
}

const labelStyle: React.CSSProperties = {
  display:       'block',
  fontFamily:    FONT_MONO,
  fontSize:      10,
  color:         '#4a4845',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom:  5,
}

function CopyMono({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ ...labelStyle, marginBottom: 2 }}>{label}</p>
        <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.muted, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </p>
      </div>
      <button
        onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
        style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.borderStr}`, background: copied ? `${C.green}20` : C.elevated, color: copied ? C.green : C.dim, fontFamily: FONT_MONO, fontSize: 9, cursor: 'pointer' }}
      >
        {copied ? 'OK' : 'COPY'}
      </button>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const color =
    role === 'principal'                            ? C.accent :
    role === 'deputy_principal' || role === 'hod'   ? C.amber  :
    role === 'bursar'                               ? C.blue   :
    role === 'teacher'                              ? C.green  :
    C.dim
  return (
    <span style={{
      fontFamily:    FONT_MONO,
      fontSize:      9,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color,
      background:    color + '18',
      border:        `1px solid ${color}30`,
      borderRadius:  4,
      padding:       '2px 6px',
      whiteSpace:    'nowrap',
    }}>
      {role.replace(/_/g, ' ')}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function CommandCentrePage() {
  const [schools,     setSchools]     = useState<SchoolRow[]>([])
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState<SchoolRow | null>(null)
  const [tab,         setTab]         = useState<Tab>('details')
  const [showWizard,  setShowWizard]  = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  // ── Staff tab state ──────────────────────────────────────────
  const [staff,          setStaff]          = useState<StaffRow[]>([])
  const [staffLoading,   setStaffLoading]   = useState(false)
  const [resetTarget,    setResetTarget]    = useState<StaffRow | null>(null)
  const [resetResult,    setResetResult]    = useState<{ password: string; notified: boolean } | null>(null)
  const [resetting,      setResetting]      = useState(false)

  // ── Details tab state ────────────────────────────────────────
  const [detailForm,  setDetailForm]  = useState<Record<string, string>>({})
  const [saving,      setSaving]      = useState(false)
  const [saveMsg,     setSaveMsg]     = useState<string | null>(null)

  // ── Broadcast tab state ──────────────────────────────────────
  const [audience,    setAudience]    = useState<string>('all')
  const [bTitle,      setBTitle]      = useState('')
  const [bBody,       setBBody]       = useState('')
  const [bPush,       setBPush]       = useState(true)
  const [bSms,        setBSms]        = useState(false)
  const [sending,     setSending]     = useState(false)
  const [sendResult,  setSendResult]  = useState<string | null>(null)

  // ── Auth token ───────────────────────────────────────────────
  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      setAccessToken(session?.access_token ?? null)
    })
  }, [])

  function authHeaders() {
    const h: HeadersInit = { 'Content-Type': 'application/json' }
    if (accessToken) (h as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`
    return h
  }

  // ── Load schools ─────────────────────────────────────────────
  const fetchSchools = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('schools')
      .select('id, name, is_active, county, sub_county, knec_code, student_count, short_name, contact_name, contact_phone, contact_email, tier, tenant_configs(slug, school_short_code)')
      .order('name')
    setSchools((data as SchoolRow[]) ?? [])
  }, [])

  useEffect(() => { fetchSchools() }, [fetchSchools])

  // ── Select school ────────────────────────────────────────────
  function selectSchool(school: SchoolRow) {
    setSelected(school)
    setTab('details')
    setStaff([])
    setResetTarget(null)
    setResetResult(null)
    setSendResult(null)
    // Pre-fill detail form
    setDetailForm({
      name:          school.name          ?? '',
      county:        school.county        ?? '',
      sub_county:    school.sub_county    ?? '',
      knec_code:     school.knec_code     ?? '',
      student_count: String(school.student_count ?? ''),
      short_name:    school.short_name    ?? '',
      contact_name:  school.contact_name  ?? '',
      contact_phone: school.contact_phone ?? '',
      contact_email: school.contact_email ?? '',
      tier:          school.tier          ?? 'basic',
    })
  }

  // ── Load staff ───────────────────────────────────────────────
  async function loadStaff(schoolId: string) {
    setStaffLoading(true)
    try {
      const res = await fetch(`/api/admin/command/staff?school_id=${schoolId}`, {
        headers: authHeaders(),
      })
      const json = await res.json() as { staff: StaffRow[] }
      setStaff(json.staff ?? [])
    } finally {
      setStaffLoading(false)
    }
  }

  function handleTabChange(t: Tab) {
    setTab(t)
    if (t === 'staff' && selected && staff.length === 0 && !staffLoading) {
      loadStaff(selected.id)
    }
  }

  // ── Save details ─────────────────────────────────────────────
  async function saveDetails() {
    if (!selected) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/admin/command/school', {
        method:  'PATCH',
        headers: authHeaders(),
        body:    JSON.stringify({ school_id: selected.id, ...detailForm }),
      })
      const json = await res.json() as { ok?: boolean; error?: string; slug?: string }
      if (json.ok) {
        setSaveMsg('Saved ✓')
        await fetchSchools()
        setTimeout(() => setSaveMsg(null), 2500)
      } else {
        setSaveMsg(`Error: ${json.error ?? 'unknown'}`)
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Reset password ───────────────────────────────────────────
  async function doReset(s: StaffRow) {
    if (!selected) return
    setResetting(true)
    setResetResult(null)
    try {
      const res = await fetch('/api/admin/command/reset-password', {
        method:  'POST',
        headers: authHeaders(),
        body:    JSON.stringify({ staff_id: s.id, school_id: selected.id }),
      })
      const json = await res.json() as { ok?: boolean; temp_password?: string; phone_notified?: boolean; error?: string }
      if (json.ok && json.temp_password) {
        setResetResult({ password: json.temp_password, notified: !!json.phone_notified })
      }
    } finally {
      setResetting(false)
    }
  }

  // ── Send broadcast ───────────────────────────────────────────
  async function sendBroadcast() {
    if (!selected || !bTitle.trim() || !bBody.trim()) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/admin/command/broadcast', {
        method:  'POST',
        headers: authHeaders(),
        body:    JSON.stringify({
          school_id:  selected.id,
          audience,
          title:      bTitle.trim(),
          body:       bBody.trim(),
          send_push:  bPush,
          send_sms:   bSms,
        }),
      })
      const json = await res.json() as { push_sent: number; push_failed: number; sms_sent: number; sms_failed: number; error?: string }
      if (json.error) {
        setSendResult(`Error: ${json.error}`)
      } else {
        const parts = []
        if (bPush) parts.push(`Push: ${json.push_sent} sent${json.push_failed ? `, ${json.push_failed} failed` : ''}`)
        if (bSms)  parts.push(`SMS: ${json.sms_sent} sent${json.sms_failed ? `, ${json.sms_failed} failed` : ''}`)
        setSendResult('✓ ' + parts.join(' · '))
        setBTitle('')
        setBBody('')
      }
    } finally {
      setSending(false)
    }
  }

  const filteredSchools = schools.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  )

  const cfg = selected?.tenant_configs?.[0] ?? null

  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.text, display: 'flex', gap: 0, minHeight: '100vh', marginTop: -32, marginLeft: -32, marginRight: -32 }}>

      {/* ── Left panel ──────────────────────────────────────── */}
      <div style={{
        width:        260,
        flexShrink:   0,
        borderRight:  `1px solid ${C.borderSub}`,
        display:      'flex',
        flexDirection:'column',
        height:       '100vh',
        position:     'sticky',
        top:          0,
      }}>
        {/* Onboard button */}
        <div style={{ padding: '20px 16px 12px', borderBottom: `1px solid ${C.borderSub}` }}>
          <button
            onClick={() => setShowWizard(true)}
            style={{
              width:        '100%',
              padding:      '9px 0',
              borderRadius: 7,
              border:       `1px solid ${C.accent}40`,
              background:   `${C.accent}12`,
              color:        C.accent,
              fontFamily:   FONT_DISPLAY,
              fontWeight:   600,
              fontSize:     12,
              cursor:       'pointer',
              letterSpacing:'0.01em',
            }}
          >
            + Onboard School
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.borderSub}` }}>
          <input
            placeholder="Search schools…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              ...inputStyle,
              background: C.surface,
              fontSize:   12,
              padding:    '7px 10px',
            }}
          />
        </div>

        {/* School list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {filteredSchools.length === 0 && (
            <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.dim, padding: '12px 8px', textAlign: 'center' }}>
              No schools found
            </p>
          )}
          {filteredSchools.map(school => {
            const isSelected = selected?.id === school.id
            const slug = school.tenant_configs?.[0]?.slug
            return (
              <div
                key={school.id}
                onClick={() => selectSchool(school)}
                style={{
                  padding:      '10px 10px',
                  borderRadius: 7,
                  cursor:       'pointer',
                  marginBottom: 2,
                  background:   isSelected ? `${C.accent}10` : 'transparent',
                  border:       `1px solid ${isSelected ? C.accent + '30' : 'transparent'}`,
                  transition:   'background 0.12s',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)' }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 7, color: school.is_active ? C.green : C.red, flexShrink: 0 }}>●</span>
                  <span style={{ fontSize: 12, fontWeight: isSelected ? 600 : 400, color: isSelected ? C.text : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {school.name}
                  </span>
                </div>
                {slug && (
                  <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: C.dim, margin: '2px 0 0 14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {slug}.sychar.co.ke
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* Count footer */}
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.borderSub}` }}>
          <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: C.dim, margin: 0 }}>
            {schools.filter(s => s.is_active).length} active · {schools.length} total
          </p>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, padding: '28px 32px', overflowY: 'auto', height: '100vh' }}>

        {!selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 28, color: C.dim }}>⌘</span>
            <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.dim, letterSpacing: '0.06em' }}>
              SELECT A SCHOOL TO MANAGE IT
            </p>
          </div>
        ) : (
          <div style={{ maxWidth: 720 }}>

            {/* Header */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 22, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
                  {selected.name}
                </h1>
                <span style={{
                  fontFamily:    FONT_MONO,
                  fontSize:      9,
                  letterSpacing: '0.06em',
                  color:         selected.is_active ? C.green : C.red,
                  background:    (selected.is_active ? C.green : C.red) + '15',
                  border:        `1px solid ${(selected.is_active ? C.green : C.red)}30`,
                  borderRadius:  4,
                  padding:       '3px 8px',
                }}>
                  {selected.is_active ? '● LIVE' : '● OFF'}
                </span>
                {cfg?.school_short_code && (
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: '0.08em' }}>
                    {cfg.school_short_code}
                  </span>
                )}
              </div>
              {cfg?.slug && (
                <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.muted, margin: '5px 0 0' }}>
                  https://{cfg.slug}.sychar.co.ke
                  <button
                    onClick={() => navigator.clipboard.writeText(`https://${cfg.slug}.sychar.co.ke`)}
                    style={{ marginLeft: 8, background: 'transparent', border: 'none', color: C.dim, fontFamily: FONT_MONO, fontSize: 9, cursor: 'pointer', padding: 0 }}
                  >
                    COPY
                  </button>
                </p>
              )}
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: `1px solid ${C.borderSub}`, paddingBottom: 0 }}>
              {(['details', 'staff', 'broadcast'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => handleTabChange(t)}
                  style={{
                    padding:       '8px 18px',
                    borderRadius:  '6px 6px 0 0',
                    border:        `1px solid ${tab === t ? C.borderStr : 'transparent'}`,
                    borderBottom:  tab === t ? `1px solid ${C.bg}` : 'none',
                    background:    tab === t ? C.surface : 'transparent',
                    color:         tab === t ? C.text : C.muted,
                    fontFamily:    FONT_DISPLAY,
                    fontSize:      12,
                    fontWeight:    tab === t ? 600 : 400,
                    cursor:        'pointer',
                    letterSpacing: '0.01em',
                    textTransform: 'capitalize',
                    marginBottom:  -1,
                    transition:    'all 0.12s',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* ── Details tab ──────────────────────────────── */}
            {tab === 'details' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                <div>
                  <label style={labelStyle}>School Name</label>
                  <input style={inputStyle} value={detailForm.name ?? ''} onChange={e => setDetailForm(p => ({ ...p, name: e.target.value }))} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>County</label>
                    <input style={inputStyle} value={detailForm.county ?? ''} onChange={e => setDetailForm(p => ({ ...p, county: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Sub-County</label>
                    <input style={inputStyle} value={detailForm.sub_county ?? ''} onChange={e => setDetailForm(p => ({ ...p, sub_county: e.target.value }))} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>KNEC Code</label>
                    <input style={inputStyle} value={detailForm.knec_code ?? ''} onChange={e => setDetailForm(p => ({ ...p, knec_code: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Student Count</label>
                    <input type="number" min="0" style={inputStyle} value={detailForm.student_count ?? ''} onChange={e => setDetailForm(p => ({ ...p, student_count: e.target.value }))} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Short Name</label>
                    <input style={inputStyle} value={detailForm.short_name ?? ''} onChange={e => setDetailForm(p => ({ ...p, short_name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Tier</label>
                    <div style={{ display: 'flex', gap: 6, paddingTop: 2 }}>
                      {(['basic', 'standard', 'premium'] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setDetailForm(p => ({ ...p, tier: t }))}
                          style={{
                            flex:         1,
                            padding:      '7px 0',
                            borderRadius: 5,
                            border:       `1px solid ${detailForm.tier === t ? C.accent : C.borderStr}`,
                            background:   detailForm.tier === t ? `${C.accent}18` : 'transparent',
                            color:        detailForm.tier === t ? C.accent : C.muted,
                            fontFamily:   FONT_MONO,
                            fontSize:     9,
                            letterSpacing:'0.05em',
                            textTransform:'capitalize',
                            cursor:       'pointer',
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: `1px solid ${C.borderSub}`, paddingTop: 14 }}>
                  <p style={{ ...labelStyle, marginBottom: 12 }}>Contact</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Contact Name</label>
                      <input style={inputStyle} value={detailForm.contact_name ?? ''} onChange={e => setDetailForm(p => ({ ...p, contact_name: e.target.value }))} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={labelStyle}>Phone</label>
                        <input type="tel" style={inputStyle} value={detailForm.contact_phone ?? ''} onChange={e => setDetailForm(p => ({ ...p, contact_phone: e.target.value }))} />
                      </div>
                      <div>
                        <label style={labelStyle}>Email</label>
                        <input type="email" style={inputStyle} value={detailForm.contact_email ?? ''} onChange={e => setDetailForm(p => ({ ...p, contact_email: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <button
                    onClick={saveDetails}
                    disabled={saving}
                    style={{
                      padding:      '10px 28px',
                      borderRadius: 7,
                      border:       'none',
                      background:   saving ? C.dim : C.accent,
                      color:        '#fff',
                      fontFamily:   FONT_DISPLAY,
                      fontWeight:   600,
                      fontSize:     13,
                      cursor:       saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                  {saveMsg && (
                    <span style={{
                      fontFamily: FONT_MONO,
                      fontSize:   11,
                      color:      saveMsg.startsWith('Error') ? C.red : C.green,
                    }}>
                      {saveMsg}
                    </span>
                  )}
                </div>

                {/* Read-only info */}
                {cfg && (
                  <div style={{ borderTop: `1px solid ${C.borderSub}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={labelStyle}>Read-only</p>
                    {cfg.slug && <CopyMono label="Slug" value={`${cfg.slug}.sychar.co.ke`} />}
                    {cfg.school_short_code && <CopyMono label="Short Code" value={cfg.school_short_code} />}
                    {cfg.slug && <CopyMono label="Staff PWA URL" value={`https://${cfg.slug}.sychar.co.ke`} />}
                  </div>
                )}
              </div>
            )}

            {/* ── Staff tab ─────────────────────────────────── */}
            {tab === 'staff' && (
              <div>
                {staffLoading && (
                  <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.muted }}>Loading staff…</p>
                )}
                {!staffLoading && staff.length === 0 && (
                  <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.dim }}>No staff records found.</p>
                )}
                {staff.length > 0 && (
                  <div style={{ background: C.surface, border: `1px solid ${C.borderSub}`, borderRadius: 10, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.borderSub}` }}>
                          {['Name', 'Role', 'Phone', 'Email', ''].map((col, i) => (
                            <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontFamily: FONT_MONO, fontSize: 9, letterSpacing: '0.08em', color: C.dim, textTransform: 'uppercase', fontWeight: 500 }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {staff.map(s => (
                          <tr key={s.id} style={{ borderBottom: `1px solid ${C.borderSub}` }}>
                            <td style={{ padding: '11px 14px', fontSize: 12, color: C.text, fontWeight: 500 }}>{s.full_name}</td>
                            <td style={{ padding: '11px 14px' }}><RoleBadge role={s.sub_role} /></td>
                            <td style={{ padding: '11px 14px', fontFamily: FONT_MONO, fontSize: 11, color: C.muted }}>{s.phone_number ?? '—'}</td>
                            <td style={{ padding: '11px 14px', fontSize: 11, color: C.muted, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email ?? '—'}</td>
                            <td style={{ padding: '11px 14px' }}>
                              <button
                                disabled={resetting && resetTarget?.id === s.id}
                                onClick={() => { setResetTarget(s); setResetResult(null); doReset(s) }}
                                style={{
                                  padding:      '4px 10px',
                                  borderRadius: 5,
                                  border:       `1px solid ${C.borderStr}`,
                                  background:   'transparent',
                                  color:        C.muted,
                                  fontFamily:   FONT_MONO,
                                  fontSize:     9,
                                  cursor:       'pointer',
                                  letterSpacing:'0.04em',
                                  whiteSpace:   'nowrap',
                                }}
                              >
                                {resetting && resetTarget?.id === s.id ? '…' : '↺ Reset'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Reset result modal */}
                {resetResult && resetTarget && (
                  <div style={{
                    marginTop:    16,
                    padding:      '16px 18px',
                    borderRadius: 10,
                    background:   `${C.green}0a`,
                    border:       `1px solid ${C.green}25`,
                  }}>
                    <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.green, letterSpacing: '0.06em', marginBottom: 10 }}>
                      PASSWORD RESET — {resetTarget.full_name.toUpperCase()}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <code style={{
                        flex:         1,
                        fontFamily:   FONT_MONO,
                        fontSize:     14,
                        fontWeight:   700,
                        color:        C.text,
                        background:   C.elevated,
                        border:       `1px solid ${C.borderStr}`,
                        borderRadius: 6,
                        padding:      '8px 12px',
                        letterSpacing:'0.04em',
                      }}>
                        {resetResult.password}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(resetResult.password)}
                        style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${C.borderStr}`, background: C.elevated, color: C.muted, fontFamily: FONT_MONO, fontSize: 10, cursor: 'pointer' }}
                      >
                        COPY
                      </button>
                    </div>
                    <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: C.dim, marginTop: 8, letterSpacing: '0.04em' }}>
                      {resetResult.notified ? `SMS sent to ${resetTarget.phone_number}` : 'No phone number — share manually'}
                    </p>
                    <button
                      onClick={() => { setResetResult(null); setResetTarget(null) }}
                      style={{ marginTop: 8, background: 'transparent', border: 'none', color: C.dim, fontFamily: FONT_MONO, fontSize: 9, cursor: 'pointer', letterSpacing: '0.04em' }}
                    >
                      DISMISS
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Broadcast tab ─────────────────────────────── */}
            {tab === 'broadcast' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520 }}>

                {/* Audience */}
                <div>
                  <label style={labelStyle}>Audience</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['all', 'principal', 'bursar', 'teacher', 'hod'].map(a => (
                      <button
                        key={a}
                        onClick={() => setAudience(a)}
                        style={{
                          padding:       '6px 14px',
                          borderRadius:  6,
                          border:        `1px solid ${audience === a ? C.accent : C.borderStr}`,
                          background:    audience === a ? `${C.accent}18` : 'transparent',
                          color:         audience === a ? C.accent : C.muted,
                          fontFamily:    FONT_MONO,
                          fontSize:      10,
                          letterSpacing: '0.05em',
                          textTransform: 'capitalize',
                          cursor:        'pointer',
                        }}
                      >
                        {a === 'all' ? 'All Staff' : a.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label style={labelStyle}>Title</label>
                  <input
                    style={inputStyle}
                    placeholder="e.g. Staff Meeting — Friday 3pm"
                    value={bTitle}
                    onChange={e => setBTitle(e.target.value)}
                  />
                </div>

                {/* Body */}
                <div>
                  <label style={labelStyle}>Message</label>
                  <textarea
                    rows={4}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                    placeholder="Type your message here…"
                    value={bBody}
                    onChange={e => setBBody(e.target.value)}
                  />
                </div>

                {/* Channel toggles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { key: 'push', label: 'Push Notification', note: '',              val: bPush, set: setBPush },
                    { key: 'sms',  label: 'SMS',               note: '≈ KES 1/msg',   val: bSms,  set: setBSms  },
                  ].map(({ key, label, note, val, set }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: val ? `${C.green}06` : C.elevated, border: `1px solid ${val ? C.green + '20' : C.borderSub}` }}>
                      <div>
                        <p style={{ fontSize: 12, color: C.text, margin: 0, fontWeight: val ? 500 : 400 }}>{label}</p>
                        {note && <p style={{ fontFamily: FONT_MONO, fontSize: 9, color: C.dim, margin: '2px 0 0', letterSpacing: '0.04em' }}>{note}</p>}
                      </div>
                      <button
                        onClick={() => set(!val)}
                        style={{
                          width:        36,
                          height:       20,
                          borderRadius: 10,
                          background:   val ? C.green : 'rgba(255,255,255,0.1)',
                          border:       'none',
                          position:     'relative',
                          cursor:       'pointer',
                          padding:      0,
                          flexShrink:   0,
                        }}
                      >
                        <span style={{ position: 'absolute', top: 2, left: val ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#e8e6e1', transition: 'left 0.15s' }} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Send button */}
                <button
                  onClick={sendBroadcast}
                  disabled={sending || !bTitle.trim() || !bBody.trim() || (!bPush && !bSms)}
                  style={{
                    padding:      '11px 0',
                    borderRadius: 7,
                    border:       'none',
                    background:   sending || !bTitle.trim() || !bBody.trim() ? C.dim : C.accent,
                    color:        '#fff',
                    fontFamily:   FONT_DISPLAY,
                    fontWeight:   600,
                    fontSize:     13,
                    cursor:       sending ? 'not-allowed' : 'pointer',
                    letterSpacing:'0.01em',
                  }}
                >
                  {sending ? 'Sending…' : `Send to ${audience === 'all' ? 'all staff' : audience} →`}
                </button>

                {sendResult && (
                  <div style={{
                    padding:      '10px 14px',
                    borderRadius: 7,
                    background:   sendResult.startsWith('✓') ? `${C.green}0a` : `${C.red}0a`,
                    border:       `1px solid ${sendResult.startsWith('✓') ? C.green : C.red}25`,
                  }}>
                    <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: sendResult.startsWith('✓') ? C.green : C.red, margin: 0 }}>
                      {sendResult}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Onboarding wizard ────────────────────────────────── */}
      <SchoolOnboardingWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onProvisioned={() => fetchSchools()}
      />
    </div>
  )
}
