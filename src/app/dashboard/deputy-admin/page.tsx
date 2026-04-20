'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface SharedStats {
  students: number
  staff: number
  todayLessons: number
  recentActivity: { id: string; type: string; title: string; created_at: string }[]
  pendingProposals: number
}

interface DisciplineRow {
  id: string
  student_id: string
  class_name: string
  severity: string
  offence_type: string
  logged_by_teacher_id: string
  created_at: string
}

interface StaffRow {
  id: string
  full_name: string
  department: string | null
  sub_role: string
}

interface DutyRow {
  id: string
  teacher_id: string
  duty_date: string
  duty_slot: string
  duty_type: string
  tod_score: number
  notes: string | null
}

interface LeaveRow {
  id: string
  teacher_id: string
  leave_type: string
  start_date: string
  end_date: string
  days_requested: number
  reason: string | null
  status: string
  timetable_impact: Record<string, unknown> | null
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
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: variant === 'secondary'
          ? hover ? '#f3f4f6' : '#fff'
          : hover ? 'linear-gradient(135deg,#b45309,#92400e)' : 'linear-gradient(135deg,#d97706,#b45309)',
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

const severityColor = (s: string): 'red' | 'amber' | 'gray' =>
  s === 'high' || s === 'severe' ? 'red' : s === 'medium' ? 'amber' : 'gray'

// ── Main page ──────────────────────────────────────────────────────────────

export default function DeputyAdminPage() {
  const [stats, setStats]             = useState<SharedStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const [discipline, setDiscipline]   = useState<DisciplineRow[]>([])
  const [discLoading, setDiscLoading] = useState(true)

  const [staff, setStaff]             = useState<StaffRow[]>([])
  const [duties, setDuties]           = useState<DutyRow[]>([])
  const [dutyLoading, setDutyLoading] = useState(true)

  const [leaves, setLeaves]           = useState<LeaveRow[]>([])
  const [leaveLoading, setLeaveLoading] = useState(true)

  const [proposals, setProposals]     = useState<Proposal[]>([])
  const [proposalLoading, setProposalLoading] = useState(true)

  // Assign duty modal
  const [showDutyModal, setShowDutyModal] = useState(false)
  const [dutyTeacher, setDutyTeacher] = useState('')
  const [dutyDate, setDutyDate]       = useState('')
  const [dutySlot, setDutySlot]       = useState('morning')
  const [dutyType, setDutyType]       = useState('tod')
  const [dutyBusy, setDutyBusy]       = useState(false)

  // Domain modal
  const [showDomainModal, setShowDomainModal] = useState(false)
  const [domainText, setDomainText]   = useState('')
  const [domainBusy, setDomainBusy]   = useState(false)

  const getSchoolId = useCallback(async (): Promise<string | null> => {
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase.from('staff_records').select('school_id').eq('user_id', user.id).single()
    return (data as { school_id: string } | null)?.school_id ?? null
  }, [])

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    const res = await fetch('/api/deputy/shared-stats')
    if (res.ok) setStats(await res.json())
    setStatsLoading(false)
  }, [])

  const fetchDiscipline = useCallback(async () => {
    setDiscLoading(true)
    const schoolId = await getSchoolId()
    if (!schoolId) { setDiscLoading(false); return }
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from('discipline_records')
      .select('id,student_id,class_name,severity,offence_type,logged_by_teacher_id,created_at')
      .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(10)
    setDiscipline((data ?? []) as DisciplineRow[])
    setDiscLoading(false)
  }, [getSchoolId])

  const fetchDuties = useCallback(async () => {
    setDutyLoading(true)
    const schoolId = await getSchoolId()
    if (!schoolId) { setDutyLoading(false); return }
    const supabase = getSupabaseClient()
    const today = new Date().toISOString().slice(0, 10)
    const next7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const [staffRes, dutyRes] = await Promise.all([
      supabase.from('staff_records').select('id,full_name,department,sub_role').eq('school_id', schoolId).eq('is_active', true),
      supabase.from('duty_rota').select('id,teacher_id,duty_date,duty_slot,duty_type,tod_score,notes')
        .eq('school_id', schoolId).gte('duty_date', today).lte('duty_date', next7)
        .order('duty_date', { ascending: true }),
    ])
    setStaff((staffRes.data ?? []) as StaffRow[])
    setDuties((dutyRes.data ?? []) as DutyRow[])
    setDutyLoading(false)
  }, [getSchoolId])

  const fetchLeaves = useCallback(async () => {
    setLeaveLoading(true)
    const schoolId = await getSchoolId()
    if (!schoolId) { setLeaveLoading(false); return }
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from('leave_requests')
      .select('id,teacher_id,leave_type,start_date,end_date,days_requested,reason,status,timetable_impact')
      .eq('school_id', schoolId).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(15)
    setLeaves((data ?? []) as LeaveRow[])
    setLeaveLoading(false)
  }, [getSchoolId])

  const fetchProposals = useCallback(async () => {
    setProposalLoading(true)
    const res = await fetch('/api/deputy/domain-proposals?status=pending')
    if (res.ok) { const j = await res.json(); setProposals(j.proposals ?? []) }
    setProposalLoading(false)
  }, [])

  useEffect(() => {
    fetchStats()
    fetchDiscipline()
    fetchDuties()
    fetchLeaves()
    fetchProposals()
  }, [fetchStats, fetchDiscipline, fetchDuties, fetchLeaves, fetchProposals])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleLeaveAction = async (id: string, status: 'approved' | 'declined') => {
    const schoolId = await getSchoolId()
    if (!schoolId) return
    const supabase = getSupabaseClient()
    await supabase.from('leave_requests').update({ status, reviewed_at: new Date().toISOString() }).eq('id', id).eq('school_id', schoolId)
    fetchLeaves()
  }

  const handleAssignDuty = async () => {
    if (!dutyTeacher || !dutyDate) return
    setDutyBusy(true)
    const schoolId = await getSchoolId()
    if (!schoolId) { setDutyBusy(false); return }
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('duty_rota').insert({
      school_id: schoolId,
      teacher_id: dutyTeacher,
      duty_date: dutyDate,
      duty_slot: dutySlot,
      duty_type: dutyType,
      assigned_by: user?.id,
    })
    setDutyBusy(false)
    setShowDutyModal(false)
    setDutyTeacher('')
    setDutyDate('')
    fetchDuties()
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
      body: JSON.stringify({ target_domain: 'academic', action_type: domainText.trim(), payload: {} }),
    })
    setDomainBusy(false)
    setShowDomainModal(false)
    setDomainText('')
  }

  // Quick stats
  const discThisWeek = discipline.filter(d => {
    const days = (Date.now() - new Date(d.created_at).getTime()) / 86400000
    return days <= 7
  })
  const severityCounts = { high: 0, medium: 0, low: 0 }
  for (const d of discThisWeek) {
    const k = (d.severity === 'severe' || d.severity === 'high') ? 'high' : d.severity === 'medium' ? 'medium' : 'low'
    severityCounts[k]++
  }

  const staffMap = Object.fromEntries(staff.map(s => [s.id, s.full_name]))
  const activityIcon: Record<string, string> = { discipline: '⚠️', lesson: '📚', leave: '🏖️', proposal: '📋' }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui,sans-serif' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', marginBottom: 4 }}>Deputy Admin Dashboard</h1>
      <p style={{ color: '#6b7280', marginBottom: 32, fontSize: 14 }}>
        {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      {/* Situational Panel */}
      <Section title="Situational Overview">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          {statsLoading
            ? [0,1,2,3].map(i => <div key={i} style={{ flex: 1, minWidth: 140, height: 80, borderRadius: 12, background: '#f3f4f6' }} />)
            : (
              <>
                <StatCard label="Students" value={stats?.students ?? 0} />
                <StatCard label="Active Staff" value={stats?.staff ?? 0} />
                <StatCard label="Lessons Today" value={stats?.todayLessons ?? 0} />
                <StatCard label="Pending Proposals" value={stats?.pendingProposals ?? 0} sub="cross-domain" />
              </>
            )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>Recent Activity</div>
        {statsLoading ? <Shimmer h={120} /> : (stats?.recentActivity ?? []).map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 16 }}>{activityIcon[a.type] ?? '•'}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{a.title}</span>
            <Badge label={a.type} color={a.type === 'discipline' ? 'red' : a.type === 'leave' ? 'amber' : 'blue'} />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>
              {new Date(a.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </Section>

      {/* Quick Stats */}
      <Section title="Quick Stats — This Week">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <StatCard label="High Severity" value={severityCounts.high} sub="discipline cases" />
          <StatCard label="Medium Severity" value={severityCounts.medium} sub="discipline cases" />
          <StatCard label="Pending Leaves" value={leaves.length} sub="awaiting review" />
          <StatCard label="Duties Assigned" value={duties.length} sub="next 7 days" />
        </div>
      </Section>

      {/* Discipline Records */}
      <Section title="Discipline Records — Recent 10">
        <div style={{ marginBottom: 12 }}>
          <Btn onClick={() => alert('Navigate to /dashboard/discipline')} variant="secondary">View All Incidents</Btn>
        </div>
        {discLoading ? <Shimmer h={100} /> : discipline.length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No discipline records.</p>
          : discipline.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{d.offence_type}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{d.class_name} · {new Date(d.created_at).toLocaleDateString('en-GB')}</div>
              </div>
              <Badge label={d.severity} color={severityColor(d.severity)} />
            </div>
          ))
        }
      </Section>

      {/* Duty Rota */}
      <Section title="Duty Rota — Next 7 Days">
        <div style={{ marginBottom: 12 }}>
          <Btn onClick={() => setShowDutyModal(true)}>+ Assign Duty</Btn>
        </div>
        {dutyLoading ? <Shimmer h={100} /> : duties.length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No duties assigned this week.</p>
          : duties.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{staffMap[d.teacher_id] ?? d.teacher_id.slice(0,8)}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{d.duty_date} · {d.duty_slot} · {d.duty_type}</div>
                {d.notes && <div style={{ fontSize: 11, color: '#9ca3af' }}>{d.notes}</div>}
              </div>
              <Badge label={`ToD: ${d.tod_score}`} color="blue" />
            </div>
          ))
        }
      </Section>

      {/* Leave Management */}
      <Section title="Leave Requests — Pending">
        {leaveLoading ? <Shimmer h={100} /> : leaves.length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No pending leave requests.</p>
          : leaves.map(l => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {staffMap[l.teacher_id] ?? l.teacher_id.slice(0,8)} — {l.leave_type}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {l.start_date} → {l.end_date} ({l.days_requested} days)
                </div>
                {l.reason && <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>{l.reason}</div>}
                {l.timetable_impact && (
                  <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
                    ⚠ Timetable impact: {JSON.stringify(l.timetable_impact).slice(0, 80)}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Btn onClick={() => handleLeaveAction(l.id, 'approved')}>Approve</Btn>
                <Btn variant="secondary" onClick={() => handleLeaveAction(l.id, 'declined')}>Decline</Btn>
              </div>
            </div>
          ))
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
                <div style={{ fontSize: 12, color: '#6b7280' }}>{new Date(p.created_at).toLocaleDateString('en-GB')}</div>
              </div>
              <Btn onClick={() => handleProposalAction(p.id, 'approved')}>Approve</Btn>
              <Btn variant="secondary" onClick={() => handleProposalAction(p.id, 'declined')}>Decline</Btn>
            </div>
          ))
        }
      </Section>

      <div style={{ textAlign: 'center', paddingBottom: 32 }}>
        <Btn variant="secondary" onClick={() => setShowDomainModal(true)}>
          📋 Request Change to Academic Domain
        </Btn>
      </div>

      {/* Assign Duty Modal */}
      {showDutyModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 440, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, marginTop: 0 }}>Assign Duty</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <select value={dutyTeacher} onChange={e => setDutyTeacher(e.target.value)}
                style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                <option value="">Select teacher…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <input type="date" value={dutyDate} onChange={e => setDutyDate(e.target.value)}
                style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13 }} />
              <select value={dutySlot} onChange={e => setDutySlot(e.target.value)}
                style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                {['morning','afternoon','evening','full_day'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={dutyType} onChange={e => setDutyType(e.target.value)}
                style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                {['tod','gate','dining','games'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <Btn variant="secondary" onClick={() => setShowDutyModal(false)}>Cancel</Btn>
              <Btn onClick={handleAssignDuty} disabled={dutyBusy || !dutyTeacher || !dutyDate}>
                {dutyBusy ? 'Assigning…' : 'Assign'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Domain Modal */}
      {showDomainModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 440, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, marginTop: 0 }}>Request Change to Academic Domain</h3>
            <textarea
              value={domainText} onChange={e => setDomainText(e.target.value)}
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
