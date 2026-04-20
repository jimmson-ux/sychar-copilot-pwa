'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface SharedStats {
  students: number
  staff: number
  todayLessons: number
  recentActivity: { id: string; type: string; title: string; created_at: string }[]
  pendingProposals: number
}

interface TimetableJob {
  id: string
  status: 'queued' | 'running' | 'complete' | 'failed'
  progress: number
  result_summary: {
    overallScore: number
    cogOptimizationPct: number
    totalLessons: number
    warnings: string[]
  } | null
  error_message: string | null
  created_at: string
}

interface SchemeRow {
  id: string
  teacher_id: string
  subject_name: string
  class_name: string
  status: string
  hod_comment: string | null
}

interface ComplianceRow {
  teacher_id: string
  compliance_score: number
  scheme_submitted: boolean
  lesson_plan_submitted: boolean
  record_of_work_current: boolean
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

interface Proposal {
  id: string
  target_domain: string
  action_type: string
  status: string
  created_at: string
}

// ── UI primitives ──────────────────────────────────────────────────────────

function Shimmer({ h = 60 }: { h?: number }) {
  return (
    <div style={{
      height: h, borderRadius: 8, marginBottom: 8,
      background: 'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
    }} />
  )
}

function Badge({ label, color }: { label: string; color: 'green' | 'amber' | 'red' | 'blue' | 'gray' }) {
  const styles: Record<string, React.CSSProperties> = {
    green: { background: '#d1fae5', color: '#065f46' },
    amber: { background: '#fef3c7', color: '#92400e' },
    red:   { background: '#fee2e2', color: '#991b1b' },
    blue:  { background: '#dbeafe', color: '#1e40af' },
    gray:  { background: '#f3f4f6', color: '#374151' },
  }
  return (
    <span style={{ ...styles[color], padding: '2px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#111827' }}>{value}</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Btn({ onClick, disabled, children, variant = 'primary' }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode; variant?: 'primary' | 'secondary'
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: variant === 'secondary'
          ? hover ? '#f3f4f6' : '#fff'
          : hover ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
        color: variant === 'secondary' ? '#374151' : '#fff',
        border: variant === 'secondary' ? '1px solid #d1d5db' : 'none',
        borderRadius: 8, padding: '8px 18px', fontSize: 14, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
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

// ── Main page ──────────────────────────────────────────────────────────────

export default function DeputyAcademicPage() {
  const [stats, setStats]             = useState<SharedStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const [term, setTerm]               = useState(1)
  const [year, setYear]               = useState(new Date().getFullYear().toString())
  const [wC, setWC]                   = useState(1.0)
  const [wP, setWP]                   = useState(1.0)
  const [wT, setWT]                   = useState(1.0)
  const [generating, setGenerating]   = useState(false)
  const [activeJob, setActiveJob]     = useState<TimetableJob | null>(null)
  const [latestJob, setLatestJob]     = useState<TimetableJob | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [schemes, setSchemes]         = useState<SchemeRow[]>([])
  const [schemesLoading, setSchemesLoading] = useState(true)

  const [invig, setInvig]             = useState<InvigRow[]>([])
  const [invigLoading, setInvigLoading] = useState(true)

  const [compliance, setCompliance]   = useState<ComplianceRow[]>([])
  const [compLoading, setCompLoading] = useState(true)

  const [proposals, setProposals]     = useState<Proposal[]>([])
  const [proposalLoading, setProposalLoading] = useState(true)

  const [showDomainModal, setShowDomainModal] = useState(false)
  const [domainText, setDomainText]   = useState('')
  const [domainBusy, setDomainBusy]   = useState(false)

  // ── fetchers ─────────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    const res = await fetch('/api/deputy/shared-stats')
    if (res.ok) setStats(await res.json())
    setStatsLoading(false)
  }, [])

  const getSchoolId = useCallback(async (): Promise<string | null> => {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase.from('staff_records').select('school_id').eq('user_id', user.id).single()
    return (data as { school_id: string } | null)?.school_id ?? null
  }, [])

  const fetchSchemes = useCallback(async () => {
    setSchemesLoading(true)
    const schoolId = await getSchoolId()
    if (!schoolId) { setSchemesLoading(false); return }
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from('schemes_of_work_new')
      .select('id,teacher_id,subject_name,class_name,status,hod_comment')
      .eq('school_id', schoolId).eq('status', 'submitted')
      .order('created_at', { ascending: false }).limit(20)
    setSchemes((data ?? []) as SchemeRow[])
    setSchemesLoading(false)
  }, [getSchoolId])

  const fetchInvig = useCallback(async () => {
    setInvigLoading(true)
    const schoolId = await getSchoolId()
    if (!schoolId) { setInvigLoading(false); return }
    const supabase = getSupabaseClient()
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('invigilation_chart')
      .select('id,exam_name,exam_date,session,subject_name,venue,is_confirmed')
      .eq('school_id', schoolId).gte('exam_date', today)
      .order('exam_date', { ascending: true }).limit(10)
    setInvig((data ?? []) as InvigRow[])
    setInvigLoading(false)
  }, [getSchoolId])

  const fetchCompliance = useCallback(async () => {
    setCompLoading(true)
    const schoolId = await getSchoolId()
    if (!schoolId) { setCompLoading(false); return }
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from('document_compliance')
      .select('teacher_id,compliance_score,scheme_submitted,lesson_plan_submitted,record_of_work_current')
      .eq('school_id', schoolId).order('compliance_score', { ascending: true }).limit(20)
    setCompliance((data ?? []) as ComplianceRow[])
    setCompLoading(false)
  }, [getSchoolId])

  const fetchProposals = useCallback(async () => {
    setProposalLoading(true)
    const res = await fetch('/api/deputy/domain-proposals?status=pending')
    if (res.ok) { const j = await res.json(); setProposals(j.proposals ?? []) }
    setProposalLoading(false)
  }, [])

  const fetchLatestJob = useCallback(async () => {
    const schoolId = await getSchoolId()
    if (!schoolId) return
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from('timetable_jobs')
      .select('id,status,progress,result_summary,error_message,created_at')
      .eq('school_id', schoolId).eq('status', 'complete')
      .order('created_at', { ascending: false }).limit(1)
    if (data && data.length > 0) setLatestJob(data[0] as TimetableJob)
  }, [getSchoolId])

  useEffect(() => {
    fetchStats()
    fetchSchemes()
    fetchInvig()
    fetchCompliance()
    fetchProposals()
    fetchLatestJob()
  }, [fetchStats, fetchSchemes, fetchInvig, fetchCompliance, fetchProposals, fetchLatestJob])

  // Poll active job
  useEffect(() => {
    if (!activeJob || (activeJob.status !== 'queued' && activeJob.status !== 'running')) return
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/timetable/status/${activeJob.id}`)
      if (!res.ok) return
      const { job } = await res.json()
      setActiveJob(job as TimetableJob)
      if (job.status === 'complete' || job.status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current)
        setGenerating(false)
        if (job.status === 'complete') { setLatestJob(job); fetchStats() }
      }
    }, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeJob?.id, activeJob?.status, fetchStats]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── actions ───────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setGenerating(true)
    const res = await fetch('/api/timetable/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term, academicYear: year, classes: [], weights: { W_c: wC, W_p: wP, W_t: wT } }),
    })
    if (res.ok) {
      const { jobId } = await res.json()
      setActiveJob({ id: jobId, status: 'queued', progress: 0, result_summary: null, error_message: null, created_at: new Date().toISOString() })
    } else {
      setGenerating(false)
      alert('Failed to start job')
    }
  }

  const handleSchemeAction = async (id: string, status: 'approved' | 'rejected') => {
    const schoolId = await getSchoolId()
    if (!schoolId) return
    const supabase = getSupabaseClient()
    await supabase.from('schemes_of_work_new').update({ status }).eq('id', id).eq('school_id', schoolId)
    fetchSchemes()
  }

  const handleProposalAction = async (id: string, status: 'approved' | 'declined') => {
    await fetch(`/api/deputy/domain-proposals?id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchProposals()
  }

  const handleDomainRequest = async () => {
    if (!domainText.trim()) return
    setDomainBusy(true)
    await fetch('/api/deputy/domain-proposals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_domain: 'admin', action_type: domainText.trim(), payload: {} }),
    })
    setDomainBusy(false)
    setShowDomainModal(false)
    setDomainText('')
  }

  const activityIcon: Record<string, string> = { discipline: '⚠️', lesson: '📚', leave: '🏖️', proposal: '📋' }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui,sans-serif' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Deputy Academic Dashboard</h1>
      <p style={{ color: '#6b7280', marginBottom: 32, fontSize: 14 }}>
        {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      {/* Situational Panel */}
      <Section title="Situational Overview">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          {statsLoading ? [0,1,2,3].map(i => <div key={i} style={{ flex: 1, minWidth: 140, height: 80, borderRadius: 12, background: '#f3f4f6' }} />) : (
            <>
              <StatCard label="Students" value={stats?.students ?? 0} />
              <StatCard label="Active Staff" value={stats?.staff ?? 0} />
              <StatCard label="Lessons Today" value={stats?.todayLessons ?? 0} sub="records of work filed" />
              <StatCard label="Pending Proposals" value={stats?.pendingProposals ?? 0} sub="cross-domain" />
            </>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>Recent Activity</div>
        {statsLoading ? <Shimmer h={120} /> : (stats?.recentActivity ?? []).map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 16 }}>{activityIcon[a.type] ?? '•'}</span>
            <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{a.title}</span>
            <Badge label={a.type} color={a.type === 'discipline' ? 'red' : a.type === 'leave' ? 'amber' : 'blue'} />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>
              {new Date(a.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </Section>

      {/* Timetable Management */}
      <Section title="Timetable Management">
        {latestJob?.result_summary && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#065f46' }}>
              Latest Score: {latestJob.result_summary.overallScore.toLocaleString()} &nbsp;·&nbsp;
              Cog opt: {latestJob.result_summary.cogOptimizationPct}% &nbsp;·&nbsp;
              {latestJob.result_summary.totalLessons} lessons
            </div>
            {latestJob.result_summary.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>⚠ {w}</div>
            ))}
          </div>
        )}

        {/* Weight sliders */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
          {([['Cognitive (W_c)', wC, setWC], ['Period Spread (W_p)', wP, setWP], ['Teacher Reliability (W_t)', wT, setWT]] as [string, number, (v: number) => void][]).map(([lbl, val, set]) => (
            <div key={lbl}>
              <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{lbl}: {val.toFixed(1)}</label>
              <input type="range" min={0.5} max={2.0} step={0.1} value={val}
                onChange={e => set(parseFloat(e.target.value))} style={{ width: '100%', marginTop: 4 }} />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>Term</label>
          <select value={term} onChange={e => setTerm(Number(e.target.value))}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}>
            {[1,2,3].map(t => <option key={t} value={t}>Term {t}</option>)}
          </select>
          <label style={{ fontSize: 13, color: '#6b7280' }}>Year</label>
          <input type="text" value={year} onChange={e => setYear(e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 13, width: 80 }} />
          <Btn onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating…' : '⚡ Generate New Timetable'}
          </Btn>
          <a href="/dashboard/timetable" style={{ fontSize: 13, color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
            View Timetable →
          </a>
        </div>

        {activeJob && (activeJob.status === 'queued' || activeJob.status === 'running') && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>
              {activeJob.status === 'queued' ? 'Queued…' : `Running GA — ${activeJob.progress}%`}
            </div>
            <div style={{ background: '#e5e7eb', borderRadius: 9999, height: 8 }}>
              <div style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', height: 8, borderRadius: 9999,
                width: `${activeJob.progress}%`, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}
        {activeJob?.status === 'complete' && (
          <div style={{ marginTop: 16, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontWeight: 600, color: '#1e40af', fontSize: 13 }}>Generation complete!</div>
            <div style={{ fontSize: 12, color: '#1d4ed8', marginTop: 4 }}>
              Score: {activeJob.result_summary?.overallScore?.toLocaleString()} &nbsp;·&nbsp;
              Cog opt: {activeJob.result_summary?.cogOptimizationPct}%
            </div>
          </div>
        )}
        {activeJob?.status === 'failed' && (
          <div style={{ marginTop: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontWeight: 600, color: '#dc2626', fontSize: 13 }}>Generation failed</div>
            <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{activeJob.error_message}</div>
          </div>
        )}
      </Section>

      {/* Schemes of Work */}
      <Section title="Schemes of Work — Pending Approval">
        {schemesLoading ? <Shimmer h={80} /> : schemes.length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No schemes awaiting approval.</p>
          : schemes.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.subject_name} — {s.class_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Teacher: {s.teacher_id.slice(0,8)}…</div>
              </div>
              <Badge label="Submitted" color="amber" />
              <Btn onClick={() => handleSchemeAction(s.id, 'approved')}>Approve</Btn>
              <Btn variant="secondary" onClick={() => handleSchemeAction(s.id, 'rejected')}>Reject</Btn>
            </div>
          ))
        }
      </Section>

      {/* Invigilation Planner */}
      <Section title="Invigilation Planner">
        {invigLoading ? <Shimmer h={80} /> : invig.length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No upcoming exams.</p>
          : invig.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{e.exam_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{e.exam_date} · {e.session} · {e.subject_name} · {e.venue}</div>
              </div>
              <Badge label={e.is_confirmed ? 'Confirmed' : 'Unconfirmed'} color={e.is_confirmed ? 'green' : 'amber'} />
            </div>
          ))
        }
      </Section>

      {/* Academic Compliance */}
      <Section title="Academic Compliance — Lowest First">
        {compLoading ? <Shimmer h={80} /> : compliance.length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No compliance data.</p>
          : compliance.map((c, i) => {
            const pct = Math.round(c.compliance_score)
            const col = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
            const badge = pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Teacher: {c.teacher_id.slice(0,8)}…</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {c.scheme_submitted && <Badge label="Scheme ✓" color="green" />}
                    {c.lesson_plan_submitted && <Badge label="Plan ✓" color="green" />}
                    {c.record_of_work_current && <Badge label="ROW ✓" color="green" />}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Badge label={`${pct}%`} color={badge as 'green' | 'amber' | 'red'} />
                  <div style={{ background: '#e5e7eb', borderRadius: 9999, height: 4, width: 80, marginTop: 4 }}>
                    <div style={{ height: 4, borderRadius: 9999, width: `${pct}%`, background: col, transition: 'width 0.3s' }} />
                  </div>
                </div>
              </div>
            )
          })
        }
      </Section>

      {/* Domain Proposals */}
      <Section title="Pending Domain Proposals">
        {proposalLoading ? <Shimmer h={60} /> : proposals.length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No pending proposals.</p>
          : proposals.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.action_type}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  To: {p.target_domain} domain · {new Date(p.created_at).toLocaleDateString('en-GB')}
                </div>
              </div>
              <Btn onClick={() => handleProposalAction(p.id, 'approved')}>Approve</Btn>
              <Btn variant="secondary" onClick={() => handleProposalAction(p.id, 'declined')}>Decline</Btn>
            </div>
          ))
        }
      </Section>

      <div style={{ textAlign: 'center', paddingBottom: 32 }}>
        <Btn variant="secondary" onClick={() => setShowDomainModal(true)}>
          📋 Request Change to Admin Domain
        </Btn>
      </div>

      {/* Domain Modal */}
      {showDomainModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 440, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, marginTop: 0 }}>Request Change to Admin Domain</h3>
            <textarea
              value={domainText}
              onChange={e => setDomainText(e.target.value)}
              placeholder="Describe the change you are requesting…"
              style={{ width: '100%', minHeight: 100, border: '1px solid #d1d5db', borderRadius: 8, padding: 10, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <Btn variant="secondary" onClick={() => setShowDomainModal(false)}>Cancel</Btn>
              <Btn onClick={handleDomainRequest} disabled={domainBusy || !domainText.trim()}>
                {domainBusy ? 'Sending…' : 'Send Request'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
