'use client'

interface TeacherRecord {
  id: string
  full_name: string
  subject_specialization?: string | null
  department?: string | null
  document_compliance?: {
    compliance_score?: number
    scheme_submitted?: boolean
    lesson_plan_submitted?: boolean
    record_of_work_current?: boolean
    term?: number
    academic_year?: string
  }[] | null
  // from lesson_sessions aggregate if available
  punctuality?: {
    on_time: number
    slightly_late: number
    late: number
    very_late: number
    missed: number
    total: number
    avg_delay_minutes: number
    trend: 'improving' | 'declining' | 'stable'
  }
}

interface Props {
  teacher: TeacherRecord
}

function ScoreDot({ score }: { score: number }) {
  const color = score >= 85 ? '#16a34a' : score >= 70 ? '#d97706' : '#dc2626'
  const emoji = score >= 85 ? '🟢' : score >= 70 ? '🟡' : '🔴'
  const filled = Math.round(score / 10)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: 1 }}>
        {'█'.repeat(filled)}<span style={{ color: '#e5e7eb' }}>{'░'.repeat(10 - filled)}</span>
      </span>
      <span style={{ color, fontWeight: 700, fontSize: 14 }}>{score}%</span>
      <span>{emoji}</span>
    </span>
  )
}

function pct(n: number, t: number) {
  if (!t) return '0%'
  return `${Math.round(n * 100 / t)}%`
}

export default function TeacherComplianceCard({ teacher }: Props) {
  const comp  = teacher.document_compliance?.[0]
  const score = comp?.compliance_score ?? 0
  const p     = teacher.punctuality

  return (
    <div style={{
      background: 'white', borderRadius: 14, padding: '18px 20px',
      border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 2 }}>{teacher.full_name}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
        {teacher.department ?? teacher.subject_specialization ?? 'Teacher'}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#374151', fontWeight: 600, marginBottom: 4 }}>Compliance Score</div>
        <ScoreDot score={score} />
      </div>

      {p && (
        <>
          <div style={{ fontSize: 12, color: '#374151', fontWeight: 600, marginBottom: 6 }}>This term:</div>
          <div style={{ display: 'grid', rowGap: 2, fontSize: 12, color: '#374151', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#16a34a' }}>On time:</span>
              <span>{p.on_time}/{p.total} lessons ({pct(p.on_time, p.total)})</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#d97706' }}>Late (2–5 min):</span>
              <span>{p.slightly_late}/{p.total} ({pct(p.slightly_late, p.total)})</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#dc2626' }}>Late (5+ min):</span>
              <span>{p.late + p.very_late}/{p.total} ({pct(p.late + p.very_late, p.total)})</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#9ca3af' }}>Missed:</span>
              <span>{p.missed}</span>
            </div>
          </div>
          {p.avg_delay_minutes > 0 && (
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
              Avg delay when late: <strong>{p.avg_delay_minutes} minutes</strong>
            </div>
          )}
          <div style={{ fontSize: 12, color: p.trend === 'improving' ? '#16a34a' : p.trend === 'declining' ? '#dc2626' : '#6b7280', fontWeight: 600 }}>
            Compliance trend: {p.trend === 'improving' ? '↑ improving' : p.trend === 'declining' ? '↓ declining' : '→ stable'}
          </div>
        </>
      )}
    </div>
  )
}
