'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface DutyAssignment {
  id: string
  duty_date: string
  duty_type: string
  time_slot: string | null
  post: string | null
  remarks: string | null
}

interface Appraisal {
  id: string
  duty_date: string
  punctuality: number
  incident_handling: number
  report_quality: number
  student_welfare: number
  overall_rating: string
  duty_notes: string | null
  graded_via: string
  created_at: string
}

interface RecordOfWork {
  id: string
  duty_date: string
  topic: string
  sub_topic: string
  period: number
  classwork_given: boolean
  homework_assigned: boolean
  created_at: string
}

interface TimetableEntry {
  id: string
  day: string
  period: number
  subject: string
  subject_code: string | null
  class_name: string
  room: string | null
}

interface Compliance {
  compliance_score: number
  has_scheme: boolean
  lesson_plans_count: number
  row_count: number
}

interface StaffInfo {
  id: string
  full_name: string
  email: string
  phone: string
  role: string
  department: string
  subject_name: string
  class_name: string
  tsc_number: string
  photo_url: string
}

const RATING_COLOR: Record<string, { bg: string; text: string }> = {
  Excellent:         { bg: '#dcfce7', text: '#16a34a' },
  Good:              { bg: '#dbeafe', text: '#2176FF' },
  Satisfactory:      { bg: '#fef9c3', text: '#a16207' },
  'Needs Improvement': { bg: '#fee2e2', text: '#dc2626' },
}

function dayOfWeek(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-KE', { weekday: 'long' })
}

function daysUntil(dateStr: string) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff === 0) return 'TODAY'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0) return `${Math.abs(diff)}d ago`
  return `In ${diff} days`
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function TeacherDashboardPage() {
  const router = useRouter()
  const [staffId, setStaffId] = useState('')
  const [staffName, setStaffName] = useState('')
  const [staffPhoto, setStaffPhoto] = useState('')
  const [storedToken, setStoredToken] = useState('')
  const [profile, setProfile] = useState<{
    staff: StaffInfo | null
    records_of_work: RecordOfWork[]
    compliance: Compliance | null
    duties: DutyAssignment[]
    appraisals: Appraisal[]
    todays_timetable: TimetableEntry[]
    today: string
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const id = localStorage.getItem('sychar_staff_id') ?? ''
    const name = localStorage.getItem('sychar_staff_name') ?? ''
    const photo = localStorage.getItem('sychar_photo') ?? ''
    const token = localStorage.getItem('sychar_teacher_token') ?? ''
    if (!id) { router.push('/teacher-login'); return }
    setStaffId(id)
    setStaffName(name)
    setStaffPhoto(photo)
    setStoredToken(token)
    loadProfile(id)
  }, [router])

  async function loadProfile(id: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/teacher-profile?staff_id=${id}`)
      if (res.ok) setProfile(await res.json())
    } catch { /* silent */ }
    setLoading(false)
  }

  const staff = profile?.staff
  const duties = profile?.duties ?? []
  const upcomingDuties = duties.filter(d => new Date(d.duty_date) >= new Date(new Date().toDateString()))
  const appraisals = profile?.appraisals ?? []
  const rows = profile?.records_of_work ?? []
  const timetable = profile?.todays_timetable ?? []
  const compliance = profile?.compliance
  const today = profile?.today ?? new Date().toISOString().split('T')[0]

  const roleColor = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--role-primary').trim() || '#22c55e'
    : '#22c55e'

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          Welcome back, {staffName.split(' ')[0]} 👋
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          {new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton" style={{ height: 120, borderRadius: 16 }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Profile header card */}
          <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ height: 6, background: `linear-gradient(90deg, var(--role-primary,#22c55e), var(--role-secondary,#22c55e99))` }} />
            <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
              {staffPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={staffPhoto} alt={staffName} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: '50%', flexShrink: 0, background: 'var(--role-primary,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: 'white', fontFamily: 'Space Grotesk, sans-serif' }}>
                  {getInitials(staffName)}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>{staff?.full_name ?? staffName}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{staff?.subject_name ?? ''}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {staff?.department && (
                    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#374151' }}>
                      {staff.department}
                    </span>
                  )}
                  {staff?.class_name && (
                    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'var(--role-primary,#22c55e)15', color: 'var(--role-primary,#22c55e)' }}>
                      {staff.class_name}
                    </span>
                  )}
                  {staff?.tsc_number && (
                    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#6b7280' }}>
                      TSC: {staff.tsc_number}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Today's timetable strip */}
          {timetable.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                📅 Today's Lessons
              </div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {timetable.map((entry) => (
                  <div key={entry.id} style={{ flexShrink: 0, background: 'var(--role-primary,#22c55e)12', border: '1px solid var(--role-primary,#22c55e)30', borderRadius: 10, padding: '8px 12px', minWidth: 90, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--role-primary,#22c55e)' }}>P{entry.period}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginTop: 2 }}>{entry.class_name?.split(' ').slice(-1)[0]}</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{entry.subject_code ?? entry.subject?.slice(0, 6)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Duties this week */}
            <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', gridColumn: upcomingDuties.length > 2 ? '1 / -1' : 'auto' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                📋 Your Duties This Week
              </div>
              {upcomingDuties.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
                  ✅ No duties assigned this week
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {upcomingDuties.slice(0, 5).map(duty => {
                    const daysLeft = Math.ceil((new Date(duty.duty_date).getTime() - Date.now()) / 86400000)
                    const isToday = duty.duty_date === today
                    return (
                      <div key={duty.id} style={{ display: 'flex', gap: 12, padding: '10px 12px', background: isToday ? 'var(--role-primary,#22c55e)0a' : '#f9fafb', borderRadius: 10, border: isToday ? '1px solid var(--role-primary,#22c55e)30' : '1px solid transparent' }}>
                        <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 48 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? 'var(--role-primary,#22c55e)' : '#6b7280' }}>
                            {daysUntil(duty.duty_date)}
                          </div>
                          <div style={{ fontSize: 10, color: '#9ca3af' }}>{dayOfWeek(duty.duty_date).slice(0, 3)}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{duty.duty_type}</div>
                          {duty.time_slot && <div style={{ fontSize: 11, color: '#6b7280' }}>⏰ {duty.time_slot}</div>}
                          {duty.post && <div style={{ fontSize: 11, color: '#6b7280' }}>📍 {duty.post}</div>}
                          {duty.remarks && <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', marginTop: 2 }}>"{duty.remarks}"</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Appraisal remarks */}
            {appraisals.length > 0 && (
              <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                  ⭐ Duty Performance
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {appraisals.map(a => {
                    const avg = Math.round((a.punctuality + a.incident_handling + a.report_quality + a.student_welfare) / 4)
                    const rc = RATING_COLOR[a.overall_rating] ?? { bg: '#f3f4f6', text: '#374151' }
                    return (
                      <div key={a.id} style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>{new Date(a.duty_date || a.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: rc.bg, color: rc.text }}>{a.overall_rating}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {[{ label: 'Punct', val: a.punctuality }, { label: 'Incident', val: a.incident_handling }, { label: 'Report', val: a.report_quality }, { label: 'Welfare', val: a.student_welfare }].map(s => (
                            <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
                              <div style={{ height: 3, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden', marginBottom: 2 }}>
                                <div style={{ height: '100%', width: `${s.val * 10}%`, background: avg >= 7 ? '#16a34a' : avg >= 5 ? '#d97706' : '#dc2626' }} />
                              </div>
                              <div style={{ fontSize: 9, color: '#9ca3af' }}>{s.label}</div>
                            </div>
                          ))}
                        </div>
                        {a.duty_notes && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}>"{a.duty_notes}"</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Subject / compliance card */}
            <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                📚 Subject & Compliance
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
                {staff?.subject_name ?? localStorage.getItem('sychar_subject') ?? 'My Subject'}
              </div>
              {compliance ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Scheme of Work</span>
                    <span style={{ fontSize: 14 }}>{compliance.has_scheme ? '✅' : '❌'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Records of Work</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{compliance.row_count} entries</span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>Compliance Score</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: compliance.compliance_score >= 80 ? '#16a34a' : compliance.compliance_score >= 50 ? '#d97706' : '#dc2626' }}>
                        {compliance.compliance_score}%
                      </span>
                    </div>
                    <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${compliance.compliance_score}%`, background: compliance.compliance_score >= 80 ? '#16a34a' : compliance.compliance_score >= 50 ? '#d97706' : '#dc2626', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#9ca3af' }}>No compliance data yet</div>
              )}
              {storedToken && (
                <a href={`/record?token=${storedToken}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, padding: '10px', background: 'var(--role-primary,#22c55e)', color: 'white', borderRadius: 10, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  📋 Submit Record of Work
                </a>
              )}
            </div>
          </div>

          {/* Recent ROWs */}
          {rows.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                📝 Recent Records of Work
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rows.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#f9fafb', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', minWidth: 60 }}>{new Date(r.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.topic}</div>
                      {r.sub_topic && <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub_topic}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {r.classwork_given && <span style={{ padding: '2px 6px', background: '#dbeafe', color: '#2176FF', borderRadius: 6, fontSize: 10, fontWeight: 600 }}>CW</span>}
                      {r.homework_assigned && <span style={{ padding: '2px 6px', background: '#dcfce7', color: '#16a34a', borderRadius: 6, fontSize: 10, fontWeight: 600 }}>HW</span>}
                      <span style={{ padding: '2px 6px', background: '#f3f4f6', color: '#6b7280', borderRadius: 6, fontSize: 10 }}>P{r.period}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
