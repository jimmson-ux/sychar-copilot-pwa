'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface TimetableEntry {
  id: string
  day: string
  period: number
  subject: string
  subject_code: string | null
  class_name: string
  room: string | null
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8]

const SUBJECT_COLORS = [
  '#dbeafe', '#dcfce7', '#fce7f3', '#fef9c3', '#ede9fe',
  '#ffedd5', '#e0f2fe', '#f0fdf4', '#fdf4ff', '#fff7ed',
]

function colorForSubject(subject: string, map: Map<string, string>): string {
  if (map.has(subject)) return map.get(subject)!
  const idx = map.size % SUBJECT_COLORS.length
  map.set(subject, SUBJECT_COLORS[idx])
  return SUBJECT_COLORS[idx]
}

function todayName() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' })
}

export default function TimetablePage() {
  const router = useRouter()
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const colorMap = new Map<string, string>()

  useEffect(() => {
    const token = localStorage.getItem('sychar_teacher_token') ?? ''
    const staffId = localStorage.getItem('sychar_staff_id') ?? ''
    const schoolId = localStorage.getItem('sychar_school_id') ?? ''
    if (!token || !staffId) { router.push('/teacher-login'); return }
    fetchTimetable(token, staffId, schoolId)
  }, [router])

  async function fetchTimetable(token: string, teacherId: string, schoolId: string) {
    setLoading(true)
    try {
      const params = new URLSearchParams({ token, teacherId })
      if (schoolId) params.set('schoolId', schoolId)
      const res = await fetch(`/api/teacher/timetable?${params}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setEntries(data.timetable ?? [])
    } catch {
      setError('Network error — check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const today = todayName()
  const totalLessons = entries.length
  const todayLessons = entries.filter(e => e.day === today).length

  function cellFor(day: string, period: number) {
    return entries.find(e => e.day === day && e.period === period) ?? null
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          My Timetable
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Weekly schedule — today is {today}
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Lessons/Week', value: totalLessons, icon: '📅' },
          { label: "Today's Lessons", value: todayLessons, icon: '📌' },
          { label: 'Unique Subjects', value: new Set(entries.map(e => e.subject)).size, icon: '📚' },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'white', borderRadius: 14, padding: '14px 20px', flex: '1 1 140px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 22 }}>{stat.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif', marginTop: 4 }}>
              {loading ? '—' : stat.value}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ background: 'white', borderRadius: 16, padding: 40, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: 'var(--role-primary,#22c55e)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: '#6b7280' }}>Loading timetable…</p>
        </div>
      ) : error ? (
        <div style={{ background: 'white', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
          <p style={{ fontSize: 13, color: '#dc2626' }}>{error}</p>
        </div>
      ) : entries.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 16, padding: 40, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <p style={{ fontSize: 14, color: '#6b7280' }}>No timetable entries found. Contact your HOD or administrator.</p>
        </div>
      ) : (
        /* Grid — horizontally scrollable on mobile */
        <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', width: 60 }}>
                    Period
                  </th>
                  {DAYS.map(day => (
                    <th key={day} style={{
                      padding: '12px 16px', textAlign: 'center', fontSize: 12, fontWeight: 700,
                      color: day === today ? 'var(--role-primary,#22c55e)' : '#374151',
                      background: day === today ? 'var(--role-primary,#22c55e)08' : '#f8fafc',
                      borderBottom: '1px solid #f1f5f9',
                      borderLeft: day === today ? '2px solid var(--role-primary,#22c55e)' : 'none',
                    }}>
                      {day.slice(0, 3).toUpperCase()}
                      {day === today && (
                        <span style={{ display: 'block', fontSize: 9, fontWeight: 700, color: 'var(--role-primary,#22c55e)', letterSpacing: '0.06em', marginTop: 2 }}>TODAY</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map(period => (
                  <tr key={period} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 700, color: '#9ca3af', background: '#fafafa' }}>
                      P{period}
                    </td>
                    {DAYS.map(day => {
                      const cell = cellFor(day, period)
                      const bg = cell ? colorForSubject(cell.subject, colorMap) : 'transparent'
                      return (
                        <td key={day} style={{
                          padding: '8px 12px', textAlign: 'center', verticalAlign: 'middle',
                          background: day === today ? 'var(--role-primary,#22c55e)05' : 'transparent',
                          borderLeft: day === today ? '2px solid var(--role-primary,#22c55e)20' : 'none',
                          minWidth: 110,
                        }}>
                          {cell ? (
                            <div style={{ background: bg, borderRadius: 8, padding: '6px 8px' }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{cell.subject}</div>
                              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{cell.class_name}</div>
                              {cell.room && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>Room {cell.room}</div>}
                            </div>
                          ) : (
                            <span style={{ fontSize: 18, color: '#e5e7eb' }}>—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
