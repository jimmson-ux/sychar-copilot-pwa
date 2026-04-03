'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

interface TeacherInfo {
  id: string
  full_name: string
  email: string
  phone: string
  role: string
  department: string
  subject: string
  class_name: string
  tsc_number: string
  photo_url: string
}

interface TokenData {
  valid: boolean
  token_id?: string
  expires_at?: string
  uses_remaining?: number
  teacher?: TeacherInfo
  error?: string
}

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

const ROLE_COLORS: Record<string, string> = {
  principal: '#B51A2B',
  deputy_principal_academics: '#09D1C7',
  deputy_principal_discipline: '#DC586D',
  dean_of_studies: '#7C3AED',
  dean_of_students: '#0F766E',
  hod_subjects: '#09D1C7',
  hod_pathways: '#2176FF',
  class_teacher: '#22c55e',
  bom_teacher: '#22c55e',
  bursar: '#2176FF',
  guidance_counselling: '#D97706',
  storekeeper: '#6B7280',
}

function similarity(typed: string, full: string): number {
  const a = typed.toLowerCase().trim()
  const b = full.toLowerCase().trim()
  if (!a) return 0
  if (a === b) return 1
  if (b.includes(a) || a.includes(b)) return 0.9
  const words1 = a.split(/\s+/)
  const words2 = b.split(/\s+/)
  let matches = 0
  for (const w of words1) {
    if (w.length < 2) continue
    if (words2.some(w2 => w2.startsWith(w) || w.startsWith(w2))) matches++
  }
  return words1.length > 0 ? matches / Math.max(words1.length, words2.length) : 0
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function TeacherLoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [status, setStatus] = useState<'loading' | 'invalid' | 'valid' | 'success'>('loading')
  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [nameScore, setNameScore] = useState(0)
  const [nameBlurred, setNameBlurred] = useState(false)
  const [entering, setEntering] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }
    validateToken()
  }, [token])

  async function validateToken() {
    try {
      const res = await fetch(`/api/validate-teacher-token?token=${encodeURIComponent(token)}`)
      const data: TokenData = await res.json()
      setTokenData(data)
      setStatus(data.valid ? 'valid' : 'invalid')
      if (data.valid) setTimeout(() => inputRef.current?.focus(), 300)
    } catch {
      setStatus('invalid')
    }
  }

  function handleNameChange(val: string) {
    setNameInput(val)
    const score = similarity(val, tokenData?.teacher?.full_name ?? '')
    setNameScore(score)
  }

  function handleAccess() {
    if (nameScore < 0.5 || !tokenData?.teacher) return
    setEntering(true)
    const t = tokenData.teacher
    localStorage.setItem('sychar_teacher_token', token)
    localStorage.setItem('sychar_token_id', tokenData.token_id ?? '')
    localStorage.setItem('sychar_staff_id', t.id)
    localStorage.setItem('sychar_role', t.role)
    localStorage.setItem('sychar_staff_name', t.full_name)
    localStorage.setItem('sychar_department', t.department)
    localStorage.setItem('sychar_subject', t.subject)
    localStorage.setItem('sychar_class', t.class_name)
    localStorage.setItem('sychar_photo', t.photo_url ?? '')
    setStatus('success')
    setTimeout(() => router.push('/teacher-dashboard'), 800)
  }

  const teacher = tokenData?.teacher
  const roleColor = ROLE_COLORS[teacher?.role ?? ''] ?? '#22c55e'
  const nameMatch = nameScore >= 0.5
  const nameError = nameBlurred && nameInput.length > 2 && !nameMatch

  // ── Loading ───────────────────────────────────────────────────────────────
  if (status === 'loading') return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: '4px solid #e5e7eb', borderTopColor: '#0891b2', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ fontSize: 14, color: '#6b7280' }}>Validating your access link…</p>
      </div>
    </div>
  )

  // ── Invalid ───────────────────────────────────────────────────────────────
  if (status === 'invalid' || !teacher) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 40, maxWidth: 380, width: '100%', textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.1)', border: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 8, fontFamily: 'Space Grotesk, sans-serif' }}>
          Invalid or expired link
        </h2>
        <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
          {tokenData?.error === 'expired' ? 'This link has expired.' :
           tokenData?.error === 'revoked' ? 'This link has been revoked.' :
           tokenData?.error === 'limit_reached' ? 'This link has reached its usage limit.' :
           'This link is invalid or no longer active.'}
          <br />Contact your HOD or administrator for a new link.
        </p>
        <button onClick={() => router.push('/login')} style={{ background: '#f3f4f6', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
          Go to Staff Login
        </button>
      </div>
    </div>
  )

  // ── Success ────────────────────────────────────────────────────────────────
  if (status === 'success') return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>
          Welcome, {teacher.full_name.split(' ')[0]}!
        </h2>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>Loading your dashboard…</p>
      </div>
    </div>
  )

  // ── Valid — Name Confirmation ──────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, position: 'relative', overflow: 'hidden' }}>
      {/* Background blobs */}
      <div style={{ position: 'absolute', top: -80, left: -80, width: 300, height: 300, borderRadius: '50%', background: `${roleColor}12`, filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -80, right: -80, width: 260, height: 260, borderRadius: '50%', background: `${roleColor}0a`, filter: 'blur(60px)', pointerEvents: 'none' }} />

      <div style={{ background: 'white', borderRadius: 24, width: '100%', maxWidth: 400, overflow: 'hidden', boxShadow: '0 16px 60px rgba(0,0,0,0.12)', border: '1px solid #f1f5f9', animation: 'fadeSlideUp 0.4s ease' }}>

        {/* Gradient header */}
        <div style={{ background: `linear-gradient(135deg, ${roleColor}, ${roleColor}99)`, padding: '24px 24px 40px', textAlign: 'center', position: 'relative' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Sychar Copilot · Secure Access
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
            Nkoroi Mixed Day Secondary School
          </div>
        </div>

        {/* Avatar — overlaps header */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: -36 }}>
          {teacher.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={teacher.photo_url} alt={teacher.full_name}
              style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
            />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: roleColor, border: '3px solid white', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: 'white', fontFamily: 'Space Grotesk, sans-serif' }}>
              {getInitials(teacher.full_name)}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 24px 28px' }}>
          {/* Name & role */}
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
              {teacher.full_name}
            </h2>
            <p style={{ fontSize: 13, color: roleColor, fontWeight: 600, marginTop: 3 }}>
              {ROLE_LABELS[teacher.role] ?? teacher.role}
            </p>
          </div>

          {/* Info chips */}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            {teacher.department && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#f3f4f6', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#374151' }}>
                🏢 {teacher.department}
              </span>
            )}
            {teacher.subject && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: `${roleColor}15`, borderRadius: 20, fontSize: 11, fontWeight: 600, color: roleColor }}>
                📚 {teacher.subject}
              </span>
            )}
            {teacher.class_name && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#f3f4f6', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#374151' }}>
                🏷 {teacher.class_name}
              </span>
            )}
          </div>

          {/* Name input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
              Type your full name to confirm identity
            </label>
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type="text"
                value={nameInput}
                onChange={e => handleNameChange(e.target.value)}
                onBlur={() => setNameBlurred(true)}
                onKeyDown={e => e.key === 'Enter' && nameMatch && handleAccess()}
                placeholder={`e.g. ${teacher.full_name.split(' ')[0]} ${teacher.full_name.split(' ')[1] ?? ''}`}
                style={{
                  width: '100%', padding: '11px 44px 11px 14px', fontSize: 13,
                  border: `1.5px solid ${nameMatch ? '#22c55e' : nameError ? '#dc2626' : '#e5e7eb'}`,
                  borderRadius: 12, outline: 'none', background: 'white', boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
              />
              {nameMatch && (
                <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18 }}>✅</span>
              )}
            </div>
            <p style={{ fontSize: 11, color: nameError ? '#dc2626' : '#9ca3af', marginTop: 4 }}>
              {nameError ? "Name doesn't match — please type your full name as registered." : "This confirms it's you accessing the portal"}
            </p>
          </div>

          {/* Access button */}
          <button
            onClick={handleAccess}
            disabled={!nameMatch || entering}
            style={{
              width: '100%', padding: '13px', borderRadius: 14,
              background: nameMatch ? `linear-gradient(135deg, ${roleColor}, ${roleColor}cc)` : '#e5e7eb',
              color: nameMatch ? 'white' : '#9ca3af',
              border: 'none', cursor: nameMatch ? 'pointer' : 'not-allowed',
              fontSize: 14, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif',
              transition: 'all 0.2s',
            }}
          >
            {entering ? 'Opening dashboard…' : 'Access My Dashboard →'}
          </button>

          {/* Footer meta */}
          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: '#9ca3af' }}>
            🔒 Secure link · Expires {tokenData?.expires_at ? new Date(tokenData.expires_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            {tokenData?.uses_remaining !== undefined && (
              <span> · {tokenData.uses_remaining} uses remaining</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TeacherLoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #e5e7eb', borderTopColor: '#0891b2', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <TeacherLoginInner />
    </Suspense>
  )
}
