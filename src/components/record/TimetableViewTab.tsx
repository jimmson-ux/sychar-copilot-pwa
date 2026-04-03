'use client'
import { useState, useEffect } from 'react'

interface TimetableEntry {
  id: string
  day: string
  period: number
  subject: string
  subject_code: string | null
  class_name: string
  room: string | null
}

interface TimetableViewTabProps {
  token: string
  teacherId: string
  schoolId: string
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8]
const PERIOD_TIMES: Record<number, string> = {
  1: '8:00', 2: '8:40', 3: '9:20', 4: '10:20', 5: '11:00', 6: '11:40', 7: '13:20', 8: '14:00'
}

const SUBJECT_COLORS: Record<string, string> = {
  Mathematics: '#2176FF', English: '#7C3AED', Kiswahili: '#059669',
  Biology: '#16A34A', Chemistry: '#DC2626', Physics: '#D97706',
  History: '#B45309', Geography: '#0D9488', default: '#6B7280',
}

function getSubjectColor(subject: string): string {
  const key = Object.keys(SUBJECT_COLORS).find(k => subject.toLowerCase().includes(k.toLowerCase()))
  return key ? SUBJECT_COLORS[key] : SUBJECT_COLORS.default
}

const CACHE_KEY = 'sychar_teacher_timetable'
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

export default function TimetableViewTab({ token, teacherId, schoolId }: TimetableViewTabProps) {
  const [timetable, setTimetable] = useState<TimetableEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    loadTimetable()
  }, [teacherId])

  async function loadTimetable() {
    // Load from cache first (stale while revalidate)
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data, at } = JSON.parse(cached)
        if (Date.now() - at < CACHE_TTL) {
          setTimetable(data)
          setLoading(false)
        }
      }
    } catch { /* ignore */ }

    // Fetch fresh data
    try {
      const res = await fetch(
        `/api/teacher/timetable?token=${encodeURIComponent(token)}&teacherId=${encodeURIComponent(teacherId)}&schoolId=${encodeURIComponent(schoolId)}`
      )
      if (res.ok) {
        const data = await res.json()
        const entries = data.timetable ?? []
        setTimetable(entries)
        setLastUpdated(new Date())
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: entries, at: Date.now() }))
      }
    } catch { /* use cached data */ }

    setLoading(false)
  }

  function getCell(day: string, period: number): TimetableEntry | undefined {
    return timetable.find(t => t.day === day && t.period === period)
  }

  if (loading && timetable.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
        <div style={{ fontSize: 14 }}>Loading timetable...</div>
      </div>
    )
  }

  if (timetable.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>No timetable assigned yet</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Contact the Deputy Principal (Academics)</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>My Timetable</h3>
        {lastUpdated && (
          <span style={{ fontSize: 11, color: '#9ca3af' }}>
            Updated {lastUpdated.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 8px', background: '#f9fafb', textAlign: 'center', fontWeight: 700, color: '#6b7280', fontSize: 10, textTransform: 'uppercase', borderBottom: '2px solid #e5e7eb', width: 40 }}>
                Per.
              </th>
              {DAYS.map(day => (
                <th key={day} style={{ padding: '6px 4px', background: '#f9fafb', textAlign: 'center', fontWeight: 700, color: '#6b7280', fontSize: 10, textTransform: 'uppercase', borderBottom: '2px solid #e5e7eb' }}>
                  {day.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map(period => (
              <tr key={period}>
                <td style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #f3f4f6', borderRight: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>P{period}</div>
                  <div style={{ fontSize: 9, color: '#9ca3af' }}>{PERIOD_TIMES[period]}</div>
                </td>
                {DAYS.map(day => {
                  const cell = getCell(day, period)
                  return (
                    <td key={day} style={{ padding: '3px', borderBottom: '1px solid #f3f4f6' }}>
                      {cell ? (
                        <div style={{
                          background: `${getSubjectColor(cell.subject)}18`,
                          border: `1px solid ${getSubjectColor(cell.subject)}40`,
                          borderRadius: 6,
                          padding: '5px 4px',
                          textAlign: 'center',
                          minHeight: 44,
                        }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: getSubjectColor(cell.subject), lineHeight: 1.2 }}>
                            {cell.subject_code || cell.subject.slice(0, 6)}
                          </div>
                          <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>{cell.class_name}</div>
                          {cell.room && <div style={{ fontSize: 8, color: '#9ca3af' }}>{cell.room}</div>}
                        </div>
                      ) : (
                        <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: '#e5e7eb', fontSize: 14 }}>—</span>
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

      {/* Summary */}
      <div style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Weekly Summary</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Array.from(new Set(timetable.map(t => t.subject))).map(subject => {
            const count = timetable.filter(t => t.subject === subject).length
            const classes = Array.from(new Set(timetable.filter(t => t.subject === subject).map(t => t.class_name)))
            return (
              <div key={subject} style={{
                background: `${getSubjectColor(subject)}18`,
                border: `1px solid ${getSubjectColor(subject)}40`,
                borderRadius: 8, padding: '6px 10px',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: getSubjectColor(subject) }}>{subject}</span>
                <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 4 }}>{count} lessons · {classes.join(', ')}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
