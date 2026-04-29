'use client'

import { useState, useEffect } from 'react'

interface TierBreakdown {
  [tier: string]: { schools: number; mrr: number }
}

interface AdoptionRow {
  feature:  string
  enabled:  number
  active:   number
  adoption: number
  revenue:  number
}

interface HealthRow {
  schoolId: string
  name:     string
  score:    number
  tier:     string
  county:   string | null
  status:   string
  atRisk:   boolean
}

interface Metrics {
  revenue: {
    mrr:           number
    arr:           number
    activeSchools: number
    totalSchools:  number
    tierBreakdown: TierBreakdown
    featureRevenue: Record<string, number>
    newSchoolsByMonth: Record<string, number>
    churnRisk: {
      expiringIn30: { id: string; name: string; expires: string }[]
      inactive14:   { id: string; name: string }[]
    }
  }
  adoption:  AdoptionRow[]
  health:    HealthRow[]
  geography: { byCounty: Record<string, number>; topCounty: string | null }
  packaging: { topFeatures: { feature: string; count: number }[]; avgFeaturesEnabled: number; mostAdoptedFirst: string | null }
  generatedAt: string
}

function fmt(n: number) {
  return 'KES ' + n.toLocaleString('en-KE')
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'white', border: '1px solid #e5e7eb',
      borderRadius: 14, padding: '20px 22px',
      ...style,
    }}>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', margin: '28px 0 14px' }}>
      {children}
    </h2>
  )
}

function StatBig({ label, value, sub, color = '#1e40af' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card>
      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{sub}</div>}
    </Card>
  )
}

export default function BusinessMetricsPage() {
  const [data,    setData]    = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    fetch('/api/super/business-metrics')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: Metrics) => setData(d))
      .catch(e => setError(`Failed to load metrics (${e})`))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', color: '#9ca3af', fontFamily: 'system-ui' }}>
      Loading business metrics…
    </div>
  )

  if (error || !data) return (
    <div style={{ padding: 32, color: '#dc2626', fontFamily: 'system-ui' }}>
      {error || 'No data returned.'}
    </div>
  )

  const { revenue, adoption, health, geography, packaging } = data

  const arrTargets = [
    { label: 'KES 1M', value: 1_000_000 },
    { label: 'KES 2M', value: 2_000_000 },
    { label: 'KES 5M', value: 5_000_000 },
  ]

  const healthColor = (s: number) =>
    s >= 70 ? '#16a34a' : s >= 50 ? '#ca8a04' : '#dc2626'

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>
          Business Command Centre
        </h1>
        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
          God Mode · Updated {new Date(data.generatedAt).toLocaleString('en-KE')}
        </p>
      </div>

      {/* ── SECTION A: Revenue ─────────────────────────────────────────────── */}
      <SectionTitle>A — Revenue Intelligence</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatBig label="Monthly Recurring Revenue" value={fmt(revenue.mrr)} sub={`${revenue.activeSchools} active schools`} />
        <StatBig label="Annual Recurring Revenue" value={fmt(revenue.arr)} color="#059669" />
        <StatBig label="Total Schools" value={String(revenue.totalSchools)} sub={`${revenue.activeSchools} active`} color="#0891b2" />
        <StatBig
          label="Avg Revenue / School"
          value={revenue.activeSchools > 0 ? fmt(Math.round(revenue.mrr / revenue.activeSchools)) : '—'}
          color="#7c3aed"
        />
      </div>

      {/* ARR milestone bars */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 14 }}>ARR Milestones</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {arrTargets.map(t => {
            const pct = Math.min(100, (revenue.arr / t.value) * 100)
            return (
              <div key={t.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{t.label} target</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: pct >= 100 ? '#16a34a' : '#374151' }}>
                    {pct >= 100 ? '✓ Achieved' : `${pct.toFixed(1)}%`}
                  </span>
                </div>
                <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#16a34a' : '#1e40af', borderRadius: 4, transition: 'width .5s' }} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Tier breakdown */}
      {Object.keys(revenue.tierBreakdown).length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Revenue by Tier</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Tier', 'Schools', 'Monthly Revenue', 'Share'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(revenue.tierBreakdown).map(([tier, d]) => (
                <tr key={tier} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#374151' }}>{tier}</td>
                  <td style={{ padding: '8px 12px', color: '#6b7280' }}>{d.schools}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#059669' }}>{fmt(d.mrr)}</td>
                  <td style={{ padding: '8px 12px', color: '#9ca3af' }}>
                    {revenue.mrr > 0 ? ((d.mrr / revenue.mrr) * 100).toFixed(0) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Churn risk */}
      {(revenue.churnRisk.expiringIn30.length > 0 || revenue.churnRisk.inactive14.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
          {revenue.churnRisk.expiringIn30.length > 0 && (
            <Card>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>
                Expiring &lt; 30 days ({revenue.churnRisk.expiringIn30.length})
              </div>
              {revenue.churnRisk.expiringIn30.slice(0, 5).map(s => (
                <div key={s.id} style={{ fontSize: 12, color: '#374151', padding: '4px 0', borderBottom: '1px solid #fef2f2' }}>
                  {s.name} — <span style={{ color: '#dc2626' }}>{new Date(s.expires).toLocaleDateString('en-KE')}</span>
                </div>
              ))}
            </Card>
          )}
          {revenue.churnRisk.inactive14.length > 0 && (
            <Card>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#ca8a04', marginBottom: 8 }}>
                No logins 7+ days ({revenue.churnRisk.inactive14.length})
              </div>
              {revenue.churnRisk.inactive14.slice(0, 5).map(s => (
                <div key={s.id} style={{ fontSize: 12, color: '#374151', padding: '4px 0', borderBottom: '1px solid #fefce8' }}>
                  {s.name}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* New schools per month */}
      {Object.keys(revenue.newSchoolsByMonth).length > 0 && (
        <Card style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Schools Added (Last 6 Months)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 60 }}>
            {Object.entries(revenue.newSchoolsByMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => {
              const max  = Math.max(...Object.values(revenue.newSchoolsByMonth))
              const pct  = max > 0 ? (count / max) * 100 : 0
              return (
                <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#1e40af' }}>{count}</span>
                  <div style={{ width: '100%', background: '#1e40af', borderRadius: '3px 3px 0 0', height: `${pct * 0.5}px`, minHeight: 4 }} />
                  <span style={{ fontSize: 9, color: '#9ca3af', transform: 'rotate(-30deg)', transformOrigin: 'top center', marginTop: 2 }}>
                    {month.slice(5)}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ── SECTION B: Feature Adoption ──────────────────────────────────── */}
      <SectionTitle>B — Product Adoption</SectionTitle>
      <Card>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Feature', 'Enabled', 'Active (7d)', 'Adoption %', 'Add-on Revenue'].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {adoption.map(row => (
              <tr key={row.feature} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '9px 12px', fontWeight: 600, color: '#374151' }}>
                  {row.feature.replace(/_/g, ' ')}
                </td>
                <td style={{ padding: '9px 12px', color: '#6b7280' }}>{row.enabled}</td>
                <td style={{ padding: '9px 12px', color: '#6b7280' }}>{row.active}</td>
                <td style={{ padding: '9px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 48, height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${row.adoption}%`, height: '100%', background: row.adoption >= 70 ? '#16a34a' : row.adoption >= 40 ? '#ca8a04' : '#ef4444', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontWeight: 600, color: row.adoption >= 70 ? '#16a34a' : row.adoption >= 40 ? '#ca8a04' : '#ef4444' }}>
                      {row.enabled === 0 ? '—' : `${row.adoption}%`}
                    </span>
                  </div>
                  {row.enabled > 0 && row.active < row.enabled && (
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                      {row.enabled === 0 ? '' : row.active === 0 ? '⚠ Upsell opportunity' : '→ Training opportunity'}
                    </div>
                  )}
                </td>
                <td style={{ padding: '9px 12px', color: row.revenue > 0 ? '#059669' : '#9ca3af', fontWeight: row.revenue > 0 ? 600 : 400 }}>
                  {row.revenue > 0 ? fmt(row.revenue) : 'included'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* ── SECTION C: School Health Scores ──────────────────────────────── */}
      <SectionTitle>C — School Health Scores</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {health.map(s => (
          <Card key={s.schoolId} style={{ borderLeft: `4px solid ${healthColor(s.score)}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.tier} · {s.county ?? 'Unknown'}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: healthColor(s.score) }}>{s.score}</div>
            </div>
            <div style={{ height: 5, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${s.score}%`, height: '100%', background: healthColor(s.score), borderRadius: 3 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 10,
                background: s.status === 'active' ? '#f0fdf4' : '#fefce8',
                color: s.status === 'active' ? '#16a34a' : '#ca8a04',
                border: `1px solid ${s.status === 'active' ? '#bbf7d0' : '#fde68a'}`,
                fontWeight: 600,
              }}>
                {s.status}
              </span>
              {s.atRisk && (
                <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>⚠ Call this school</span>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* ── SECTION D: Geography ─────────────────────────────────────────── */}
      <SectionTitle>D — Geographic Intelligence</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Schools by County</div>
          {Object.entries(geography.byCounty)
            .sort((a, b) => b[1] - a[1])
            .map(([county, count]) => (
              <div key={county} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f9fafb' }}>
                <span style={{ fontSize: 12, color: '#374151' }}>
                  {county}
                  {geography.topCounty === county && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: '#1e40af', background: '#eff6ff', padding: '1px 5px', borderRadius: 8, fontWeight: 600 }}>Focus</span>
                  )}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>{count}</span>
              </div>
            ))}
        </Card>
        <Card>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Expansion Targets</div>
          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.8 }}>
            <p><strong>Focus market:</strong> {geography.topCounty ?? '—'}</p>
            <p style={{ marginTop: 8 }}><strong>Total schools:</strong> {revenue.totalSchools}</p>
            <p style={{ marginTop: 8, color: '#9ca3af', fontSize: 11 }}>
              Counties with 0 schools = greenfield opportunities for field sales.
            </p>
          </div>
        </Card>
      </div>

      {/* ── SECTION E: Packaging Insights ────────────────────────────────── */}
      <SectionTitle>E — Packaging Insights</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <Card>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
            Top 3 Features (by adoption)
          </div>
          {packaging.topFeatures.map((f, i) => (
            <div key={f.feature} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: i === 0 ? '#fbbf24' : i === 1 ? '#d1d5db' : '#d97706',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0,
              }}>
                {i + 1}
              </div>
              <span style={{ fontSize: 12, color: '#374151' }}>{f.feature.replace(/_/g, ' ')}</span>
              <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>{f.count} schools</span>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
            Engagement Depth
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#1e40af', lineHeight: 1 }}>{packaging.avgFeaturesEnabled}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>avg features enabled / school</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 10, lineHeight: 1.5 }}>
            Higher = more locked-in. Target: 4+
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
            Demo-First Feature
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#374151', lineHeight: 1.4 }}>
            {packaging.mostAdoptedFirst ? packaging.mostAdoptedFirst.replace(/_/g, ' ') : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, lineHeight: 1.5 }}>
            Lead with this in sales demos — it's what schools enable first.
          </div>
        </Card>
      </div>

    </div>
  )
}
