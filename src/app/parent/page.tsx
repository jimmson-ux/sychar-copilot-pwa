'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const G  = '#16a34a'
const GL = '#15803d'

// Ephemeral Supabase client for Google OAuth — separate key, never touches staff cookies
function getParentSbClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { storageKey: 'parent_sb_auth', persistSession: true } },
  )
}

function normalizePhone(raw: string) {
  const d = raw.replace(/\D/g, '')
  if (d.startsWith('254')) return '+' + d
  if (d.startsWith('0') && d.length === 10) return '+254' + d.slice(1)
  if (d.length === 9) return '+254' + d
  return '+' + d
}

function Logo() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, background: G, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 32 }}>🏫</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#14532d', margin: 0 }}>Sychar Parent</h1>
      <p style={{ fontSize: 13, color: '#4b7a5e', margin: '4px 0 0' }}>Your child's school in your pocket</p>
    </div>
  )
}

type Method = 'google' | 'phone'

export default function ParentLoginPage() {
  const router = useRouter()
  const [method,     setMethod]     = useState<Method>('google')
  const [schoolCode, setSchoolCode] = useState('')
  const [phone,      setPhone]      = useState('')
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)

  // ── Google OAuth ─────────────────────────────────────────────────────────────
  async function handleGoogle() {
    setError('')
    const code = schoolCode.trim().toUpperCase()
    if (!code || code.length !== 4) {
      setError('Enter your 4-digit school code first.')
      return
    }
    setLoading(true)
    sessionStorage.setItem('parent_google_school_code', code)

    const sb       = getParentSbClient()
    const origin   = window.location.origin
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:  `${origin}/parent/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success the browser redirects — no further action needed here
  }

  // ── Phone fallback ────────────────────────────────────────────────────────────
  async function handlePhone() {
    setError('')
    const rawPhone = phone.trim()
    const code     = schoolCode.trim().toUpperCase()

    if (!rawPhone || !code) { setError('Enter your phone number and school code.'); return }
    if (code.length !== 4)  { setError('School code is 4 digits (e.g. 1834).'); return }

    setLoading(true)
    try {
      const normPhone = normalizePhone(rawPhone)

      const checkRes  = await fetch('/api/parent/auth/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normPhone, schoolCode: code }),
      })
      const checkData = await checkRes.json()

      if (!checkRes.ok || !checkData.found) {
        setError(checkData.error ?? checkData.message ?? 'Phone not registered at this school.')
        setLoading(false)
        return
      }

      const schoolId = checkData.schoolId as string
      const firstId  = checkData.students?.[0]?.id as string
      if (!firstId) {
        setError('No student linked to this phone number.')
        setLoading(false)
        return
      }

      const _ctx = btoa(JSON.stringify({ school_id: schoolId, student_id: firstId }))

      const otpRes  = await fetch('/api/parent/auth/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _ctx }),
      })
      const otpData = await otpRes.json()

      if (!otpRes.ok) {
        setError(otpData.error ?? 'Login failed. Try again.')
        setLoading(false)
        return
      }

      const verifyRes = await fetch('/api/parent/auth/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normPhone, otp: otpData.otp, school_id: schoolId }),
      })
      const verifyData = await verifyRes.json()

      if (!verifyRes.ok) {
        sessionStorage.setItem('parent_auth', JSON.stringify({ phone: normPhone, schoolId, _ctx }))
        router.push('/parent/verify')
        return
      }

      localStorage.setItem('parent_token',       verifyData.token)
      localStorage.setItem('parent_school_id',   schoolId)
      localStorage.setItem('parent_student_ids', JSON.stringify(verifyData.student_ids))
      router.replace('/parent/dashboard')
    } catch {
      setError('Network error. Check your connection.')
      setLoading(false)
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', border: 'none', borderRadius: 10,
    background: active ? G : 'transparent',
    color: active ? 'white' : '#6b7280',
    fontWeight: active ? 700 : 500, fontSize: 14, cursor: 'pointer',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <Logo />

        <div style={{ background: 'white', borderRadius: 20, padding: '24px 24px 28px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>

          {/* Tab switcher */}
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 12, padding: 4, marginBottom: 24, gap: 4 }}>
            <button style={tabStyle(method === 'google')} onClick={() => { setMethod('google'); setError('') }}>
              Google
            </button>
            <button style={tabStyle(method === 'phone')} onClick={() => { setMethod('phone'); setError('') }}>
              Phone
            </button>
          </div>

          {/* School code — shared between both methods */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
              School Code
            </label>
            <input
              type="text"
              placeholder="e.g. 1834"
              value={schoolCode}
              onChange={e => setSchoolCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (method === 'google' ? handleGoogle() : handlePhone())}
              maxLength={4}
              inputMode="numeric"
              style={{ width: '100%', border: '1.5px solid #d1d5db', borderRadius: 10, padding: '12px 14px', fontSize: 16, letterSpacing: '0.15em', boxSizing: 'border-box', outline: 'none' }}
            />
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '5px 0 0' }}>
              Get this 4-digit code from your school secretary.
            </p>
          </div>

          {/* Google method */}
          {method === 'google' && (
            <button
              onClick={handleGoogle}
              disabled={loading}
              style={{ width: '100%', padding: '13px 16px', background: loading ? '#f3f4f6' : 'white', color: '#374151', border: '1.5px solid #d1d5db', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'background 0.15s' }}
            >
              {/* Google "G" icon */}
              {!loading && (
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {loading ? 'Redirecting to Google…' : 'Continue with Google'}
            </button>
          )}

          {/* Phone method */}
          {method === 'phone' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="07XX XXX XXX"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePhone()}
                  inputMode="tel"
                  style={{ width: '100%', border: '1.5px solid #d1d5db', borderRadius: 10, padding: '12px 14px', fontSize: 16, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>

              <button
                onClick={handlePhone}
                disabled={loading}
                style={{ width: '100%', padding: '14px', background: loading ? '#86efac' : G, color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading ? 'Signing in…' : 'Continue'}
              </button>
            </>
          )}

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16, fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 24 }}>
          Your phone or email must be registered by the school to access this portal.
        </p>
      </div>
    </div>
  )
}
