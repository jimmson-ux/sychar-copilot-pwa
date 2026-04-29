'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '../_components/BottomNav'

const G = '#16a34a'

export default function ParentProfilePage() {
  const router = useRouter()
  const [phone,    setPhone]    = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [count,    setCount]    = useState(0)

  useEffect(() => {
    if (!localStorage.getItem('parent_token')) { router.replace('/parent'); return }
    setPhone(localStorage.getItem('parent_token') ? '••••••••••' : '')
    setSchoolId(localStorage.getItem('parent_school_id') ?? '')
    try {
      const ids = JSON.parse(localStorage.getItem('parent_student_ids') ?? '[]')
      setCount(ids.length)
    } catch { setCount(0) }
  }, [router])

  function signOut() {
    localStorage.removeItem('parent_token')
    localStorage.removeItem('parent_school_id')
    localStorage.removeItem('parent_student_ids')
    router.replace('/parent')
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh', paddingBottom: 80 }}>
      <div style={{ background: G, padding: '20px 20px 48px', color: 'white' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Account</h2>
      </div>

      <div style={{ padding: '0 16px', marginTop: -28 }}>
        <div style={{ background: 'white', borderRadius: 16, padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
              👤
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: '#111827' }}>Parent Account</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>{count} child{count !== 1 ? 'ren' : ''} linked</p>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16 }}>
            {[
              { label: 'School ID', value: schoolId ? schoolId.slice(0, 8) + '…' : '—' },
              { label: 'Children', value: `${count} student${count !== 1 ? 's' : ''}` },
              { label: 'Session', value: 'Active' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                <span style={{ fontSize: 13, color: '#6b7280' }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={signOut}
          style={{ width: '100%', padding: '14px', background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          Sign Out
        </button>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', marginTop: 24 }}>
          Sychar CoPilot · Parent Portal v2
        </p>
      </div>

      <BottomNav />
    </div>
  )
}
