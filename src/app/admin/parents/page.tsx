'use client'

import { useEffect, useState, useCallback } from 'react'

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
  purple:   '#9b5de5',
} as const

const FONT_D = 'var(--font-display, Syne, sans-serif)'
const FONT_M = 'var(--font-mono, "JetBrains Mono", monospace)'

function fmt(n: number) { return n.toLocaleString('en-KE') }
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: '2-digit' })
}

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

function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      <span style={{ fontFamily: FONT_M, fontSize: 13, fontWeight: 600, color: color ?? C.text }}>{value}</span>
    </div>
  )
}

// Consent rate bar
function ConsentBar({ rate }: { rate: number }) {
  const color = rate > 70 ? C.green : rate > 40 ? C.amber : C.red
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
        <div style={{ width: `${rate}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontFamily: FONT_M, fontSize: 11, color, width: 36, textAlign: 'right' }}>{rate}%</span>
    </div>
  )
}

type Summary = {
  totalPendingAppts: number; totalOpenQueries: number
  totalParents: number; totalConsented: number; globalConsentRate: number
}
type PerSchool = {
  schoolId: string; schoolName: string; isActive: boolean
  appointments: { pending: number; confirmed: number; completed: number; cancelled: number }
  queries:      { open: number; closed: number; escalated: number }
  consent:      { total: number; consented: number; rate: number }
}
type RecentAppt = {
  id: string; school_id: string; schoolName: string; purpose: string; status: string; proposed_datetime: string
}
type RecentQuery = {
  id: string; school_id: string; schoolName: string; category: string; status: string; created_at: string; escalated_to: string | null
}
type ParentsData = {
  summary:              Summary
  categoryCounts:       Record<string, number>
  recentAppointments:   RecentAppt[]
  recentQueries:        RecentQuery[]
  perSchool:            PerSchool[]
}

export default function AdminParentsPage() {
  const [data,    setData]    = useState<ParentsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<'appointments' | 'queries' | 'consent'>('appointments')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/admin/platform/parents').then(r => r.json())
      setData(d)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const S = data?.summary

  const TABS = [
    { key: 'appointments', label: 'Appointments' },
    { key: 'queries',      label: 'Parent Queries' },
    { key: 'consent',      label: 'Consent & Coverage' },
  ] as const

  return (
    <div style={{ fontFamily: FONT_D, color: C.text }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: FONT_D, fontWeight: 800, fontSize: 26, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
            Parent PWA Monitor
          </h1>
          <p style={{ fontFamily: FONT_M, fontSize: 11, color: C.muted, margin: '5px 0 0' }}>
            Appointments, queries, and consent rates across all schools
          </p>
        </div>
        <button
          onClick={load}
          style={{ fontFamily: FONT_M, fontSize: 10, letterSpacing: '0.08em', color: C.muted, background: C.elevated, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 6, padding: '7px 12px', cursor: 'pointer' }}
        >
          ↺ REFRESH
        </button>
      </div>

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.muted, fontFamily: FONT_M, fontSize: 12 }}>Loading parent data…</div>
      ) : S && (
        <>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Pending Appointments', value: S.totalPendingAppts, color: S.totalPendingAppts > 0 ? C.amber : C.dim },
              { label: 'Open Queries',          value: S.totalOpenQueries,  color: S.totalOpenQueries > 0 ? C.purple : C.dim },
              { label: 'Registered Parents',    value: fmt(S.totalParents),    color: C.text },
              { label: 'Consented',             value: fmt(S.totalConsented), color: C.green },
              { label: 'Global Consent Rate',   value: `${S.globalConsentRate}%`, color: S.globalConsentRate > 70 ? C.green : S.globalConsentRate > 40 ? C.amber : C.red },
            ].map(k => (
              <div key={k.label} style={{ background: C.surface, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontFamily: FONT_M, fontSize: 9, letterSpacing: '0.1em', color: C.dim, textTransform: 'uppercase', marginBottom: 8 }}>{k.label}</div>
                <div style={{ fontFamily: FONT_M, fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Query categories */}
          {data && Object.keys(data.categoryCounts).length > 0 && (
            <div style={{ background: C.surface, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
              <div style={{ fontFamily: FONT_M, fontSize: 10, letterSpacing: '0.1em', color: C.dim, textTransform: 'uppercase', marginBottom: 10 }}>Query Categories</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(data.categoryCounts).sort(([,a],[,b]) => b - a).map(([cat, cnt]) => (
                  <div key={cat} style={{ background: C.elevated, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 6, padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: C.muted, textTransform: 'capitalize' }}>{cat}</span>
                    <span style={{ fontFamily: FONT_M, fontSize: 12, color: C.blue, fontWeight: 700 }}>{cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{ background: C.surface, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    padding:      '11px 20px',
                    background:   'transparent',
                    border:       'none',
                    borderBottom: tab === t.key ? `2px solid ${C.accent}` : '2px solid transparent',
                    color:        tab === t.key ? C.text : C.muted,
                    fontFamily:   FONT_D,
                    fontSize:     13,
                    fontWeight:   tab === t.key ? 600 : 400,
                    cursor:       'pointer',
                    marginBottom: -1,
                    transition:   'color 0.15s',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ padding: '16px 18px' }}>

              {/* Appointments tab */}
              {tab === 'appointments' && (
                <div>
                  {/* Per-school summary */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontFamily: FONT_M, fontSize: 10, letterSpacing: '0.08em', color: C.dim, textTransform: 'uppercase', marginBottom: 10 }}>By School</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(data?.perSchool ?? []).map(ps => (
                        <div key={ps.schoolId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: C.elevated, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 8 }}>
                          <div style={{ flex: 1, fontSize: 12, color: ps.isActive ? C.text : C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ps.schoolName}</div>
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            {ps.appointments.pending > 0 && <Pill label={`${ps.appointments.pending} pending`} color={C.amber} />}
                            {ps.appointments.confirmed > 0 && <Pill label={`${ps.appointments.confirmed} confirmed`} color={C.green} />}
                            {ps.appointments.completed > 0 && <span style={{ fontFamily: FONT_M, fontSize: 10, color: C.dim }}>{ps.appointments.completed} done</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent */}
                  <div>
                    <div style={{ fontFamily: FONT_M, fontSize: 10, letterSpacing: '0.08em', color: C.dim, textTransform: 'uppercase', marginBottom: 10 }}>Recent Appointments</div>
                    {(data?.recentAppointments ?? []).length === 0
                      ? <div style={{ textAlign: 'center', color: C.dim, fontFamily: FONT_M, fontSize: 12, padding: 20 }}>No appointments yet</div>
                      : (data?.recentAppointments ?? []).map(a => (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.purpose}</div>
                            <div style={{ fontFamily: FONT_M, fontSize: 10, color: C.dim, marginTop: 2 }}>{a.schoolName} · {a.proposed_datetime ? fmtDate(a.proposed_datetime) : '—'}</div>
                          </div>
                          <Pill
                            label={a.status?.toUpperCase() ?? 'PENDING'}
                            color={a.status === 'Pending' ? C.amber : a.status === 'Confirmed' ? C.green : a.status === 'Cancelled' ? C.red : C.muted}
                          />
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}

              {/* Queries tab */}
              {tab === 'queries' && (
                <div>
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontFamily: FONT_M, fontSize: 10, letterSpacing: '0.08em', color: C.dim, textTransform: 'uppercase', marginBottom: 10 }}>By School</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(data?.perSchool ?? []).map(ps => (
                        <div key={ps.schoolId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: C.elevated, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 8 }}>
                          <div style={{ flex: 1, fontSize: 12, color: ps.isActive ? C.text : C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ps.schoolName}</div>
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            {ps.queries.open > 0 && <Pill label={`${ps.queries.open} open`} color={C.purple} />}
                            {ps.queries.escalated > 0 && <Pill label={`${ps.queries.escalated} escalated`} color={C.red} />}
                            {ps.queries.closed > 0 && <span style={{ fontFamily: FONT_M, fontSize: 10, color: C.dim }}>{ps.queries.closed} closed</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontFamily: FONT_M, fontSize: 10, letterSpacing: '0.08em', color: C.dim, textTransform: 'uppercase', marginBottom: 10 }}>Recent Queries</div>
                    {(data?.recentQueries ?? []).length === 0
                      ? <div style={{ textAlign: 'center', color: C.dim, fontFamily: FONT_M, fontSize: 12, padding: 20 }}>No queries yet</div>
                      : (data?.recentQueries ?? []).map(q => (
                        <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: FONT_M, fontSize: 11, color: C.blue, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.category}</div>
                            <div style={{ fontFamily: FONT_M, fontSize: 10, color: C.dim, marginTop: 2 }}>{q.schoolName} · {fmtDate(q.created_at)}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                            <Pill label={q.status?.toUpperCase() ?? 'OPEN'} color={q.status === 'open' ? C.purple : C.dim} />
                            {q.escalated_to && <Pill label="ESCALATED" color={C.red} />}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}

              {/* Consent tab */}
              {tab === 'consent' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontFamily: FONT_M, fontSize: 10, letterSpacing: '0.08em', color: C.dim, textTransform: 'uppercase', marginBottom: 4 }}>Consent Rate by School</div>
                  {(data?.perSchool ?? []).map(ps => (
                    <div key={ps.schoolId} style={{ background: C.elevated, border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: ps.isActive ? C.text : C.dim }}>{ps.schoolName}</span>
                        <span style={{ fontFamily: FONT_M, fontSize: 10, color: C.muted }}>{fmt(ps.consent.consented)} / {fmt(ps.consent.total)}</span>
                      </div>
                      <ConsentBar rate={ps.consent.rate} />
                    </div>
                  ))}
                  {(data?.perSchool ?? []).every(ps => ps.consent.total === 0) && (
                    <div style={{ textAlign: 'center', color: C.dim, fontFamily: FONT_M, fontSize: 12, padding: 20 }}>
                      No parent consent data yet
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </>
      )}
    </div>
  )
}
