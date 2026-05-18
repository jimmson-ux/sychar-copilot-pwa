'use client'

export interface SchoolHealthSnapshot {
  date: string
  enrolment: number
  boys: number
  girls: number
  collectionPct: number
  totalExpectedKES: number
  totalReceivedKES: number
  staffTotal: number
  staffTSC: number
  staffingGaps: number
  meanScore: number | null
  bomTarget: number
  openDiscipline: number
  activeSuspensions: number
  maintenanceIssues: number
  daysRemaining: number | null
  summaryText: string
}

function feeColor(pct: number) {
  if (pct >= 80) return '#22c55e'
  if (pct >= 50) return '#f59e0b'
  return '#ef4444'
}

function Tile({ label, value, sub, borderColor, valueColor, badge }: {
  label: string; value: string | number; sub?: string
  borderColor: string; valueColor?: string; badge?: string
}) {
  return (
    <div style={{
      flex: 1, minWidth: 140,
      background: 'white', borderRadius: 14, padding: '14px 16px',
      boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
      borderTop: `3px solid ${borderColor}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {badge && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#ef4444',
            background: '#fef2f2', borderRadius: 20, padding: '2px 8px',
          }}>{badge}</span>
        )}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: valueColor ?? '#111827' }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function SchoolHealthCard({ data: s }: { data: SchoolHealthSnapshot }) {
  const dateStr = new Date(s.date).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Summary banner */}
      <div style={{
        background: 'linear-gradient(135deg,#eef2ff,#dbeafe)',
        border: '1px solid #c7d2fe',
        borderRadius: 16, padding: '16px 20px',
        marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: 1 }}>
            School Health Summary
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#4f46e5',
            background: '#e0e7ff', borderRadius: 20, padding: '2px 8px',
          }}>Live</span>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: '#374151', margin: 0 }}>{s.summaryText}</p>
        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, marginBottom: 0 }}>As at {dateStr}</p>
      </div>

      {/* Row 1 — 4 tiles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <Tile
          label="Enrolled students"
          value={s.enrolment.toLocaleString('en-KE')}
          sub={`${s.boys} boys · ${s.girls} girls`}
          borderColor="#6366f1"
        />
        <Tile
          label="Fee collection rate"
          value={`${s.collectionPct}%`}
          sub={`KES ${Math.round(s.totalReceivedKES).toLocaleString('en-KE')} received`}
          borderColor={feeColor(s.collectionPct)}
          valueColor={feeColor(s.collectionPct)}
        />
        <Tile
          label="Active staff"
          value={s.staffTotal}
          sub={`${s.staffTSC} TSC-employed`}
          borderColor="#0ea5e9"
        />
        <Tile
          label="Staffing gaps"
          value={s.staffingGaps}
          sub="Non-TSC active staff"
          borderColor={s.staffingGaps > 0 ? '#ef4444' : '#22c55e'}
          valueColor={s.staffingGaps > 0 ? '#ef4444' : '#16a34a'}
          badge={s.staffingGaps > 0 ? 'Urgent' : undefined}
        />
      </div>

      {/* Row 2 — 3 tiles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <Tile
          label="Academic mean score"
          value={s.meanScore != null ? `${s.meanScore} / ${s.bomTarget}` : `— / ${s.bomTarget}`}
          sub={`BOM target: ${s.bomTarget}`}
          borderColor="#8b5cf6"
          valueColor={s.meanScore != null && s.meanScore >= s.bomTarget ? '#16a34a' : '#111827'}
        />
        <Tile
          label="Open discipline cases"
          value={s.openDiscipline}
          sub={`${s.activeSuspensions} active suspension${s.activeSuspensions !== 1 ? 's' : ''}`}
          borderColor="#f59e0b"
          valueColor={s.openDiscipline > 0 ? '#d97706' : '#111827'}
        />
        <Tile
          label="Maintenance issues"
          value={s.maintenanceIssues}
          sub="Pending LPOs"
          borderColor="#64748b"
        />
      </div>

      {/* Term countdown */}
      {s.daysRemaining != null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#f8fafc', border: '1px solid #e2e8f0',
          borderRadius: 10, padding: '8px 14px',
        }}>
          <span style={{ fontSize: 16 }}>📅</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Term closes in <strong style={{ color: '#1e293b' }}>{s.daysRemaining} days</strong>
          </span>
        </div>
      )}
    </div>
  )
}
