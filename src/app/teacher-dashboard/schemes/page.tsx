'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Compliance {
  compliance_score: number
  has_scheme: boolean
  lesson_plans_count: number
  row_count: number
}

export default function SchemesPage() {
  const router = useRouter()
  const [compliance, setCompliance] = useState<Compliance | null>(null)
  const [loading, setLoading] = useState(true)
  const [staffName, setStaffName] = useState('')
  const [subject, setSubject] = useState('')
  const [storedToken, setStoredToken] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('sychar_teacher_token') ?? ''
    const staffId = localStorage.getItem('sychar_staff_id') ?? ''
    const name = localStorage.getItem('sychar_staff_name') ?? ''
    const subj = localStorage.getItem('sychar_subject') ?? ''
    if (!token || !staffId) { router.push('/teacher-login'); return }
    setStoredToken(token)
    setStaffName(name)
    setSubject(subj)
    fetchCompliance(staffId)
  }, [router])

  async function fetchCompliance(staffId: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/teacher-profile?staff_id=${staffId}`)
      if (res.ok) {
        const data = await res.json()
        setCompliance(data.compliance ?? null)
      }
    } catch { /* silent */ }
    setLoading(false)
  }

  const score = compliance?.compliance_score ?? 0
  const scoreColor = score >= 80 ? '#22c55e' : score >= 50 ? '#d97706' : '#dc2626'

  const items = [
    {
      label: 'Scheme of Work',
      status: loading ? null : compliance?.has_scheme,
      icon: '📖',
      description: 'Full term scheme covering all topics and objectives',
    },
    {
      label: 'Records of Work',
      status: loading ? null : (compliance?.row_count ?? 0) > 0,
      icon: '📋',
      description: `${loading ? '—' : compliance?.row_count ?? 0} entries recorded this term`,
    },
    {
      label: 'Lesson Plans',
      status: loading ? null : (compliance?.lesson_plans_count ?? 0) > 0,
      icon: '📝',
      description: `${loading ? '—' : compliance?.lesson_plans_count ?? 0} lesson plans on file`,
    },
  ]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          Schemes of Work
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          {subject ? `Subject: ${subject}` : 'Document compliance overview'}
        </p>
      </div>

      {/* Compliance score card */}
      <div style={{ background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9', marginBottom: 20 }}>
        <div style={{ height: 6, background: `linear-gradient(90deg, var(--role-primary,#22c55e), var(--role-primary,#22c55e)66)` }} />
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
                Compliance Score
              </div>
              <div style={{ fontSize: 48, fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif', color: loading ? '#d1d5db' : scoreColor, lineHeight: 1 }}>
                {loading ? '—' : `${score}%`}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: loading ? '0%' : `${score}%`, background: scoreColor, borderRadius: 4, transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                {score >= 80 ? 'Excellent — keep it up!' : score >= 50 ? 'Good — a few items still pending' : 'Needs attention — please update your documents'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {items.map(item => (
          <div key={item.label} style={{ background: 'white', borderRadius: 16, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 28 }}>{item.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{item.label}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{item.description}</div>
            </div>
            <div>
              {loading ? (
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#f3f4f6' }} />
              ) : item.status ? (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>✅</div>
              ) : (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⚠️</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Action card */}
      <div style={{ background: 'white', borderRadius: 20, padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>✏️</div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 6px', fontFamily: 'Space Grotesk, sans-serif' }}>
          Edit Schemes &amp; Records of Work
        </h2>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, lineHeight: 1.6 }}>
          Use the Record of Work portal to submit lesson records, upload schemes, and track your subject progress.
        </p>
        <a
          href={storedToken ? `/record?token=${storedToken}` : '#'}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            padding: '12px 28px',
            borderRadius: 12,
            background: 'var(--role-primary,#22c55e)',
            color: 'white',
            fontWeight: 700,
            fontSize: 14,
            textDecoration: 'none',
            fontFamily: 'Space Grotesk, sans-serif',
          }}
        >
          Open Record Portal →
        </a>
      </div>
    </div>
  )
}
