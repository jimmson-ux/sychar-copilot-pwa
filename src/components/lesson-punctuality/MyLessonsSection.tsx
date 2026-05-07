'use client'

import { useState } from 'react'
import TeacherCheckinFeedback from './TeacherCheckinFeedback'

interface SubjectCtx {
  subject_name: string
  class_name: string
  stream_name: string
  curriculum_type: string
}

interface TeachingContext {
  has_teaching_duties: boolean
  subjects: SubjectCtx[]
  today_periods?: {
    period_number: number
    subject_name: string
    class_name: string
    stream_name: string
    scheduled_start: string
    session_id?: string
    checked_in: boolean
    qr_token?: string
  }[]
}

interface CheckinResult {
  subject_name: string
  class_name: string
  stream_name: string
  period_number: number
  scheduled_time: string
  actual_time: string
  minutes_late: number
  punctuality_status: 'on_time' | 'slightly_late' | 'late' | 'very_late'
}

interface Props {
  teachingContext: TeachingContext
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}

export default function MyLessonsSection({ teachingContext }: Props) {
  const [feedback, setFeedback] = useState<CheckinResult | null>(null)
  const [checking, setChecking] = useState<number | null>(null)

  async function checkin(period: NonNullable<TeachingContext['today_periods']>[number]) {
    setChecking(period.period_number)
    try {
      const res = await fetch('/api/attendance/teacher-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodNumber: period.period_number, sessionId: period.session_id }),
      })
      const j = await res.json() as { checked_in_at?: string; minutes_late?: number; punctuality_status?: CheckinResult['punctuality_status'] }
      if (res.ok) {
        setFeedback({
          subject_name:       period.subject_name,
          class_name:         period.class_name,
          stream_name:        period.stream_name,
          period_number:      period.period_number,
          scheduled_time:     period.scheduled_start,
          actual_time:        j.checked_in_at ?? new Date().toISOString(),
          minutes_late:       j.minutes_late ?? 0,
          punctuality_status: j.punctuality_status ?? 'on_time',
        })
      }
    } finally {
      setChecking(null)
    }
  }

  const periods = teachingContext.today_periods ?? []

  return (
    <>
      <TeacherCheckinFeedback result={feedback} onDismiss={() => setFeedback(null)} />
      {periods.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>No lessons scheduled today.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {periods.map(p => (
            <div key={p.period_number} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              background: p.checked_in ? '#f0fdf4' : '#f8fafc', borderRadius: 12,
              border: `1px solid ${p.checked_in ? '#bbf7d0' : '#e5e7eb'}`,
            }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.checked_in ? '#16a34a' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.checked_in ? 'white' : '#6b7280', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                {p.period_number}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{p.subject_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{p.class_name} {p.stream_name} · {fmt(p.scheduled_start)}</div>
              </div>
              {p.checked_in ? (
                <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Checked in</span>
              ) : (
                <button
                  onClick={() => checkin(p)}
                  disabled={checking === p.period_number}
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#0891b2', color: 'white', fontWeight: 600, fontSize: 12, cursor: 'pointer', opacity: checking === p.period_number ? 0.7 : 1 }}
                >
                  {checking === p.period_number ? '...' : '📲 Check In'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
