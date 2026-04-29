'use client'

import { useState, useEffect, useCallback } from 'react'

type RiskTier = 'critical' | 'high' | 'medium' | 'low'

interface StudentRisk {
  id:                string
  name:              string
  admission_no:      string
  class_name:        string
  gender:            string
  risk_probability:  number
  risk_tier:         RiskTier
  attendance_score:  number
  grade_trend_score: number
  grade_volatility:  number
  discipline_score:  number
  engagement_score:  number
  flags:             string[]
  recommendations:   string[]
  computed_at:       string
}

interface Summary {
  students:    StudentRisk[]
  total:       number
  tierCounts:  { critical: number; high: number; medium: number; low: number }
  lastComputed: string | null
}

const TIER_CONFIG: Record<RiskTier, { label: string; bg: string; text: string; border: string; dot: string }> = {
  critical: { label: 'Critical',  bg: '#fef2f2', text: '#dc2626', border: '#fecaca', dot: '#ef4444' },
  high:     { label: 'High',      bg: '#fff7ed', text: '#ea580c', border: '#fed7aa', dot: '#f97316' },
  medium:   { label: 'Medium',    bg: '#fefce8', text: '#ca8a04', border: '#fde68a', dot: '#eab308' },
  low:      { label: 'Low',       bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0', dot: '#22c55e' },
}

const METRIC_INFO = [
  { key: 'attendance_score',  label: 'Attendance',  max: 25, icon: '📅' },
  { key: 'grade_trend_score', label: 'Grade Trend', max: 25, icon: '📉' },
  { key: 'grade_volatility',  label: 'Volatility',  max: 20, icon: '📊' },
  { key: 'discipline_score',  label: 'Discipline',  max: 15, icon: '⚖️' },
  { key: 'engagement_score',  label: 'Engagement',  max: 15, icon: '💬' },
] as const

function ScoreBar({ value, max, tier }: { value: number; max: number; tier: RiskTier }) {
  const pct  = Math.min(100, (value / max) * 100)
  const fill = tier === 'critical' ? '#ef4444' : tier === 'high' ? '#f97316' : tier === 'medium' ? '#eab308' : '#22c55e'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: fill, borderRadius: 3, transition: 'width .4s' }} />
      </div>
      <span style={{ fontSize: 11, color: '#6b7280', width: 28, textAlign: 'right' }}>{value}/{max}</span>
    </div>
  )
}

export default function RiskIntelligencePage() {
  const [data,       setData]       = useState<Summary | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [computing,  setComputing]  = useState(false)
  const [filterTier, setFilterTier] = useState<RiskTier | 'all'>('all')
  const [filterCls,  setFilterCls]  = useState('')
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState<StudentRisk | null>(null)
  const [toast,      setToast]      = useState('')

  const load = useCallback(async (tier?: string, cls?: string) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (tier && tier !== 'all') params.set('tier', tier)
    if (cls) params.set('class', cls)
    const res = await fetch(`/api/principal/risk-scores?${params}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function recompute() {
    setComputing(true)
    const res = await fetch('/api/principal/risk-scores', { method: 'POST' })
    if (res.ok) {
      showToast('Risk scores recomputed.')
      load(filterTier !== 'all' ? filterTier : undefined, filterCls || undefined)
    } else {
      showToast('Recomputation failed.')
    }
    setComputing(false)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function applyFilter(tier: RiskTier | 'all') {
    setFilterTier(tier)
    load(tier !== 'all' ? tier : undefined, filterCls || undefined)
  }

  const classes = [...new Set((data?.students ?? []).map(s => s.class_name).filter(Boolean))].sort()

  const visible = (data?.students ?? []).filter(s => {
    if (search) {
      const q = search.toLowerCase()
      if (!s.name.toLowerCase().includes(q) && !s.admission_no.includes(q)) return false
    }
    if (filterCls && s.class_name !== filterCls) return false
    return true
  })

  const tc = data?.tierCounts ?? { critical: 0, high: 0, medium: 0, low: 0 }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>

      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 50,
          background: '#1e40af', color: 'white', padding: '10px 18px',
          borderRadius: 10, fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>{toast}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>
            Risk Intelligence
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            Predictive model — attendance, grade trend, volatility, discipline, parent engagement
            {data?.lastComputed && (
              <> &middot; Last computed {new Date(data.lastComputed).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</>
            )}
          </p>
        </div>
        <button
          onClick={recompute} disabled={computing}
          style={{
            padding: '10px 18px', background: computing ? '#d1d5db' : '#1e40af',
            color: 'white', border: 'none', borderRadius: 10,
            fontSize: 13, fontWeight: 600, cursor: computing ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {computing ? 'Computing…' : '↺ Recompute Scores'}
        </button>
      </div>

      {/* Tier summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {(['critical', 'high', 'medium', 'low'] as RiskTier[]).map(tier => {
          const cfg     = TIER_CONFIG[tier]
          const count   = tc[tier]
          const active  = filterTier === tier
          return (
            <button
              key={tier}
              onClick={() => applyFilter(tier)}
              style={{
                padding: '16px 20px', borderRadius: 14, border: `2px solid ${active ? cfg.dot : cfg.border}`,
                background: active ? cfg.bg : 'white', cursor: 'pointer', textAlign: 'left',
                boxShadow: active ? `0 0 0 3px ${cfg.dot}22` : 'none',
                transition: 'all .15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.dot }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: cfg.text, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  {cfg.label}
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: cfg.text, lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>students</div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {filterTier !== 'all' && (
          <button
            onClick={() => { setFilterTier('all'); load(undefined, filterCls || undefined) }}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
              background: 'white', fontSize: 12, cursor: 'pointer', color: '#374151' }}
          >
            ✕ Clear tier filter
          </button>
        )}
        <select
          value={filterCls}
          onChange={e => { setFilterCls(e.target.value); load(filterTier !== 'all' ? filterTier : undefined, e.target.value || undefined) }}
          style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#374151' }}
        >
          <option value="">All classes</option>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="text" placeholder="Search name or admission no…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
            fontSize: 13, color: '#374151', minWidth: 220 }}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', fontSize: 14 }}>
          Loading risk scores…
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', fontSize: 14 }}>
          {data?.total === 0
            ? 'No risk scores yet. Click "Recompute Scores" to generate the first run.'
            : 'No students match your filters.'}
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Student', 'Class', 'Risk', 'Score', 'Top Flags', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11,
                    fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(s => {
                const cfg = TIER_CONFIG[s.risk_tier as RiskTier] ?? TIER_CONFIG.low
                return (
                  <tr key={s.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.admission_no}</div>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{s.class_name || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 20,
                        background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
                        fontSize: 11, fontWeight: 600,
                      }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 48, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{
                            width: `${s.risk_probability}%`, height: '100%',
                            background: cfg.dot, borderRadius: 3,
                          }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: cfg.text }}>{s.risk_probability}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', maxWidth: 220 }}>
                      {s.flags.slice(0, 2).map((f, i) => (
                        <div key={i} style={{ fontSize: 11, color: '#dc2626', marginBottom: 2 }}>• {f}</div>
                      ))}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <button
                        onClick={() => setSelected(selected?.id === s.id ? null : s)}
                        style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8,
                          padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: '#374151' }}
                      >
                        {selected?.id === s.id ? 'Close' : 'Details'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 360,
          background: 'white', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)',
          overflowY: 'auto', zIndex: 40, padding: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>
              {selected.name}
            </h2>
            <button
              onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280' }}
            >
              ✕
            </button>
          </div>

          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
            {selected.class_name} &middot; {selected.admission_no} &middot; {selected.gender}
          </div>

          {/* Overall badge */}
          {(() => {
            const cfg = TIER_CONFIG[selected.risk_tier as RiskTier] ?? TIER_CONFIG.low
            return (
              <div style={{
                padding: '14px 16px', borderRadius: 12,
                background: cfg.bg, border: `1.5px solid ${cfg.border}`,
                marginBottom: 20, textAlign: 'center',
              }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: cfg.text }}>{selected.risk_probability}%</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: cfg.text }}>{cfg.label} Risk</div>
              </div>
            )
          })()}

          {/* Component breakdown */}
          <h3 style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>
            Risk Components
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {METRIC_INFO.map(m => (
              <div key={m.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: '#374151' }}>{m.icon} {m.label}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>max {m.max}</span>
                </div>
                <ScoreBar
                  value={selected[m.key as keyof StudentRisk] as number}
                  max={m.max}
                  tier={selected.risk_tier as RiskTier}
                />
              </div>
            ))}
          </div>

          {/* Flags */}
          {selected.flags.length > 0 && (
            <>
              <h3 style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
                Risk Flags
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                {selected.flags.map((f, i) => (
                  <div key={i} style={{
                    padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca',
                    borderRadius: 8, fontSize: 12, color: '#dc2626',
                  }}>
                    ⚠ {f}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Recommendations */}
          {selected.recommendations.length > 0 && (
            <>
              <h3 style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
                Recommended Actions
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selected.recommendations.map((r, i) => (
                  <div key={i} style={{
                    padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0',
                    borderRadius: 8, fontSize: 12, color: '#15803d',
                  }}>
                    → {r}
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: 20, fontSize: 11, color: '#d1d5db', textAlign: 'center' }}>
            Computed {new Date(selected.computed_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      )}
    </div>
  )
}
