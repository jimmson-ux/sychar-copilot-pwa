'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
// schoolId is resolved dynamically inside loadDashboard() from staff_records
import { setRoleTheme, formatDate } from '@/lib/roles'
import SmartAlerts from '@/components/SmartAlerts'
import { SkeletonStats, SkeletonCard } from '@/components/ui/Skeleton'

interface DashboardStats {
  totalStudents: number
  boysCount: number
  girlsCount: number
  totalStaff: number
  feeCollectionPct: number
  avgPerformancePct: number
}

interface PathwayOverview {
  total: number
  female_count: number
  male_count: number
  female_avg_kcpe: number | null
  male_avg_kcpe: number | null
  kcpe_gap: number | null
}

interface PathwayRow {
  pathway: string
  label: string
  female_count: number
  male_count: number
  total: number
}

interface Notice {
  id: string
  title: string
  content: string
  created_at: string
}

interface DisciplineIncident {
  id: string
  incident_type: string
  severity: string
  incident_date: string
  student_name: string
  class_name: string
}

export default function DashboardPage() {
  const router = useRouter()

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [incidents, setIncidents] = useState<DisciplineIncident[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState('')
  const [userName, setUserName] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [pathwayOverview, setPathwayOverview] = useState<PathwayOverview | null>(null)
  const [pathwayRows, setPathwayRows] = useState<PathwayRow[]>([])
  const [pathwayLoading, setPathwayLoading] = useState(false)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: staff } = await supabase
        .from('staff_records')
        .select('full_name, sub_role, role, school_id')
        .eq('user_id', user.id)
        .single()

      const resolvedSchoolId = staff?.school_id as string
      setSchoolId(resolvedSchoolId)
      const role = staff?.sub_role || staff?.role || 'class_teacher'
      setUserRole(role)
      setUserName(staff?.full_name?.split(' ')[0] || 'Staff')
      setRoleTheme(role)

      // HOD Pathways: fetch pathway data for the overview panel
      if (role === 'hod_pathways') {
        setPathwayLoading(true)
        fetch('/api/pathways')
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data && !data.error) {
              setPathwayOverview(data.overview)
              setPathwayRows(data.pathway_inclination ?? [])
            }
          })
          .catch(() => {})
          .finally(() => setPathwayLoading(false))
      }

      const TEACHING_ROLES = [
        'principal','deputy_principal','deputy_principal_academics','deputy_principal_discipline',
        'dean_of_studies','deputy_dean_of_studies','dean_of_students',
        'form_principal_form4','form_principal_grade10',
        'hod_subjects','hod_pathways','hod_sciences','hod_mathematics',
        'hod_languages','hod_humanities','hod_applied_sciences','hod_games_sports',
        'class_teacher','bom_teacher',
      ]

      // Load stats in parallel
      const [studentsRes, boysRes, girlsRes, staffRes, feeRes, marksRes, noticesRes, incidentsRes] = await Promise.allSettled([
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', resolvedSchoolId).eq('is_active', true),
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', resolvedSchoolId).eq('is_active', true).eq('gender', 'male'),
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', resolvedSchoolId).eq('is_active', true).eq('gender', 'female'),
        supabase.from('staff_records').select('id', { count: 'exact', head: true }).eq('school_id', resolvedSchoolId).eq('is_active', true).in('sub_role', TEACHING_ROLES),
        supabase.from('fee_balances').select('total_fees, amount_paid').eq('school_id', resolvedSchoolId),
        supabase.from('marks').select('score').eq('school_id', resolvedSchoolId).not('score', 'is', null).limit(500),
        supabase.from('notices').select('id, title, content, created_at').eq('school_id', resolvedSchoolId).eq('is_active', true).order('created_at', { ascending: false }).limit(5),
        supabase.from('discipline_records').select('id, incident_type, severity, incident_date, class_name, students(full_name)').eq('school_id', resolvedSchoolId).order('incident_date', { ascending: false }).limit(5),
      ])

      const totalStudents = studentsRes.status === 'fulfilled' ? (studentsRes.value.count ?? 0) : 0
      const boysCount = boysRes.status === 'fulfilled' ? (boysRes.value.count ?? 0) : 0
      const girlsCount = girlsRes.status === 'fulfilled' ? (girlsRes.value.count ?? 0) : 0
      const totalStaff = staffRes.status === 'fulfilled' ? (staffRes.value.count ?? 0) : 0

      let feeCollectionPct = 0
      if (feeRes.status === 'fulfilled' && feeRes.value.data) {
        const fees = feeRes.value.data
        const totalFees = fees.reduce((s: number, f: { total_fees: number }) => s + (f.total_fees || 0), 0)
        const totalPaid = fees.reduce((s: number, f: { amount_paid: number }) => s + (f.amount_paid || 0), 0)
        feeCollectionPct = totalFees > 0 ? Math.round((totalPaid / totalFees) * 100) : 0
      }

      let avgPerformancePct = 0
      if (marksRes.status === 'fulfilled' && marksRes.value.data && marksRes.value.data.length > 0) {
        const scores = marksRes.value.data.map((m: { score: number }) => m.score)
        avgPerformancePct = Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
      }

      setStats({ totalStudents, boysCount, girlsCount, totalStaff, feeCollectionPct, avgPerformancePct })

      if (noticesRes.status === 'fulfilled') {
        setNotices(noticesRes.value.data ?? [])
      }

      if (incidentsRes.status === 'fulfilled' && incidentsRes.value.data) {
        setIncidents(incidentsRes.value.data.map((d: { id: string; incident_type: string; severity: string; incident_date: string; class_name: string; students: { full_name: string }[] | { full_name: string } | null }) => ({
          id: d.id,
          incident_type: d.incident_type,
          severity: d.severity,
          incident_date: d.incident_date,
          class_name: d.class_name,
          student_name: Array.isArray(d.students) ? (d.students[0]?.full_name ?? 'Unknown') : (d.students?.full_name ?? 'Unknown'),
        })))
      }
    } finally {
      setLoading(false)
    }
  }

  const severityColor: Record<string, string> = {
    minor: '#16a34a', moderate: '#d97706', serious: '#dc2626', critical: '#7c3aed',
  }

  const statCards = stats ? [
    { label: 'Students', value: stats.totalStudents.toLocaleString(), sub: `${stats.boysCount}♂ · ${stats.girlsCount}♀`, icon: '👥', color: '#2176FF', link: '/dashboard/students' },
    { label: 'Teaching Staff', value: stats.totalStaff.toLocaleString(), sub: null, icon: '👨‍🏫', color: '#22c55e', link: '/dashboard/staff' },
    { label: 'Fee Collection', value: `${stats.feeCollectionPct}%`, sub: null, icon: '💰', color: '#16a34a', link: '/dashboard/students' },
    { label: 'Avg Performance', value: `${stats.avgPerformancePct}%`, sub: null, icon: '📊', color: '#d97706', link: '/dashboard/merit-list' },
  ] : []

  const quickActions = [
    { label: 'Scan Document', icon: '📄', link: '/dashboard/scanner' },
    { label: 'View Timetable', icon: '📅', link: '/dashboard/timetable' },
    { label: 'Duty Appraisals', icon: '⭐', link: '/dashboard/duty-appraisals' },
    { label: 'Merit List', icon: '🏆', link: '/dashboard/merit-list' },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          Welcome back, {userName}!
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>
          {new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Smart Alerts */}
      <SmartAlerts userRole={userRole} schoolId={schoolId} />

      {/* Stats Grid */}
      {loading ? (
        <SkeletonStats />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24 }}>
          {statCards.map(card => (
            <button
              key={card.label}
              onClick={() => router.push(card.link)}
              style={{
                background: 'white',
                border: '1px solid #f1f5f9',
                borderRadius: 16,
                padding: '20px',
                textAlign: 'left',
                cursor: 'pointer',
                borderLeft: `4px solid ${card.color}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none'
                e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>{card.icon}</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: card.color, fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1 }}>
                {card.value}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</div>
              {card.sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{card.sub}</div>}
            </button>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 12, fontFamily: 'Space Grotesk, sans-serif' }}>
          Quick Actions
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {quickActions.map(action => (
            <button
              key={action.label}
              onClick={() => router.push(action.link)}
              style={{
                background: 'white',
                border: '1px solid #f1f5f9',
                borderRadius: 12,
                padding: '16px',
                textAlign: 'center',
                cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              <div style={{ fontSize: 28, marginBottom: 6 }}>{action.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{action.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Section: Notices + Discipline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Notices */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 12, fontFamily: 'Space Grotesk, sans-serif' }}>
            Noticeboard
          </h2>
          {loading ? (
            <SkeletonCard />
          ) : notices.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
              No active notices
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notices.map(notice => (
                <div key={notice.id} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, padding: '12px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{notice.title}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{notice.content.slice(0, 80)}{notice.content.length > 80 ? '...' : ''}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{formatDate(notice.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Discipline */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 12, fontFamily: 'Space Grotesk, sans-serif' }}>
            Recent Incidents
          </h2>
          {loading ? (
            <SkeletonCard />
          ) : incidents.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
              No recent incidents
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {incidents.map(inc => (
                <div key={inc.id} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: severityColor[inc.severity] ?? '#6b7280',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inc.student_name}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{inc.incident_type} · {inc.class_name}</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{formatDate(inc.incident_date)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── HOD Pathways Extra Sections ─────────────────────────── */}
      {userRole === 'hod_pathways' && (
        <div style={{ marginTop: 32 }}>
          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{ flex: 1, height: 1, background: '#f1f5f9' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Pathways &amp; Career Guidance
            </span>
            <div style={{ flex: 1, height: 1, background: '#f1f5f9' }} />
          </div>

          {/* Pathway Overview Card */}
          <div style={{
            background: 'linear-gradient(135deg, #2176FF 0%, #80EE98 100%)',
            borderRadius: 16, padding: '20px 24px', marginBottom: 20, color: 'white',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 500 }}>Pathway Overview</div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif', marginTop: 2 }}>
                  {pathwayLoading ? '...' : pathwayOverview ? pathwayOverview.total.toLocaleString() : '—'} Students
                </div>
              </div>
              <div style={{ fontSize: 40, opacity: 0.9 }}>🧭</div>
            </div>

            {pathwayOverview && !pathwayLoading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>Girls</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif' }}>{pathwayOverview.female_count}</div>
                  {pathwayOverview.female_avg_kcpe !== null && (
                    <div style={{ fontSize: 10, opacity: 0.7 }}>Avg KCPE: {pathwayOverview.female_avg_kcpe}</div>
                  )}
                </div>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>Boys</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif' }}>{pathwayOverview.male_count}</div>
                  {pathwayOverview.male_avg_kcpe !== null && (
                    <div style={{ fontSize: 10, opacity: 0.7 }}>Avg KCPE: {pathwayOverview.male_avg_kcpe}</div>
                  )}
                </div>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>KCPE Gap</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif' }}>
                    {pathwayOverview.kcpe_gap !== null ? (pathwayOverview.kcpe_gap > 0 ? `+${pathwayOverview.kcpe_gap}` : pathwayOverview.kcpe_gap) : '—'}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.7 }}>Girls vs Boys</div>
                </div>
              </div>
            )}
          </div>

          {/* Pathway Inclination Breakdown */}
          {pathwayRows.length > 0 && !pathwayLoading && (
            <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: '20px 24px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: '0 0 16px', fontFamily: 'Space Grotesk, sans-serif' }}>
                Pathway Inclination by Gender
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pathwayRows.map(row => {
                  const pct = row.total > 0 ? Math.round((row.female_count / row.total) * 100) : 0
                  const PATHWAY_COLORS: Record<string, string> = {
                    STEM: '#2176FF', Social_Sciences: '#7C3AED',
                    Arts_Sports: '#ea580c', CBE: '#6b7280',
                  }
                  const color = PATHWAY_COLORS[row.pathway] ?? '#0891b2'
                  return (
                    <div key={row.pathway}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{row.label}</span>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{row.total} ({row.female_count}F · {row.male_count}M)</span>
                      </div>
                      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Career Guidance Quick Actions */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 12, fontFamily: 'Space Grotesk, sans-serif' }}>
              Career Guidance Tools
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {[
                { label: 'AI University Matching', desc: 'Match students to degree programmes', icon: '🤖', link: '/dashboard/university-matching', color: '#2176FF' },
                { label: 'Pathways Analysis', desc: 'Gender × STEM pathway dashboard', icon: '🧭', link: '/dashboard/pathways', color: '#7C3AED' },
                { label: 'Gender Analysis', desc: 'Performance gap by gender', icon: '📈', link: '/dashboard/gender-analysis', color: '#0891b2' },
                { label: 'KCSE Predictions', desc: 'AI-powered grade projections', icon: '🎯', link: '/dashboard/kcse', color: '#16a34a' },
              ].map(action => (
                <button
                  key={action.label}
                  onClick={() => router.push(action.link)}
                  style={{
                    background: 'white', border: `1px solid #f1f5f9`,
                    borderLeft: `4px solid ${action.color}`,
                    borderRadius: 12, padding: '14px 16px',
                    textAlign: 'left', cursor: 'pointer',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none'
                    e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{action.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{action.label}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{action.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI FAB */}
      <button
        onClick={() => router.push('/dashboard/university-matching')}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--role-primary, #0891b2), var(--role-secondary, #22c55e))',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          zIndex: 100,
        }}
        title="AI University Matching"
      >🤖</button>
    </div>
  )
}
