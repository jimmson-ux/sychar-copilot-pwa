'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const ROLE_LABELS: Record<string, string> = {
  principal: 'Principal',
  deputy_principal_academics: 'Deputy Principal (Academics)',
  deputy_principal_discipline: 'Deputy Principal (Discipline)',
  dean_of_studies: 'Dean of Studies',
  dean_of_students: 'Dean of Students',
  hod_subjects: 'Head of Department',
  hod_pathways: 'HOD Pathways',
  class_teacher: 'Class Teacher',
  bom_teacher: 'BOM Teacher',
  bursar: 'Bursar',
  guidance_counselling: 'Guidance & Counselling',
  storekeeper: 'Storekeeper',
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

interface ProfileField {
  label: string
  value: string
  icon: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [staffName, setStaffName] = useState('')
  const [role, setRole] = useState('')
  const [subject, setSubject] = useState('')
  const [department, setDepartment] = useState('')
  const [className, setClassName] = useState('')
  const [photo, setPhoto] = useState('')
  const [token, setToken] = useState('')
  const [staffId, setStaffId] = useState('')

  useEffect(() => {
    const tok = localStorage.getItem('sychar_teacher_token') ?? ''
    if (!tok) { router.push('/teacher-login'); return }
    setToken(tok)
    setStaffName(localStorage.getItem('sychar_staff_name') ?? '')
    setRole(localStorage.getItem('sychar_role') ?? '')
    setSubject(localStorage.getItem('sychar_subject') ?? '')
    setDepartment(localStorage.getItem('sychar_department') ?? '')
    setClassName(localStorage.getItem('sychar_class') ?? '')
    setPhoto(localStorage.getItem('sychar_photo') ?? '')
    setStaffId(localStorage.getItem('sychar_staff_id') ?? '')
  }, [router])

  function handleSignOut() {
    ['sychar_teacher_token','sychar_staff_id','sychar_role','sychar_staff_name',
     'sychar_department','sychar_subject','sychar_class','sychar_photo','sychar_token_id',
     'sychar_school_id'].forEach(k => localStorage.removeItem(k))
    router.push('/teacher-login')
  }

  const roleColor = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--role-primary').trim() || '#22c55e'
    : '#22c55e'

  const fields: ProfileField[] = [
    { label: 'Full Name', value: staffName || '—', icon: '👤' },
    { label: 'Role', value: ROLE_LABELS[role] ?? role ?? '—', icon: '🏷️' },
    { label: 'Subject', value: subject || '—', icon: '📚' },
    { label: 'Department', value: department || '—', icon: '🏢' },
    { label: 'Class', value: className || '—', icon: '🏫' },
    { label: 'Staff ID', value: staffId || '—', icon: '🔑' },
  ]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 700, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          Settings
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Your account information</p>
      </div>

      {/* Avatar card */}
      <div style={{ background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9', marginBottom: 16 }}>
        <div style={{ height: 6, background: `linear-gradient(90deg, var(--role-primary,#22c55e), var(--role-primary,#22c55e)66)` }} />
        <div style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: 20 }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={staffName} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid #f1f5f9', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--role-primary,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: 'white', fontFamily: 'Space Grotesk, sans-serif', flexShrink: 0 }}>
              {getInitials(staffName || 'TE')}
            </div>
          )}
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>{staffName || '—'}</div>
            <div style={{ fontSize: 13, color: 'var(--role-primary,#22c55e)', fontWeight: 600, marginTop: 3 }}>{ROLE_LABELS[role] ?? role}</div>
          </div>
        </div>
      </div>

      {/* Profile fields */}
      <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9', overflow: 'hidden', marginBottom: 16 }}>
        {fields.map((field, idx) => (
          <div key={field.label} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '14px 20px',
            borderBottom: idx < fields.length - 1 ? '1px solid #f8fafc' : 'none',
          }}>
            <span style={{ fontSize: 18, width: 28, textAlign: 'center', flexShrink: 0 }}>{field.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{field.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginTop: 1 }}>{field.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Read-only notice */}
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 20 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>ℹ️</span>
        <p style={{ fontSize: 13, color: '#92400e', margin: 0, lineHeight: 1.6 }}>
          Your profile details are managed by the school administrator. To update your name, subject, class, or photo, contact your HOD or the school office.
        </p>
      </div>

      {/* Session info */}
      <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9', padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Session</div>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          Signed in via secure access link. Your session is tied to this device.
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: '#9ca3af', fontFamily: 'monospace', wordBreak: 'break-all' }}>
          Token: {token ? `${token.slice(0, 12)}…` : '—'}
        </div>
      </div>

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        style={{
          width: '100%', padding: '14px', borderRadius: 14,
          background: '#fef2f2', border: '1px solid #fecaca',
          color: '#dc2626', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')}
        onMouseLeave={e => (e.currentTarget.style.background = '#fef2f2')}
      >
        <span>🚪</span> Sign Out
      </button>
    </div>
  )
}
