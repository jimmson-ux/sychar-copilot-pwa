'use client'

import { useEffect, useState, useCallback } from 'react'

const C = {
  bg:       '#0a0a0b',
  surface:  '#111114',
  elevated: '#18181d',
  card:     '#14141a',
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
  purple:   '#9b5de5',
} as const

const FONT_D = 'var(--font-display, Syne, sans-serif)'
const FONT_M = 'var(--font-mono, "JetBrains Mono", monospace)'

function fmt(n: number) { return n.toLocaleString('en-KE') }
function fmtKES(n: number) {
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `KES ${(n / 1_000).toFixed(0)}K`
  return `KES ${n}`
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── KPI Card ─────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon?: string
}) {
  return (
    <div style={{
      background:   C.surface,
      border:       `1px solid ${C.borderSub}`,
      borderRadius: 12,
      padding:      '18px 20px',
      display:      'flex',
      flexDirection:'column',
      gap:          6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONT_M, fontSize: 10, letterSpacing: '0.1em', color: C.dim, textTransform: 'uppercase' }}>{label}</span>
        {icon && <span style={{ fontSize: 16, opacity: 0.5 }}>{icon}</span>}
      </div>
      <div style={{ fontFamily: FONT_M, fontSize: 26, fontWeight: 700, color: color ?? C.text, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: FONT_M, fontSize: 10, color: C.muted }}>{sub}</div>}
    </div>
  )
}

// ── Pill badge ───────────────────────────────────────────────────
function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily:   FONT_M,
      fontSize:     9,
      letterSpacing:'0.06em',
      color,
      background:   color + '18',
      border:       `1px solid ${color}30`,
      borderRadius: 4,
      padding:      '2px 6px',
      whiteSpace:   'nowrap',
    }}>
      {label}
    </span>
  )
}

// ── Tab bar ───────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.borderSub}`, padding: '0 18px' }}>
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            padding:      '10px 14px',
            background:   'transparent',
            border:       'none',
            borderBottom: active === t ? `2px solid ${C.accent}` : '2px solid transparent',
            color:        active === t ? C.text : C.muted,
            fontFamily:   FONT_D,
            fontSize:     12,
            fontWeight:   active === t ? 600 : 400,
            cursor:       'pointer',
            marginBottom: -1,
            transition:   'color 0.15s',
            letterSpacing:'0.01em',
          }}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

// ── Revenue sparkline (CSS bars) ─────────────────────────────────
function RevSparkline({ data }: { data: { month: string; amount: number }[] }) {
  const max = Math.max(...data.map(d => d.amount), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 40 }}>
      {data.map(d => (
        <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div
            title={`${d.month}: ${fmtKES(d.amount)}`}
            style={{
              width:        '100%',
              height:       Math.max(3, (d.amount / max) * 36),
              background:   C.green,
              borderRadius: 2,
              opacity:      0.75,
              transition:   'height 0.3s',
            }}
          />
          <span style={{ fontFamily: FONT_M, fontSize: 8, color: C.dim }}>{d.month.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
type SchoolBrief = {
  id: string; name: string; county: string; isActive: boolean
  studentCount: number; expiresAt: string; pendingAppts: number
}

type Totals = {
  schools: number; activeSchools: number; suspendedSchools: number
  students: number; staff: number; unreviewedFlags: number
  pendingAppts: number; confirmedAppts: number; openQueries: number
  totalInvoiced: number; totalPaid: number; collectionRate: number
}

type Overview = {
  totals:        Totals
  revTrend:      { month: string; amount: number }[]
  expiringSoon:  { id: string; name: string; expiresAt: string }[]
  schoolOverview: SchoolBrief[]
}

type SchoolDetail = {
  staff:          any[]
  staffByRole:    Record<string, number>
  students:       { total: number; classBreakdown: { name: string; count: number }[] }
  fees:           { totalInvoiced: number; totalPaid: number; balance: number; collectionRate: number; recentPayments: any[]; pendingConfirmations: number }
  flags:          { total: number; unreviewed: number; items: any[] }
  appointments:   { total: number; pending: number; items: any[] }
  queries:        { total: number; open: number; items: any[] }
  duties:         any[]
}

// ─────────────────────────────────────────────────────────────────
// Detail Panel
// ─────────────────────────────────────────────────────────────────
function SchoolDetailPanel({ school, onClose }: { school: SchoolBrief; onClose: () => void }) {
  const [tab,    setTab]    = useState('Overview')
  const [detail, setDetail] = useState<SchoolDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/platform/school/${school.id}`)
      .then(r => r.json())
      .then(d => { setDetail(d as SchoolDetail); setLoading(false) })
      .catch(() => setLoading(false))
  }, [school.id])

  async function patchStaff(staffId: string, patch: Record<string, unknown>) {
    setSaving(staffId)
    await fetch(`/api/admin/platform/school/${school.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ staffId, patch }),
    })
    const fresh = await fetch(`/api/admin/platform/school/${school.id}`).then(r => r.json())
    setDetail(fresh as SchoolDetail)
    setSaving(null)
  }

  const TABS = ['Overview', 'Staff', 'Fees', 'Flags', 'Appointments']

  return (
    <div style={{
      width:       400,
      flexShrink:  0,
      background:  C.surface,
      border:      `1px solid ${C.borderSub}`,
      borderRadius:12,
      overflow:    'hidden',
      display:     'flex',
      flexDirection:'column',
      maxHeight:   'calc(100vh - 140px)',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.borderSub}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {school.name}
          </div>
          <div style={{ fontFamily: FONT_M, fontSize: 10, color: C.muted, marginTop: 3 }}>
            {school.county} · {fmt(school.studentCount)} students
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.muted, fontFamily: FONT_M, fontSize: 12, paddingTop: 30 }}>Loading…</div>
        ) : !detail ? (
          <div style={{ textAlign: 'center', color: C.red, fontFamily: FONT_M, fontSize: 12, paddingTop: 30 }}>Failed to load</div>
        ) : (
          <>
            {/* ── Overview Tab ───────────────────────────── */}
            {tab === 'Overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'Students',    value: fmt(detail.students.total),          color: C.text },
                  { label: 'Staff',       value: fmt(detail.staff.length),             color: C.text },
                  { label: 'Collection',  value: `${detail.fees.collectionRate}%`,    color: detail.fees.collectionRate > 70 ? C.green : detail.fees.collectionRate > 40 ? C.amber : C.red },
                  { label: 'Invoiced',    value: fmtKES(detail.fees.totalInvoiced),   color: C.muted },
                  { label: 'Collected',   value: fmtKES(detail.fees.totalPaid),       color: C.green },
                  { label: 'Balance',     value: fmtKES(detail.fees.balance),         color: C.amber },
                  { label: 'Unreviewed Flags',  value: fmt(detail.flags.unreviewed),  color: detail.flags.unreviewed > 0 ? C.red : C.dim },
                  { label: 'Pending Appts',     value: fmt(detail.appointments.pending), color: detail.appointments.pending > 0 ? C.amber : C.dim },
                  { label: 'Open Queries',      value: fmt(detail.queries.open),      color: detail.queries.open > 0 ? C.blue : C.dim },
                  { label: 'Pending Payments',  value: fmt(detail.fees.pendingConfirmations), color: detail.fees.pendingConfirmations > 0 ? C.amber : C.dim },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.borderSub}`, paddingBottom: 10 }}>
                    <span style={{ fontSize: 12, color: C.muted }}>{r.label}</span>
                    <span style={{ fontFamily: FONT_M, fontSize: 13, fontWeight: 600, color: r.color }}>{r.value}</span>
                  </div>
                ))}
                {/* Class breakdown */}
                {detail.students.classBreakdown.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontFamily: FONT_M, fontSize: 10, letterSpacing: '0.08em', color: C.dim, textTransform: 'uppercase', marginBottom: 8 }}>Class Breakdown</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {detail.students.classBreakdown.map(c => (
                        <span key={c.name} style={{ fontFamily: FONT_M, fontSize: 11, color: C.text, background: C.elevated, border: `1px solid ${C.borderSub}`, borderRadius: 5, padding: '3px 8px' }}>
                          {c.name} <span style={{ color: C.muted }}>({c.count})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Staff by role */}
                {Object.keys(detail.staffByRole).length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontFamily: FONT_M, fontSize: 10, letterSpacing: '0.08em', color: C.dim, textTransform: 'uppercase', marginBottom: 8 }}>Staff by Role</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {Object.entries(detail.staffByRole).map(([role, cnt]) => (
                        <div key={role} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ color: C.muted }}>{role.replace(/_/g, ' ')}</span>
                          <span style={{ fontFamily: FONT_M, color: C.text }}>{cnt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Staff Tab ──────────────────────────────── */}
            {tab === 'Staff' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {detail.staff.length === 0 ? (
                  <div style={{ textAlign: 'center', color: C.dim, fontFamily: FONT_M, fontSize: 12, padding: '20px 0' }}>No staff records</div>
                ) : detail.staff.map((s: any) => (
                  <div key={s.id} style={{
                    background:   s.is_active ? 'transparent' : 'rgba(226,75,74,0.04)',
                    border:       `1px solid ${C.borderSub}`,
                    borderRadius: 8,
                    padding:      '10px 12px',
                    display:      'flex',
                    alignItems:   'center',
                    gap:          10,
                    opacity:      s.is_active ? 1 : 0.5,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</div>
                      <div style={{ fontFamily: FONT_M, fontSize: 9, color: C.muted, marginTop: 2 }}>
                        {(s.sub_role ?? '').replace(/_/g, ' ')}
                        {s.email ? ` · ${s.email}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      {/* is_active toggle */}
                      <button
                        disabled={saving === s.id}
                        title={s.is_active ? 'Deactivate' : 'Activate'}
                        onClick={() => patchStaff(s.id, { is_active: !s.is_active })}
                        style={{
                          fontFamily:   FONT_M,
                          fontSize:     9,
                          padding:      '3px 7px',
                          borderRadius: 4,
                          border:       `1px solid ${s.is_active ? C.green : C.red}40`,
                          background:   s.is_active ? `${C.green}12` : `${C.red}12`,
                          color:        s.is_active ? C.green : C.red,
                          cursor:       saving === s.id ? 'wait' : 'pointer',
                        }}
                      >
                        {s.is_active ? '● ON' : '○ OFF'}
                      </button>
                      {/* can_login toggle */}
                      <button
                        disabled={saving === s.id}
                        title={s.can_login ? 'Block login' : 'Allow login'}
                        onClick={() => patchStaff(s.id, { can_login: !s.can_login })}
                        style={{
                          fontFamily:   FONT_M,
                          fontSize:     9,
                          padding:      '3px 7px',
                          borderRadius: 4,
                          border:       `1px solid ${s.can_login ? C.blue : C.dim}40`,
                          background:   s.can_login ? `${C.blue}12` : `${C.dim}12`,
                          color:        s.can_login ? C.blue : C.dim,
                          cursor:       saving === s.id ? 'wait' : 'pointer',
                        }}
                      >
                        {s.can_login ? '⌁ LOGIN' : '⊘ BLOCKED'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Fees Tab ───────────────────────────────── */}
            {tab === 'Fees' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Summary */}
                <div style={{ background: C.elevated, border: `1px solid ${C.borderSub}`, borderRadius: 8, padding: '12px 14px' }}>
                  {[
                    { l: 'Total Invoiced',  v: fmtKES(detail.fees.totalInvoiced),    c: C.text  },
                    { l: 'Total Collected', v: fmtKES(detail.fees.totalPaid),         c: C.green },
                    { l: 'Outstanding',     v: fmtKES(detail.fees.balance),           c: C.amber },
                    { l: 'Collection Rate', v: `${detail.fees.collectionRate}%`,      c: detail.fees.collectionRate > 70 ? C.green : detail.fees.collectionRate > 40 ? C.amber : C.red },
                    { l: 'Pending M-Pesa',  v: fmt(detail.fees.pendingConfirmations), c: C.amber },
                  ].map(row => (
                    <div key={row.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${C.borderSub}` }}>
                      <span style={{ fontSize: 12, color: C.muted }}>{row.l}</span>
                      <span style={{ fontFamily: FONT_M, fontSize: 12, fontWeight: 600, color: row.c }}>{row.v}</span>
                    </div>
                  ))}
                </div>
                {/* Recent payments */}
                <div>
                  <div style={{ fontFamily: FONT_M, fontSize: 10, letterSpacing: '0.08em', color: C.dim, textTransform: 'uppercase', marginBottom: 8 }}>Recent Payments</div>
                  {detail.fees.recentPayments.slice(0, 10).map((p: any) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.borderSub}` }}>
                      <div>
                        <div style={{ fontFamily: FONT_M, fontSize: 11, color: C.green }}>{fmtKES(p.amount)}</div>
                        <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{p.payment_method ?? 'cash'} · {p.payment_date?.slice(0, 10)}</div>
                      </div>
                      {p.pending_confirmation && <Pill label="PENDING" color={C.amber} />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Flags Tab ──────────────────────────────── */}
            {tab === 'Flags' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.flags.items.length === 0 ? (
                  <div style={{ textAlign: 'center', color: C.dim, fontFamily: FONT_M, fontSize: 12, padding: '20px 0' }}>No flags</div>
                ) : detail.flags.items.map((f: any) => (
                  <div key={f.id} style={{ border: `1px solid ${C.borderSub}`, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ fontSize: 12, color: C.text, flex: 1 }}>{f.reason}</div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        {f.severity && <Pill label={f.severity.toUpperCase()} color={f.severity === 'high' ? C.red : f.severity === 'medium' ? C.amber : C.muted} />}
                        {!f.reviewed && <Pill label="UNREVIEWED" color={C.red} />}
                      </div>
                    </div>
                    <div style={{ fontFamily: FONT_M, fontSize: 9, color: C.dim, marginTop: 5 }}>{fmtDate(f.created_at)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Appointments Tab ───────────────────────── */}
            {tab === 'Appointments' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.appointments.items.length === 0 ? (
                  <div style={{ textAlign: 'center', color: C.dim, fontFamily: FONT_M, fontSize: 12, padding: '20px 0' }}>No appointments</div>
                ) : detail.appointments.items.map((a: any) => (
                  <div key={a.id} style={{ border: `1px solid ${C.borderSub}`, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ fontSize: 12, color: C.text, flex: 1 }}>{a.purpose}</div>
                      <Pill
                        label={a.status?.toUpperCase()}
                        color={a.status === 'Pending' ? C.amber : a.status === 'Confirmed' ? C.green : a.status === 'Cancelled' ? C.red : C.muted}
                      />
                    </div>
                    <div style={{ fontFamily: FONT_M, fontSize: 9, color: C.dim, marginTop: 5 }}>
                      {a.proposed_datetime ? fmtDate(a.proposed_datetime) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────
export default function PlatformOverviewPage() {
  const [overview, setOverview]     = useState<Overview | null>(null)
  const [loading,  setLoading]      = useState(true)
  const [selected, setSelected]     = useState<SchoolBrief | null>(null)
  const [search,   setSearch]       = useState('')
  const [filter,   setFilter]       = useState<'all' | 'active' | 'suspended' | 'expiring'>('all')
  const [sortBy,   setSortBy]       = useState<'name' | 'students' | 'appts'>('name')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/admin/platform/overview').then(r => r.json())
      setOverview(data as Overview)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const schools = overview?.schoolOverview ?? []
  const filtered = schools
    .filter(s => {
      if (filter === 'active')    return s.isActive
      if (filter === 'suspended') return !s.isActive
      if (filter === 'expiring')  return (overview?.expiringSoon ?? []).some(e => e.id === s.id)
      return true
    })
    .filter(s => {
      if (!search) return true
      const q = search.toLowerCase()
      return s.name.toLowerCase().includes(q) || s.county.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (sortBy === 'students') return b.studentCount - a.studentCount
      if (sortBy === 'appts')    return b.pendingAppts - a.pendingAppts
      return a.name.localeCompare(b.name)
    })

  const T = overview?.totals

  return (
    <div style={{ fontFamily: FONT_D, color: C.text }}>

      {/* ── Header ───────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: 28, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
            Platform Command
          </h1>
          <p style={{ fontFamily: FONT_M, fontSize: 11, color: C.muted, margin: '5px 0 0' }}>
            Real-time view across all tenants
          </p>
        </div>
        <button
          onClick={load}
          style={{ fontFamily: FONT_M, fontSize: 10, letterSpacing: '0.08em', color: C.muted, background: C.elevated, border: `1px solid ${C.borderSub}`, borderRadius: 6, padding: '7px 12px', cursor: 'pointer' }}
        >
          ↺ REFRESH
        </button>
      </div>

      {loading && !overview ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.muted, fontFamily: FONT_M, fontSize: 12 }}>Loading platform data…</div>
      ) : T && (
        <>
          {/* ── KPI Grid ───────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            <KpiCard label="Schools"       value={T.schools}         sub={`${T.activeSchools} active · ${T.suspendedSchools} off`} icon="⬡" />
            <KpiCard label="Students"      value={fmt(T.students)}   sub="active enrollments"   icon="◉" color={C.blue}   />
            <KpiCard label="Staff"         value={fmt(T.staff)}      sub="active records"       icon="◈" />
            <KpiCard label="Collection"    value={`${T.collectionRate}%`} sub={`${fmtKES(T.totalPaid)} / ${fmtKES(T.totalInvoiced)}`} icon="◎" color={T.collectionRate > 70 ? C.green : T.collectionRate > 40 ? C.amber : C.red} />
            <KpiCard label="Open Flags"    value={T.unreviewedFlags} sub="unreviewed"            icon="⚑" color={T.unreviewedFlags > 0 ? C.red : C.dim} />
            <KpiCard label="Pending Appts" value={T.pendingAppts}    sub={`${T.confirmedAppts} confirmed`} icon="◷" color={T.pendingAppts > 0 ? C.amber : C.dim} />
            <KpiCard label="Parent Queries" value={T.openQueries}   sub="open"                  icon="✉" color={T.openQueries > 0 ? C.purple : C.dim} />
          </div>

          {/* ── Revenue trend ──────────────────────────────── */}
          {overview?.revTrend && (
            <div style={{ background: C.surface, border: `1px solid ${C.borderSub}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
              <div style={{ fontFamily: FONT_M, fontSize: 10, letterSpacing: '0.1em', color: C.dim, textTransform: 'uppercase', marginBottom: 12 }}>
                Fee Collection — Last 6 Months
              </div>
              <RevSparkline data={overview.revTrend} />
            </div>
          )}

          {/* ── Expiring soon ──────────────────────────────── */}
          {(overview?.expiringSoon ?? []).length > 0 && (
            <div style={{ background: `${C.amber}0a`, border: `1px solid ${C.amber}25`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 16 }}>⚠</span>
              <div>
                <div style={{ fontFamily: FONT_M, fontSize: 11, color: C.amber, letterSpacing: '0.05em' }}>SUBSCRIPTIONS EXPIRING SOON</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                  {(overview?.expiringSoon ?? []).map(s => (
                    <span key={s.id} style={{ marginRight: 14 }}>
                      <span style={{ color: C.text }}>{s.name}</span>
                      <span style={{ color: C.dim }}> · {fmtDate(s.expiresAt)}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Filter + sort bar ──────────────────────────── */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              placeholder="Search school or county…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                background:   C.surface,
                border:       `1px solid ${C.borderSub}`,
                borderRadius: 6,
                color:        C.text,
                fontFamily:   FONT_D,
                fontSize:     13,
                padding:      '8px 12px',
                outline:      'none',
                width:        220,
              }}
            />
            {(['all', 'active', 'suspended', 'expiring'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding:      '7px 14px',
                borderRadius: 6,
                border:       `1px solid ${filter === f ? C.borderStr : C.borderSub}`,
                background:   filter === f ? C.elevated : 'transparent',
                color:        filter === f ? C.text : C.muted,
                fontFamily:   FONT_D,
                fontSize:     12,
                fontWeight:   filter === f ? 600 : 400,
                cursor:       'pointer',
                textTransform:'capitalize',
              }}>{f}</button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontFamily: FONT_M, fontSize: 10, color: C.dim }}>SORT:</span>
              {(['name', 'students', 'appts'] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)} style={{
                  padding:    '5px 10px',
                  borderRadius:5,
                  border:     `1px solid ${sortBy === s ? C.borderStr : C.borderSub}`,
                  background: sortBy === s ? C.elevated : 'transparent',
                  color:      sortBy === s ? C.text : C.dim,
                  fontFamily: FONT_M,
                  fontSize:   10,
                  cursor:     'pointer',
                  letterSpacing:'0.06em',
                }}>{s.toUpperCase()}</button>
              ))}
            </div>
          </div>

          {/* ── Table + detail panel ───────────────────────── */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

            {/* Table */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ background: C.surface, border: `1px solid ${C.borderSub}`, borderRadius: 12, overflow: 'hidden' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: C.dim, fontFamily: FONT_M, fontSize: 12 }}>No schools match filter.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.borderSub}` }}>
                        {['School', 'County', 'Students', 'Expires', 'Appts', 'Status', ''].map((col, i) => (
                          <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontFamily: FONT_M, fontSize: 9, letterSpacing: '0.08em', color: C.dim, textTransform: 'uppercase', fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(s => {
                        const isSel = selected?.id === s.id
                        const daysLeft = Math.ceil((new Date(s.expiresAt).getTime() - Date.now()) / 86400000)
                        const expColor = daysLeft < 14 ? C.red : daysLeft < 30 ? C.amber : C.muted
                        return (
                          <tr
                            key={s.id}
                            onClick={() => setSelected(prev => prev?.id === s.id ? null : s)}
                            style={{
                              borderBottom: `1px solid ${C.borderSub}`,
                              cursor:       'pointer',
                              background:   isSel ? 'rgba(232,89,60,0.06)' : 'transparent',
                              opacity:      s.isActive ? 1 : 0.45,
                              transition:   'background 0.1s',
                            }}
                            onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)' }}
                            onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                          >
                            <td style={{ padding: '12px 14px', fontWeight: 500, fontSize: 13, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                              {s.name}
                              {!s.isActive && <div style={{ fontFamily: FONT_M, fontSize: 9, color: C.red, letterSpacing: '0.1em', marginTop: 2 }}>TERMINATED</div>}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>{s.county}</td>
                            <td style={{ padding: '12px 14px', fontFamily: FONT_M, fontSize: 12, color: C.text }}>{fmt(s.studentCount)}</td>
                            <td style={{ padding: '12px 14px', fontFamily: FONT_M, fontSize: 11, color: expColor, whiteSpace: 'nowrap' }}>
                              {daysLeft < 0 ? 'Expired' : `${daysLeft}d`}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              {s.pendingAppts > 0
                                ? <Pill label={`${s.pendingAppts} pending`} color={C.amber} />
                                : <span style={{ fontFamily: FONT_M, fontSize: 11, color: C.dim }}>—</span>
                              }
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <Pill label={s.isActive ? '● LIVE' : '○ OFF'} color={s.isActive ? C.green : C.red} />
                            </td>
                            <td style={{ padding: '12px 10px', color: isSel ? C.accent : C.dim, fontSize: 14, fontWeight: 700 }}>›</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Detail panel */}
            {selected && <SchoolDetailPanel school={selected} onClose={() => setSelected(null)} />}
          </div>
        </>
      )}
    </div>
  )
}
