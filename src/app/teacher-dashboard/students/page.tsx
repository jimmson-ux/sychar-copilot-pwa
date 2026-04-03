'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Student {
  id: string
  full_name: string
  admission_number: string
  gender: string
}

export default function StudentsPage() {
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [className, setClassName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('sychar_teacher_token') ?? ''
    const cls = localStorage.getItem('sychar_class') ?? ''
    if (!token) { router.push('/teacher-login'); return }
    setClassName(cls)
    if (!cls) { setLoading(false); return }
    fetchStudents(token, cls)
  }, [router])

  async function fetchStudents(token: string, cls: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/teacher/students?token=${encodeURIComponent(token)}&className=${encodeURIComponent(cls)}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setStudents(data.students ?? [])
    } catch {
      setError('Network error — check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const filtered = students.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.admission_number.toLowerCase().includes(search.toLowerCase())
  )

  const boys = students.filter(s => s.gender?.toLowerCase() === 'male').length
  const girls = students.filter(s => s.gender?.toLowerCase() === 'female').length

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          My Students
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          {className ? `Class: ${className}` : 'No class assigned'}
        </p>
      </div>

      {!className && !loading && (
        <div style={{ background: 'white', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
          <p style={{ fontSize: 14, color: '#6b7280' }}>No class assigned to your account. Contact your administrator.</p>
        </div>
      )}

      {className && (
        <>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Students', value: students.length, icon: '👥' },
              { label: 'Boys', value: boys, icon: '🧑' },
              { label: 'Girls', value: girls, icon: '👧' },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'white', borderRadius: 14, padding: '14px 20px', flex: '1 1 120px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 22 }}>{stat.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif', marginTop: 4 }}>
                  {loading ? '—' : stat.value}
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Search by name or admission number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '10px 16px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 12, outline: 'none', boxSizing: 'border-box', background: 'white' }}
            />
          </div>

          {/* List */}
          <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: 'var(--role-primary,#22c55e)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                <p style={{ fontSize: 13, color: '#6b7280' }}>Loading students…</p>
              </div>
            ) : error ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
                <p style={{ fontSize: 13, color: '#dc2626' }}>{error}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
                <p style={{ fontSize: 13, color: '#6b7280' }}>{search ? 'No students match your search.' : 'No students found in this class.'}</p>
              </div>
            ) : (
              <>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr auto auto', gap: 12, padding: '10px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  <div>#</div>
                  <div>Name</div>
                  <div>Adm. No.</div>
                  <div>Gender</div>
                </div>
                {filtered.map((student, idx) => (
                  <div key={student.id} style={{ display: 'grid', gridTemplateColumns: '48px 1fr auto auto', gap: 12, padding: '12px 20px', borderBottom: idx < filtered.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{idx + 1}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{student.full_name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>{student.admission_number}</div>
                    <div>
                      <span style={{
                        padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: student.gender?.toLowerCase() === 'female' ? '#fce7f3' : '#dbeafe',
                        color: student.gender?.toLowerCase() === 'female' ? '#be185d' : '#1d4ed8',
                      }}>
                        {student.gender || '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
