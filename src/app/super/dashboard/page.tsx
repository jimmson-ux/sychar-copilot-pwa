'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'

const C = {
  bg:     '#070711', surface: '#0f0f1e', border: 'rgba(99,102,241,0.18)',
  text:   '#e2e8f0', muted: '#475569',   accent: '#6366f1', accentL: '#818cf8',
  green:  '#4ade80', amber: '#fbbf24',   red: '#f87171',    blue: '#38bdf8',
}
const MONO = '"JetBrains Mono", monospace'

type School = {
  id: string; name: string; county: string; shortCode: string | null; slug: string | null
  studentCount: number; staffCount: number; isActive: boolean
  daysLeft: number; addons: number; health: 'green' | 'amber' | 'red'; createdAt: string
  features: Record<string, boolean>
}
type Stats = { total: number; active: number; expiring: number; expired: number; students: number }

function Dot({ h }: { h: 'green' | 'amber' | 'red' }) {
  const col = h === 'green' ? C.green : h === 'amber' ? C.amber : C.red
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: col, boxShadow: `0 0 5px ${col}`, marginRight: 6 }} />
}

function Stat({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px', flex: 1, minWidth: 140 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function CommandCentrePage() {
  const [schools,      setSchools]      = useState<School[]>([])
  const [stats,        setStats]        = useState<Stats | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [filter,       setFilter]       = useState<'all' | 'green' | 'amber' | 'red'>('all')
  const [search,       setSearch]       = useState('')
  const [codePatch,    setCodePatch]    = useState<Record<string, string>>({})
  const [regenLoading, setRegenLoading] = useState<Record<string, boolean>>({})

  async function regenCode(schoolId: string) {
    setRegenLoading(p => ({ ...p, [schoolId]: true }))
    try {
      const r = await fetch(`/api/super/schools/${schoolId}/regen-code`, { method: 'POST' })
      const d = await r.json()
      if (r.ok && d.short_code) setCodePatch(p => ({ ...p, [schoolId]: d.short_code }))
    } finally {
      setRegenLoading(p => ({ ...p, [schoolId]: false }))
    }
  }

  useEffect(() => {
    fetch('/api/super/fleet')
      .then(r => r.json())
      .then(d => { setSchools(d.schools ?? []); setStats(d.stats ?? null) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const visible = schools
    .filter(s => filter === 'all' || s.health === filter)
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.county ?? '').toLowerCase().includes(search.toLowerCase()))

  if (loading) {
    return <div style={{ color: C.muted, fontFamily: MONO, fontSize: 12, paddingTop: 80, textAlign: 'center' }}>LOADING FLEET…</div>
  }

  return (
    <div style={{ fontFamily: MONO, color: C.text }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.accentL, margin: 0, letterSpacing: '-0.02em' }}>Fleet Command Centre</h1>
        <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.1em' }}>SYCHAR COPILOT · LIVE SCHOOL FLEET</p>
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
          <Stat label="Total Schools"    value={stats.total}    color={C.accentL} />
          <Stat label="Active"           value={stats.active}   color={C.green}   sub={`${stats.total - stats.active} suspended`} />
          <Stat label="Expiring ≤ 30d"   value={stats.expiring} color={C.amber}   />
          <Stat label="Expired"          value={stats.expired}  color={C.red}     />
          <Stat label="Total Students"   value={stats.students.toLocaleString()} color={C.blue} />
        </div>
      )}

      {/* Filter + search */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        {(['all', 'green', 'amber', 'red'] as const).map(f => {
          const col = f === 'all' ? C.accentL : f === 'green' ? C.green : f === 'amber' ? C.amber : C.red
          const cnt = f === 'all' ? schools.length : schools.filter(s => s.health === f).length
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', borderRadius: 20, border: `1px solid ${filter === f ? col : C.border}`,
              background: filter === f ? col + '22' : 'transparent', color: filter === f ? col : C.muted,
              fontFamily: MONO, fontSize: 11, cursor: 'pointer', fontWeight: filter === f ? 700 : 400,
            }}>
              {f.toUpperCase()} ({cnt})
            </button>
          )
        })}
        <input
          placeholder="Search school or county…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: 'auto', width: 200, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: MONO, fontSize: 12, padding: '7px 12px', outline: 'none' }}
        />
      </div>

      {/* Fleet table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Health', 'School', 'Code', 'URL', 'County', 'Students', 'Staff', 'Add-ons', 'Expires', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(s => (
              <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: s.isActive ? 1 : 0.5 }}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(99,102,241,0.05)'}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
              >
                <td style={{ padding: '11px 14px' }}><Dot h={s.health} /></td>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ fontWeight: 600, color: C.text }}>{s.name}</div>
                  {!s.isActive && <div style={{ fontSize: 9, color: C.red, letterSpacing: '0.1em' }}>SUSPENDED</div>}
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <span style={{ color: C.accent, fontWeight: 700, fontFamily: MONO }}>
                    {codePatch[s.id] ?? s.shortCode ?? '—'}
                  </span>
                  <button
                    onClick={() => regenCode(s.id)}
                    disabled={regenLoading[s.id]}
                    title="Regenerate short code"
                    style={{
                      marginLeft: 8, background: 'none', border: 'none', cursor: regenLoading[s.id] ? 'default' : 'pointer',
                      color: regenLoading[s.id] ? C.muted : C.accentL, fontSize: 13, padding: 0, lineHeight: 1,
                      opacity: regenLoading[s.id] ? 0.4 : 1,
                    }}
                  >↺</button>
                </td>
                <td style={{ padding: '11px 14px' }}>
                  {s.slug
                    ? <a href={`https://${s.slug}.sychar.co.ke`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: MONO, fontSize: 10, color: C.blue, textDecoration: 'none' }}>{s.slug}.sychar.co.ke</a>
                    : <span style={{ color: C.muted, fontSize: 10 }}>—</span>
                  }
                </td>
                <td style={{ padding: '11px 14px', color: C.muted }}>{s.county ?? '—'}</td>
                <td style={{ padding: '11px 14px', color: C.text }}>{s.studentCount.toLocaleString()}</td>
                <td style={{ padding: '11px 14px', color: C.text }}>{s.staffCount}</td>
                <td style={{ padding: '11px 14px', color: s.addons > 0 ? C.blue : C.muted }}>{s.addons}</td>
                <td style={{ padding: '11px 14px', color: s.daysLeft < 0 ? C.red : s.daysLeft <= 30 ? C.amber : C.green, whiteSpace: 'nowrap' }}>
                  {s.daysLeft < 0 ? `${Math.abs(s.daysLeft)}d ago` : `${s.daysLeft}d`}
                </td>
                <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                  <a href={`/super/dashboard/billing?school=${s.id}`} style={{ fontSize: 10, color: C.accentL, textDecoration: 'none', marginRight: 10 }}>Billing</a>
                  <a href={`/super/dashboard/features?school=${s.id}`} style={{ fontSize: 10, color: C.accentL, textDecoration: 'none' }}>Features</a>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 12 }}>No schools match filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
