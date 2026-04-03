'use client'
import { useState, useEffect } from 'react'

interface DutyItem {
  id: string
  duty_type: string
  duty_date: string
  location: string | null
  description: string | null
}

interface Notice {
  id: string
  subject: string
  message: string
  from_role: string
  created_at: string
  is_read: boolean
}

interface DutiesTabProps {
  token: string
  teacherId: string
  schoolId: string
}

export default function DutiesTab({ token, teacherId, schoolId }: DutiesTabProps) {
  const [duties, setDuties] = useState<DutyItem[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [reportText, setReportText] = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)
  const [reportSaved, setReportSaved] = useState(false)
  const [activeDuty, setActiveDuty] = useState<DutyItem | null>(null)

  useEffect(() => {
    loadDuties()
  }, [teacherId])

  async function loadDuties() {
    try {
      const [dutiesRes, noticesRes] = await Promise.allSettled([
        fetch(`/api/teacher/duties?token=${encodeURIComponent(token)}&teacherId=${encodeURIComponent(teacherId)}`),
        fetch(`/api/teacher/notices?token=${encodeURIComponent(token)}&teacherId=${encodeURIComponent(teacherId)}`),
      ])

      if (dutiesRes.status === 'fulfilled' && dutiesRes.value.ok) {
        const data = await dutiesRes.value.json()
        setDuties(data.duties ?? [])
        // Check if any duty is today
        const today = new Date().toISOString().split('T')[0]
        const todayDuty = (data.duties ?? []).find((d: DutyItem) => d.duty_date === today)
        if (todayDuty) setActiveDuty(todayDuty)
      }

      if (noticesRes.status === 'fulfilled' && noticesRes.value.ok) {
        const data = await noticesRes.value.json()
        setNotices(data.notices ?? [])
      }
    } catch { /* ignore */ }

    setLoading(false)
  }

  async function submitReport() {
    if (!activeDuty || !reportText.trim()) return
    setSubmittingReport(true)

    try {
      const res = await fetch('/api/teacher/duty-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          duty_id: activeDuty.id,
          teacher_id: teacherId,
          school_id: schoolId,
          report: reportText,
          date: activeDuty.duty_date,
        }),
      })

      if (res.ok) {
        setReportSaved(true)
        setReportText('')
        setTimeout(() => setReportSaved(false), 3000)
      } else {
        alert('Failed to submit report')
      }
    } catch {
      alert('Network error. Please try again.')
    } finally {
      setSubmittingReport(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const upcomingDuties = duties.filter(d => d.duty_date >= today).slice(0, 5)

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
        Loading duties...
      </div>
    )
  }

  return (
    <div>
      {/* Today's duty alert */}
      {activeDuty && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 12,
          padding: '14px 16px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
            🔔 You have a duty today!
          </div>
          <div style={{ fontSize: 13, color: '#78350f' }}>
            {activeDuty.duty_type} {activeDuty.location ? `· ${activeDuty.location}` : ''}
          </div>
          {activeDuty.description && (
            <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>{activeDuty.description}</div>
          )}

          {/* Duty report form */}
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
              Submit Duty Report
            </label>
            <textarea
              value={reportText}
              onChange={e => setReportText(e.target.value)}
              placeholder="Describe what happened during your duty..."
              rows={3}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #fbbf24',
                borderRadius: 8, fontSize: 12, resize: 'none', outline: 'none',
                background: 'white', boxSizing: 'border-box',
              }}
            />
            {reportSaved && (
              <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, marginTop: 4 }}>
                ✓ Report submitted
              </div>
            )}
            <button
              onClick={submitReport}
              disabled={submittingReport || !reportText.trim()}
              style={{
                marginTop: 8, padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: reportText.trim() ? '#d97706' : '#d1d5db',
                color: 'white', border: 'none',
                cursor: reportText.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              {submittingReport ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </div>
      )}

      {/* Upcoming duties */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 10 }}>
          Upcoming Duties
        </h3>
        {upcomingDuties.length === 0 ? (
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            No upcoming duties scheduled
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcomingDuties.map(duty => (
              <div
                key={duty.id}
                style={{
                  background: duty.duty_date === today ? '#fef9f0' : 'white',
                  border: `1px solid ${duty.duty_date === today ? '#fbbf24' : '#e5e7eb'}`,
                  borderRadius: 10, padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 44 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: duty.duty_date === today ? '#d97706' : '#6b7280' }}>
                    {new Date(duty.duty_date).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })}
                  </div>
                  <div style={{ fontSize: 9, color: '#9ca3af' }}>
                    {new Date(duty.duty_date).toLocaleDateString('en-KE', { weekday: 'short' })}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{duty.duty_type}</div>
                  {duty.location && <div style={{ fontSize: 11, color: '#6b7280' }}>{duty.location}</div>}
                  {duty.description && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{duty.description}</div>}
                </div>
                {duty.duty_date === today && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: '#fbbf24', color: 'white', padding: '2px 8px', borderRadius: 20 }}>
                    TODAY
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Messages from HOD / Administration */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 10 }}>
          Messages from Administration
        </h3>
        {notices.length === 0 ? (
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            No messages
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notices.map(notice => (
              <div
                key={notice.id}
                style={{
                  background: notice.is_read ? 'white' : '#f0f9ff',
                  border: `1px solid ${notice.is_read ? '#e5e7eb' : '#bae6fd'}`,
                  borderRadius: 10, padding: '12px 14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{notice.subject}</div>
                  {!notice.is_read && (
                    <span style={{ fontSize: 9, background: '#0891b2', color: 'white', padding: '2px 6px', borderRadius: 20, fontWeight: 700 }}>NEW</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{notice.message}</div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
                  From: {notice.from_role.replace(/_/g, ' ')} · {new Date(notice.created_at).toLocaleDateString('en-KE')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
