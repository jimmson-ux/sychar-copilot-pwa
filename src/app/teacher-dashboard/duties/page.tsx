'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Duty {
  id: string
  duty_type: string
  duty_date: string
  location?: string
  description?: string
  // from duty_assignments (via teacher-profile)
  time_slot?: string | null
  post?: string | null
  remarks?: string | null
}

function daysLabel(dateStr: string) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff === 0) return { label: 'TODAY', color: '#dc2626', bg: '#fee2e2' }
  if (diff === 1) return { label: 'Tomorrow', color: '#d97706', bg: '#fef9c3' }
  if (diff < 0) return { label: `${Math.abs(diff)}d ago`, color: '#9ca3af', bg: '#f3f4f6' }
  return { label: `In ${diff}d`, color: '#2176FF', bg: '#dbeafe' }
}

const DUTY_TYPE_ICON: Record<string, string> = {
  morning: '🌅',
  gate: '🚪',
  dining: '🍽️',
  prep: '📖',
  games: '⚽',
  evening: '🌙',
  weekend: '📅',
  patrol: '🔦',
}

export default function DutiesPage() {
  const router = useRouter()
  const [duties, setDuties] = useState<Duty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')

  useEffect(() => {
    const token = localStorage.getItem('sychar_teacher_token') ?? ''
    const staffId = localStorage.getItem('sychar_staff_id') ?? ''
    if (!token || !staffId) { router.push('/teacher-login'); return }
    fetchDuties(token, staffId)
  }, [router])

  async function fetchDuties(token: string, teacherId: string) {
    setLoading(true)
    setError('')
    try {
      // Use teacher-profile for duty_assignments (richer data, wider window)
      const profileRes = await fetch(`/api/teacher-profile?staff_id=${teacherId}`)
      if (profileRes.ok) {
        const profileData = await profileRes.json()
        const profileDuties: Duty[] = (profileData.duties ?? []).map((d: {
          id: string; duty_type: string; duty_date: string;
          time_slot?: string | null; post?: string | null; remarks?: string | null;
        }) => ({
          id: d.id,
          duty_type: d.duty_type,
          duty_date: d.duty_date,
          time_slot: d.time_slot,
          post: d.post,
          remarks: d.remarks,
        }))
        setDuties(profileDuties)
        return
      }
      // Fallback to teacher-specific endpoint
      const res = await fetch(`/api/teacher/duties?token=${encodeURIComponent(token)}&teacherId=${teacherId}`)
      const data = await res.json()
      setDuties(data.duties ?? [])
    } catch {
      setError('Network error — check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const upcoming = duties.filter(d => d.duty_date >= today).sort((a, b) => a.duty_date.localeCompare(b.duty_date))
  const past = duties.filter(d => d.duty_date < today).sort((a, b) => b.duty_date.localeCompare(a.duty_date))
  const displayed = view === 'upcoming' ? upcoming : past

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          Duty Roster
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Your assigned duties — past and upcoming
        </p>
      </div>

      {/* Stats + toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ background: 'white', borderRadius: 14, padding: '12px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>Upcoming </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>{loading ? '—' : upcoming.length}</span>
        </div>
        <div style={{ background: 'white', borderRadius: 14, padding: '12px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>Past (30d) </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>{loading ? '—' : past.length}</span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3, gap: 2 }}>
          {(['upcoming', 'past'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                background: view === v ? 'white' : 'transparent',
                color: view === v ? '#111827' : '#6b7280',
                boxShadow: view === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ background: 'white', borderRadius: 16, padding: 40, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: 'var(--role-primary,#22c55e)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: '#6b7280' }}>Loading duties…</p>
        </div>
      ) : error ? (
        <div style={{ background: 'white', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
          <p style={{ fontSize: 13, color: '#dc2626' }}>{error}</p>
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 16, padding: 40, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <p style={{ fontSize: 14, color: '#6b7280' }}>
            {view === 'upcoming' ? 'No upcoming duties assigned.' : 'No past duties found.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {displayed.map(duty => {
            const badge = daysLabel(duty.duty_date)
            const icon = DUTY_TYPE_ICON[duty.duty_type?.toLowerCase()] ?? '📋'
            const isPast = duty.duty_date < today
            return (
              <div key={duty.id} style={{
                background: 'white', borderRadius: 16, padding: '16px 20px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                opacity: isPast ? 0.75 : 1,
                display: 'flex', alignItems: 'flex-start', gap: 16,
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                  {icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif', textTransform: 'capitalize' }}>
                      {duty.duty_type} Duty
                    </span>
                    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                    {new Date(duty.duty_date).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    {duty.time_slot && <span> · {duty.time_slot}</span>}
                  </div>
                  {(duty.post || duty.location) && (
                    <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
                      📍 {duty.post ?? duty.location}
                    </div>
                  )}
                  {(duty.remarks || duty.description) && (
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, fontStyle: 'italic' }}>
                      {duty.remarks ?? duty.description}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
