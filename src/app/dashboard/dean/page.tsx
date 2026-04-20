'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

interface VelocityRow {
  teacherId: string
  teacherName: string
  department: string | null
  taughtLessons: number
  expectedLessons: number
  velocityPct: number
  status: 'green' | 'amber' | 'red'
}

interface SchemeRow {
  id: string
  teacher_id: string
  subject_name: string
  class_name: string
  status: string
  hod_comment: string | null
  approved_at: string | null
  created_at: string
}

interface ComplianceRow {
  teacher_id: string
  compliance_score: number
  scheme_submitted: boolean
  lesson_plan_submitted: boolean
  record_of_work_current: boolean
}

interface KcsePrediction {
  subject: string
  averageScore: number
  studentCount: number
}

interface InvigRow {
  id: string
  exam_name: string
  exam_date: string
  session: string
  subject_name: string
  venue: string
  is_confirmed: boolean
}

interface InvigSuggestion {
  staffId: string
  fullName: string
  department: string | null
  weekLoad: number
  daysSinceLastInvig: number
  reliabilityIndex: number
  score: number
  reasons: string[]
}

interface OverviewData {
  currentTerm: string
  currentYear: string
  syllabusVelocity: VelocityRow[]
  submittedSchemes: SchemeRow[]
  complianceScores: ComplianceRow[]
  kcsePredictions: KcsePrediction[]
  upcomingExams: InvigRow[]
}

// ── UI helpers ─────────────────────────────────────────────────────────────

function Shimmer({ h = 60 }: { h?: number }) {
  return (
    <div style={{
      height: h, borderRadius: 8, marginBottom: 8,
      background: 'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)',
      backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite',
    }} />
  )
}

function Badge({ label, color }: { label: string; color: 'green' | 'amber' | 'red' | 'blue' | 'gray' }) {
  const s: Record<string, React.CSSProperties> = {
    green: { background: '#d1fae5', color: '#065f46' },
    amber: { background: '#fef3c7', color: '#92400e' },
    red:   { background: '#fee2e2', color: '#991b1b' },
    blue:  { background: '#dbeafe', color: '#1e40af' },
    gray:  { background: '#f3f4f6', color: '#374151' },
  }
  return (
    <span style={{ ...s[color], padding: '2px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function Btn({ onClick, disabled, children, variant = 'primary' }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode; variant?: 'primary' | 'secondary'
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: variant === 'secondary'
          ? hover ? '#f3f4f6' : '#fff'
          : hover ? 'linear-gradient(135deg,#0f766e,#0e7490)' : 'linear-gradient(135deg,#14b8a6,#0891b2)',
        color: variant === 'secondary' ? '#374151' : '#fff',
        border: variant === 'secondary' ? '1px solid #d1d5db' : 'none',
        borderRadius: 8, padding: '8px 18px', fontSize: 14, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'all 0.15s',
      }}
    >{children}</button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 16 }}>{title}</h2>
      {children}
    </section>
  )
}

function timeGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function DeanDashboardPage() {
  const [overview, setOverview]       = useState<OverviewData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)

  // Invigilation assistant
  const [invigDate, setInvigDate]     = useState('')
  const [invigSubject, setInvigSubject] = useState('')
  const [invigSession, setInvigSession] = useState('morning')
  const [suggestions, setSuggestions] = useState<InvigSuggestion[]>([])
  const [sugLoading, setSugLoading]   = useState(false)
  const [assigning, setAssigning]     = useState<string | null>(null)

  // Scheme action
  const [schemeActionBusy, setSchemeActionBusy] = useState<string | null>(null)

  const fetchOverview = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/dean/academic-overview')
    if (res.ok) {
      setOverview(await res.json())
    } else {
      setError('Failed to load academic overview')
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchOverview() }, [fetchOverview])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleGetSuggestions = async () => {
    if (!invigDate || !invigSubject || !invigSession) return
    setSugLoading(true)
    const res = await fetch(`/api/dean/invigilation-suggestions?date=${invigDate}&subject=${encodeURIComponent(invigSubject)}&session=${invigSession}`)
    if (res.ok) { const j = await res.json(); setSuggestions(j.suggestions ?? []) }
    setSugLoading(false)
  }

  const handleAssignInvig = async (staffId: string) => {
    if (!invigDate || !invigSubject || !invigSession) return
    setAssigning(staffId)
    const { getSupabaseClient } = await import('@/lib/supabase')
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAssigning(null); return }
    const { data: staffRow } = await supabase.from('staff_records').select('school_id').eq('user_id', user.id).single()
    const schoolId = (staffRow as { school_id: string } | null)?.school_id
    if (!schoolId) { setAssigning(null); return }
    await supabase.from('invigilation_chart').insert({
      school_id: schoolId,
      exam_name: invigSubject + ' Exam',
      exam_date: invigDate,
      session: invigSession,
      subject_name: invigSubject,
      invigilator_id: staffId,
      is_confirmed: false,
    })
    // Log SMS notification (stub — just console for now)
    console.info(`[SMS] Invigilator ${staffId} notified for ${invigSubject} on ${invigDate}`)
    setAssigning(null)
    setSuggestions(prev => prev.filter(s => s.staffId !== staffId))
    fetchOverview()
  }

  const handleSchemeAction = async (schemeId: string, status: 'approved' | 'rejected', comment?: string) => {
    setSchemeActionBusy(schemeId)
    const { getSupabaseClient } = await import('@/lib/supabase')
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('schemes_of_work_new').update({
      status,
      hod_comment: comment ?? null,
      approved_by: status === 'approved' ? user?.id : null,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
    }).eq('id', schemeId)
    setSchemeActionBusy(null)
    fetchOverview()
  }

  // Group upcoming exams by exam_name
  const examGroups: Record<string, InvigRow[]> = {}
  for (const e of overview?.upcomingExams ?? []) {
    if (!examGroups[e.exam_name]) examGroups[e.exam_name] = []
    examGroups[e.exam_name].push(e)
  }

  // Compliance traffic light counts
  const compGreen  = (overview?.complianceScores ?? []).filter(c => c.compliance_score >= 80).length
  const compAmber  = (overview?.complianceScores ?? []).filter(c => c.compliance_score >= 50 && c.compliance_score < 80).length
  const compRed    = (overview?.complianceScores ?? []).filter(c => c.compliance_score < 50).length

  if (error) return (
    <div style={{ maxWidth: 800, margin: '80px auto', textAlign: 'center', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ color: '#dc2626', fontSize: 16 }}>{error}</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui,sans-serif' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', marginBottom: 4 }}>
          {timeGreeting()}, Dean
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {overview && ` · Term ${overview.currentTerm} · ${overview.currentYear}`}
        </p>
      </div>

      {/* Syllabus Velocity */}
      <Section title="Syllabus Velocity">
        {loading ? <Shimmer h={120} /> : (overview?.syllabusVelocity ?? []).length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No syllabus data available.</p>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    {['Teacher','Department','Taught','Expected','Progress','Status'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overview!.syllabusVelocity.map(v => (
                    <tr key={v.teacherId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{v.teacherName}</td>
                      <td style={{ padding: '10px 12px', color: '#6b7280' }}>{v.department ?? '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{v.taughtLessons}</td>
                      <td style={{ padding: '10px 12px' }}>{v.expectedLessons}</td>
                      <td style={{ padding: '10px 12px', minWidth: 120 }}>
                        <div style={{ background: '#e5e7eb', borderRadius: 9999, height: 8 }}>
                          <div style={{
                            height: 8, borderRadius: 9999,
                            width: `${v.velocityPct}%`,
                            background: v.status === 'green' ? '#10b981' : v.status === 'amber' ? '#f59e0b' : '#ef4444',
                            transition: 'width 0.4s',
                          }} />
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{v.velocityPct}%</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Badge label={v.status === 'green' ? 'On track' : v.status === 'amber' ? 'Behind' : 'At risk'}
                          color={v.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Section>

      {/* Schemes Approval Queue */}
      <Section title="Schemes of Work — Submitted for Approval">
        {loading ? <Shimmer h={80} /> : (overview?.submittedSchemes ?? []).length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No schemes awaiting approval.</p>
          : overview!.submittedSchemes.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.subject_name} — {s.class_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Submitted {new Date(s.created_at).toLocaleDateString('en-GB')}</div>
              </div>
              <Badge label="Submitted" color="amber" />
              <Btn onClick={() => handleSchemeAction(s.id, 'approved')} disabled={schemeActionBusy === s.id}>Approve</Btn>
              <Btn variant="secondary" onClick={() => handleSchemeAction(s.id, 'rejected', 'Returned for revision')} disabled={schemeActionBusy === s.id}>Reject</Btn>
            </div>
          ))
        }
      </Section>

      {/* Exam Schedule */}
      <Section title="Exam Schedule — Upcoming">
        {loading ? <Shimmer h={80} /> : Object.keys(examGroups).length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No upcoming exams.</p>
          : Object.entries(examGroups).map(([examName, rows]) => (
            <div key={examName} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{examName}</div>
              {rows.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0 8px 16px', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ flex: 1, fontSize: 13 }}>{e.subject_name} · {e.session} · {e.venue}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{e.exam_date}</div>
                  <Badge label={e.is_confirmed ? 'Confirmed' : 'Pending'} color={e.is_confirmed ? 'green' : 'amber'} />
                </div>
              ))}
            </div>
          ))
        }
      </Section>

      {/* KCSE Predictions */}
      <Section title="KCSE Predictions — Form 4 Averages">
        {loading ? <Shimmer h={100} /> : (overview?.kcsePredictions ?? []).length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No Form 4 performance data for current term.</p>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
              {overview!.kcsePredictions.map(p => {
                const color = p.averageScore >= 60 ? '#10b981' : p.averageScore >= 40 ? '#f59e0b' : '#ef4444'
                return (
                  <div key={p.subject} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color }}>{p.averageScore}%</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 4 }}>{p.subject}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{p.studentCount} students</div>
                  </div>
                )
              })}
            </div>
          )
        }
      </Section>

      {/* Compliance Overview */}
      <Section title="Document Compliance Overview">
        {loading ? <Shimmer h={60} /> : (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140, background: '#d1fae5', borderRadius: 12, padding: '20px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#065f46' }}>{compGreen}</div>
              <div style={{ fontSize: 13, color: '#047857', marginTop: 4 }}>On Track (≥80%)</div>
            </div>
            <div style={{ flex: 1, minWidth: 140, background: '#fef3c7', borderRadius: 12, padding: '20px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#92400e' }}>{compAmber}</div>
              <div style={{ fontSize: 13, color: '#b45309', marginTop: 4 }}>Needs Attention (50–79%)</div>
            </div>
            <div style={{ flex: 1, minWidth: 140, background: '#fee2e2', borderRadius: 12, padding: '20px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#991b1b' }}>{compRed}</div>
              <div style={{ fontSize: 13, color: '#dc2626', marginTop: 4 }}>At Risk (&lt;50%)</div>
            </div>
          </div>
        )}
      </Section>

      {/* AI Invigilation Assistant */}
      <Section title="AI Invigilation Assistant">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Exam Date</label>
            <input type="date" value={invigDate} onChange={e => setInvigDate(e.target.value)}
              style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Subject</label>
            <input type="text" value={invigSubject} onChange={e => setInvigSubject(e.target.value)}
              placeholder="e.g. Mathematics"
              style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: 200 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Session</label>
            <select value={invigSession} onChange={e => setInvigSession(e.target.value)}
              style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
              {['morning','afternoon','evening'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Btn onClick={handleGetSuggestions} disabled={sugLoading || !invigDate || !invigSubject}>
              {sugLoading ? 'Analysing…' : '🔍 Get Suggestions'}
            </Btn>
          </div>
        </div>

        {sugLoading && <Shimmer h={80} />}

        {!sugLoading && suggestions.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>
              Ranked Suggestions ({suggestions.length})
            </div>
            {suggestions.map((s, i) => (
              <div key={s.staffId} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#14b8a6,#0891b2)', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{s.fullName}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{s.department ?? 'N/A'} · Reliability: {s.reliabilityIndex.toFixed(1)} · Load: {s.weekLoad} lessons/wk</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {s.reasons.map((r, ri) => <Badge key={ri} label={r} color="blue" />)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0891b2' }}>Score: {s.score}</div>
                  <Btn onClick={() => handleAssignInvig(s.staffId)} disabled={assigning === s.staffId}>
                    {assigning === s.staffId ? 'Assigning…' : '+ Assign & Notify'}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}
        {!sugLoading && suggestions.length === 0 && (invigDate || invigSubject) && (
          <p style={{ color: '#9ca3af', fontSize: 13 }}>Enter date, subject, and session then click Get Suggestions.</p>
        )}
      </Section>
    </div>
  )
}
