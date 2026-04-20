'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useSchoolId } from '@/hooks/useSchoolId'
import { formatDate, formatCurrency, getGradeFromScore, getGradeColor, canSeeGuardianPhone } from '@/lib/roles'
import { SkeletonTable } from '@/components/ui/Skeleton'

interface Student {
  id: string
  full_name: string
  admission_number: string | null
  class_name: string | null
  stream_name: string | null
  gender: string | null
  parent_name: string | null
  parent_phone: string | null
  photo_url: string | null
}

interface StudentDetails {
  marks: Array<{ subject: string; score: number; exam_type: string; created_at: string }>
  feeBalance: { balance: number; amount_paid: number; total_fees: number } | null
  disciplineCount: number
  attendanceRate: number | null
}

const STREAM_STYLES: Record<string, { bg: string; color: string }> = {
  Champions: { bg: '#fef9c3', color: '#a16207' },
  Achievers: { bg: '#cffafe', color: '#0e7490' },
  Winners: { bg: '#dbeafe', color: '#1d4ed8' },
  Victors: { bg: '#fce7f3', color: '#be185d' },
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function getAvatarColor(name: string): string {
  const colors = ['#0891b2', '#7c3aed', '#dc2626', '#d97706', '#16a34a', '#2563eb']
  return colors[name.charCodeAt(0) % colors.length]
}

export default function StudentsPage() {
  const { schoolId } = useSchoolId()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [formFilter, setFormFilter] = useState('All')
  const [streamFilter, setStreamFilter] = useState('All')
  const [selected, setSelected] = useState<Student | null>(null)
  const [details, setDetails] = useState<StudentDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [role, setRole] = useState('')

  useEffect(() => {
    try { const c = JSON.parse(localStorage.getItem('sychar_role_cache') ?? '{}'); setRole(c.r ?? '') } catch { /* ignore */ }
    if (!schoolId) return
    loadStudents()
  }, [schoolId])

  async function loadStudents() {
    const supabase = createClient()
    const { data } = await supabase
      .from('students')
      .select('id, full_name, admission_number, class_name, stream_name, gender, parent_name, parent_phone, photo_url')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('full_name')
    setStudents(data ?? [])
    setLoading(false)
  }

  async function loadDetails(student: Student) {
    const supabase = createClient()
    setSelected(student)
    setDetails(null)
    setLoadingDetails(true)

    const [marksRes, feeRes, discRes, attRes] = await Promise.allSettled([
      supabase.from('marks').select('subject, score, exam_type, created_at').eq('student_id', student.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('fee_balances').select('balance, amount_paid, total_fees').eq('student_id', student.id).single(),
      supabase.from('discipline_records').select('id', { count: 'exact', head: true }).eq('student_id', student.id),
      supabase.from('attendance').select('status').eq('student_id', student.id).limit(50),
    ])

    const marks = marksRes.status === 'fulfilled' ? (marksRes.value.data ?? []) : []
    const feeBalance = feeRes.status === 'fulfilled' ? feeRes.value.data : null
    const disciplineCount = discRes.status === 'fulfilled' ? (discRes.value.count ?? 0) : 0

    let attendanceRate: number | null = null
    if (attRes.status === 'fulfilled' && attRes.value.data && attRes.value.data.length > 0) {
      const records = attRes.value.data
      const present = records.filter((r: { status: string }) => r.status === 'present').length
      attendanceRate = Math.round((present / records.length) * 100)
    }

    setDetails({ marks, feeBalance, disciplineCount, attendanceRate })
    setLoadingDetails(false)
  }

  const forms = ['All', 'Form 1', 'Form 2', 'Form 3', 'Form 4', 'Grade 10']
  const streams = ['All', 'Champions', 'Achievers', 'Winners', 'Victors']

  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = s.full_name.toLowerCase().includes(q) ||
      (s.admission_number && s.admission_number.toLowerCase().includes(q))
    const matchForm = formFilter === 'All' || (s.class_name ?? '').startsWith(formFilter)
    const matchStream = streamFilter === 'All' || s.stream_name === streamFilter
    return matchSearch && matchForm && matchStream
  })

  return (
    <div className="p-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>Students</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>{filtered.length} of {students.length} students</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or admission no..."
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none' }}
        />
        <select value={formFilter} onChange={e => setFormFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', background: 'white' }}>
          {forms.map(f => <option key={f}>{f}</option>)}
        </select>
        <select value={streamFilter} onChange={e => setStreamFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', background: 'white' }}>
          {streams.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={12} />
      ) : (
        <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Student</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Class</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Adm No</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Gender</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(student => {
                const streamStyle = STREAM_STYLES[student.stream_name ?? '']
                return (
                  <tr
                    key={student.id}
                    onClick={() => loadDetails(student)}
                    style={{ borderTop: '1px solid #f3f4f6', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: getAvatarColor(student.full_name),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: 'white',
                        }}>
                          {getInitials(student.full_name)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#111827' }}>{student.full_name}</div>
                          {canSeeGuardianPhone(role) && student.parent_phone && <div style={{ fontSize: 11, color: '#9ca3af' }}>{student.parent_phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontSize: 12, color: '#374151' }}>{student.class_name}</div>
                      {student.stream_name && streamStyle && (
                        <span style={{
                          display: 'inline-block', marginTop: 2, padding: '2px 8px', borderRadius: 20,
                          fontSize: 10, fontWeight: 700,
                          background: streamStyle.bg, color: streamStyle.color,
                        }}>{student.stream_name}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7280' }}>{student.admission_number ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#6b7280', textTransform: 'capitalize' }}>{student.gender ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <div style={{ padding: '12px 16px', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
              Showing 100 of {filtered.length}. Refine search to see more.
            </div>
          )}
        </div>
      )}

      {/* 360° Side Drawer */}
      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              position: 'fixed', right: 0, top: 0, bottom: 0, width: 380,
              background: 'white', overflowY: 'auto',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #1e40af, #0891b2)', padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 700, fontSize: 22,
              }}>
                {getInitials(selected.full_name)}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ color: 'white', fontSize: 16, fontWeight: 700, margin: 0 }}>{selected.full_name}</h2>
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, margin: '2px 0 0' }}>
                  {selected.class_name} {selected.stream_name ? `· ${selected.stream_name}` : ''}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: '2px 0 0' }}>
                  {selected.admission_number ?? ''}
                </p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: 'white', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ padding: 20 }}>
              {loadingDetails ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>Loading...</div>
              ) : details ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Quick stats */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1, background: '#f0f9ff', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#0891b2' }}>
                        {details.attendanceRate !== null ? `${details.attendanceRate}%` : '—'}
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>Attendance</div>
                    </div>
                    <div style={{ flex: 1, background: '#fef9f0', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#d97706' }}>
                        {details.feeBalance ? formatCurrency(details.feeBalance.balance) : '—'}
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>Balance</div>
                    </div>
                    <div style={{ flex: 1, background: '#fff1f2', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{details.disciplineCount}</div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>Incidents</div>
                    </div>
                  </div>

                  {/* Recent marks */}
                  {details.marks.length > 0 && (
                    <div>
                      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Recent Exam Results</h3>
                      {details.marks.map((mark, i) => {
                        const grade = getGradeFromScore(mark.score)
                        const color = getGradeColor(grade)
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{mark.subject}</div>
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>{mark.exam_type} · {formatDate(mark.created_at)}</div>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color }}>{mark.score}%</div>
                            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${color}20`, color }}>{grade}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Parent info */}
                  <div style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px' }}>
                    <h3 style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Parent / Guardian</h3>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{selected.parent_name ?? 'Not recorded'}</div>
                    {canSeeGuardianPhone(role) && selected.parent_phone && (
                      <a href={`tel:${selected.parent_phone}`} style={{ fontSize: 13, color: '#0891b2', textDecoration: 'none', display: 'block', marginTop: 4 }}>
                        📞 {selected.parent_phone}
                      </a>
                    )}
                    {canSeeGuardianPhone(role) && selected.parent_phone && (
                      <a href={`https://wa.me/${selected.parent_phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#22c55e', textDecoration: 'none', display: 'block', marginTop: 4 }}>
                        💬 WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
