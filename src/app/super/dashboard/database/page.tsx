'use client'

import { useEffect, useState, useCallback } from 'react'

const C = { surface: '#0f0f1e', border: 'rgba(99,102,241,0.18)', text: '#e2e8f0', muted: '#475569', accent: '#6366f1', accentL: '#818cf8', green: '#4ade80', amber: '#fbbf24', red: '#f87171' }
const MONO = '"JetBrains Mono", monospace'

type TableStat = { table: string; count: number; error: string | null }
type HealthData = { pingMs: number; status: string; tables: TableStat[]; checkedAt: string }

const REPAIR_JOBS = [
  { job: 'purge_expired_otps',    label: 'Purge expired OTPs',          color: C.amber },
  { job: 'purge_old_system_logs', label: 'Purge logs > 90 days',        color: C.amber },
  { job: 'recalculate_fee_balances', label: 'Recalculate fee balances', color: C.accentL },
]

export default function DatabasePage() {
  const [health,  setHealth]  = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})

  const check = useCallback(() => {
    setLoading(true)
    fetch('/api/super/database/health').then(r => r.json()).then(setHealth).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { check() }, [check])

  async function repair(job: string) {
    setBusy(job)
    const r = await fetch('/api/super/database/repair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ job }) })
    const d = await r.json().catch(() => ({}))
    setResults(prev => ({ ...prev, [job]: d.result ?? (r.ok ? 'Done' : 'Failed') }))
    setBusy(null)
  }

  const statusColor = !health ? C.muted : health.status === 'healthy' ? C.green : C.amber

  return (
    <div style={{ fontFamily: MONO, color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.accentL, margin: 0 }}>Database</h1>
          <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.1em' }}>HEALTH · REPAIR · TABLE STATS</p>
        </div>
        <button onClick={check} style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.accentL, fontFamily: MONO, fontSize: 11, cursor: 'pointer' }}>
          ↺ REFRESH
        </button>
      </div>

      {/* Status banner */}
      <div style={{ background: C.surface, border: `1px solid ${statusColor}30`, borderRadius: 10, padding: '14px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {loading ? 'Checking…' : (health?.status ?? 'Unknown')}
          </div>
          {health && <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>Ping: {health.pingMs}ms · Checked: {new Date(health.checkedAt).toLocaleTimeString()}</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Table counts */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: 14 }}>Table Row Counts</div>
          {loading ? (
            <div style={{ color: C.muted, fontSize: 12 }}>Loading…</div>
          ) : (
            (health?.tables ?? []).map(t => (
              <div key={t.table} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: t.error ? C.red : C.muted, fontSize: 11 }}>{t.table}</span>
                <span style={{ color: t.error ? C.red : C.text, fontWeight: 600, fontSize: 11 }}>
                  {t.error ? 'ERR' : t.count.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Repair jobs */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: 14 }}>Maintenance Jobs</div>
          {REPAIR_JOBS.map(j => (
            <div key={j.job} style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: C.text }}>{j.label}</span>
                <button
                  onClick={() => repair(j.job)}
                  disabled={busy === j.job}
                  style={{ fontSize: 10, padding: '5px 12px', borderRadius: 5, cursor: busy === j.job ? 'wait' : 'pointer', border: `1px solid ${j.color}`, background: j.color + '15', color: j.color, fontFamily: MONO, opacity: busy === j.job ? 0.5 : 1 }}
                >
                  {busy === j.job ? 'Running…' : 'Run'}
                </button>
              </div>
              {results[j.job] && <div style={{ fontSize: 10, color: C.green, marginTop: 4 }}>✓ {results[j.job]}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
