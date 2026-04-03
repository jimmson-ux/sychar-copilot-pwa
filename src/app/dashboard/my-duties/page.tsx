'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface Duty {
  id: string
  duty_date: string
  duty_type: string
  time_slot: string | null
  post: string | null
  remarks: string | null
}

export default function MyDutiesPage() {
  const [duties, setDuties] = useState<Duty[]>([])
  const [staffId, setStaffId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: staff } = await supabase
        .from('staff_records')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!staff?.id) { setError('Staff profile not found.'); setLoading(false); return }
      setStaffId(staff.id)

      const res = await fetch(`/api/duties?teacher_id=${staff.id}`)
      if (!res.ok) { setError('Failed to load duties.'); setLoading(false); return }
      const json = await res.json()
      setDuties(json.duties ?? [])
      setLoading(false)
    }
    load()
  }, [router])

  const upcoming = duties.filter(d => d.duty_date >= new Date().toISOString().split('T')[0])
  const past     = duties.filter(d => d.duty_date <  new Date().toISOString().split('T')[0])

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', marginBottom: 4 }}>My Duty Schedule</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>Duties assigned to you by school leadership</p>

      {loading && <div style={{ color: '#9ca3af', fontSize: 14, paddingTop: 40, textAlign: 'center' }}>Loading…</div>}
      {error   && <div style={{ color: '#dc2626', fontSize: 14, paddingTop: 40, textAlign: 'center' }}>{error}</div>}

      {!loading && !error && (
        <>
          <Section title="Upcoming duties" duties={upcoming} empty="No upcoming duties assigned." />
          {past.length > 0 && <Section title="Past duties" duties={past} empty="" />}
        </>
      )}
    </div>
  )
}

function Section({ title, duties, empty }: { title: string; duties: Duty[]; empty: string }) {
  if (duties.length === 0 && empty) {
    return (
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>{title}</h2>
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '24px 0', textAlign: 'center',
          border: '1px dashed #e5e7eb', borderRadius: 10 }}>{empty}</div>
      </div>
    )
  }
  if (duties.length === 0) return null
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {duties.map(d => (
          <div key={d.id} style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px',
            display: 'flex', alignItems: 'flex-start', gap: 14,
          }}>
            <div style={{
              minWidth: 52, height: 52, borderRadius: 8, background: '#f0fdf4',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>
                {new Date(d.duty_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              </span>
              <span style={{ fontSize: 10, color: '#6b7280' }}>
                {new Date(d.duty_date).toLocaleDateString('en-GB', { weekday: 'short' })}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', textTransform: 'capitalize' }}>
                {d.duty_type.replace(/_/g, ' ')}
              </div>
              {d.time_slot && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{d.time_slot}</div>}
              {d.post     && <div style={{ fontSize: 12, color: '#6b7280' }}>Post: {d.post}</div>}
              {d.remarks  && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, fontStyle: 'italic' }}>{d.remarks}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
