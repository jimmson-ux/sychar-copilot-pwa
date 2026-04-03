'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient, SCHOOL_ID } from '@/lib/supabase'
import { KENYAN_SCHOOL_PERIODS, getSubjectColor } from '@/lib/roles'
import { SkeletonTable } from '@/components/ui/Skeleton'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const CLASSES = [
  'Form 1 Champions', 'Form 1 Achievers', 'Form 1 Winners', 'Form 1 Victors',
  'Form 2 Champions', 'Form 2 Achievers', 'Form 2 Winners', 'Form 2 Victors',
  'Form 3 Champions', 'Form 3 Achievers',
  'Form 4 Champions', 'Form 4 Achievers',
]

interface TimetableEntry {
  id: string
  day: string
  period: number
  subject: string
  subject_code: string | null
  teacher_initials: string | null
  room: string | null
  is_published: boolean
}

export default function TimetablePage() {
  const [selectedClass, setSelectedClass] = useState(CLASSES[0])
  const [timetable, setTimetable] = useState<TimetableEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState('')

  useEffect(() => {
    loadUserRole()
  }, [])

  useEffect(() => {
    loadTimetable()
  }, [selectedClass])

  async function loadUserRole() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: staff } = await supabase
      .from('staff_records')
      .select('sub_role')
      .eq('user_id', user.id)
      .single()
    setUserRole(staff?.sub_role ?? '')
  }

  async function loadTimetable() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('timetable')
      .select('id, day, period, subject, subject_code, teacher_initials, room, is_published')
      .eq('school_id', SCHOOL_ID)
      .eq('class_name', selectedClass)
      .order('period')

    setTimetable(data ?? [])
    setLoading(false)
  }

  function getCell(day: string, period: number): TimetableEntry | undefined {
    return timetable.find(t => t.day === day && t.period === period)
  }

  const teachingPeriods = KENYAN_SCHOOL_PERIODS.filter(p => p.period > 0)
  const isDeputyAcademic = userRole === 'deputy_principal_academics'
  const isPublished = timetable.some(t => t.is_published)

  return (
    <div className="p-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
            Class Timetable
          </h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>
            {isPublished ? '✅ Published' : '⚠️ Not published yet'}
          </p>
        </div>
        {isDeputyAcademic && (
          <button
            onClick={() => alert('AI timetable generation coming soon. Use the timetabling committee workflow.')}
            style={{
              background: 'var(--role-primary, #0891b2)', color: 'white',
              border: 'none', borderRadius: 10, padding: '10px 18px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Generate AI Timetable
          </button>
        )}
      </div>

      {/* Class selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
          Select Class
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CLASSES.map(cls => (
            <button
              key={cls}
              onClick={() => setSelectedClass(cls)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: selectedClass === cls ? 'none' : '1px solid #e5e7eb',
                background: selectedClass === cls ? 'var(--role-primary, #0891b2)' : 'white',
                color: selectedClass === cls ? 'white' : '#374151',
                cursor: 'pointer',
              }}
            >{cls}</button>
          ))}
        </div>
      </div>

      {/* Period timing reference bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {KENYAN_SCHOOL_PERIODS.map((p, i) => (
          <div key={i} style={{
            flexShrink: 0,
            background: p.period === 0 ? '#fef9f0' : '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: 8, padding: '6px 10px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: p.period === 0 ? '#d97706' : '#374151' }}>
              {p.name}
            </div>
            <div style={{ fontSize: 9, color: '#9ca3af' }}>{p.start}–{p.end}</div>
          </div>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <SkeletonTable rows={8} />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', minWidth: 80 }}>
                  Period
                </th>
                {DAYS.map(day => (
                  <th key={day} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', minWidth: 100 }}>
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teachingPeriods.map(period => (
                <tr key={period.period} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 12px', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 12 }}>{period.name}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>{period.start}</div>
                  </td>
                  {DAYS.map(day => {
                    const cell = getCell(day, period.period)
                    return (
                      <td key={day} style={{ padding: '6px', textAlign: 'center' }}>
                        {cell ? (
                          <div style={{
                            background: `${getSubjectColor(cell.subject)}15`,
                            border: `1px solid ${getSubjectColor(cell.subject)}40`,
                            borderRadius: 8,
                            padding: '8px 6px',
                            minHeight: 56,
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: getSubjectColor(cell.subject) }}>
                              {cell.subject_code || cell.subject.slice(0, 8)}
                            </div>
                            {cell.teacher_initials && (
                              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{cell.teacher_initials}</div>
                            )}
                            {cell.room && (
                              <div style={{ fontSize: 9, color: '#9ca3af' }}>{cell.room}</div>
                            )}
                          </div>
                        ) : (
                          <div style={{
                            background: '#f9fafb', borderRadius: 8,
                            padding: '8px 6px', minHeight: 56,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={{ color: '#d1d5db', fontSize: 18 }}>—</span>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {timetable.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>No timetable entries</div>
          <div style={{ fontSize: 13 }}>
            {isDeputyAcademic
              ? 'Click "Generate AI Timetable" to get started, or enter entries manually.'
              : 'Contact the Deputy Principal (Academics) to publish the timetable.'}
          </div>
        </div>
      )}
    </div>
  )
}
