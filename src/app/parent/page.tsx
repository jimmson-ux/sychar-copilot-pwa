'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const G = '#16a34a'
const GL = '#15803d'

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

function normalizePhone(raw: string) {
  const d = raw.replace(/\D/g, '')
  if (d.startsWith('254')) return '+' + d
  if (d.startsWith('0') && d.length === 10) return '+254' + d.slice(1)
  if (d.length === 9) return '+254' + d
  return '+' + d
}

export default function ParentLoginPage() {
  const router = useRouter()
  const [phone,      setPhone]      = useState('')
  const [schoolCode, setSchoolCode] = useState('')
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [step,       setStep]       = useState<'entry' | 'sending'>('entry')

  async function handleContinue() {
    setError('')
    const rawPhone = phone.trim()
    const code     = schoolCode.trim().toUpperCase()

    if (!rawPhone || !code) { setError('Enter your phone number and school code.'); return }
    if (code.length !== 4)  { setError('School code is 4 digits (e.g. 1834).'); return }

    setLoading(true)
    setStep('sending')

    try {
      const normPhone = normalizePhone(rawPhone)

      // Step 1: check phone + school code
      const checkRes = await fetch('/api/parent/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normPhone, schoolCode: code }),
      })
      const checkData = await checkRes.json()

      if (!checkRes.ok || !checkData.found) {
        setError(checkData.error ?? checkData.message ?? 'Phone not registered at this school.')
        setStep('entry')
        setLoading(false)
        return
      }

      const schoolId = checkData.schoolId as string
      const firstId  = checkData.students?.[0]?.id as string

      if (!firstId) {
        setError('No student linked to this phone number at this school.')
        setStep('entry')
        setLoading(false)
        return
      }

      const _ctx = btoa(JSON.stringify({ school_id: schoolId, student_id: firstId }))

      // Step 2: request OTP (returned directly — no WhatsApp)
      const otpRes  = await fetch('/api/parent/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _ctx }),
      })
      const otpData = await otpRes.json()

      if (!otpRes.ok) {
        setError(otpData.error ?? 'Login failed. Try again.')
        setStep('entry')
        setLoading(false)
        return
      }

      // Step 3: auto-verify with the returned OTP (zero-friction)
      const verifyRes = await fetch('/api/parent/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normPhone, otp: otpData.otp, school_id: schoolId }),
      })
      const verifyData = await verifyRes.json()

      if (!verifyRes.ok) {
        // Fallback: let user enter code manually
        sessionStorage.setItem('parent_auth', JSON.stringify({ phone: normPhone, schoolId, _ctx }))
        router.push('/parent/verify')
        return
      }

      localStorage.setItem('parent_token',      verifyData.token)
      localStorage.setItem('parent_school_id',  schoolId)
      localStorage.setItem('parent_student_ids', JSON.stringify(verifyData.student_ids))
      router.replace('/parent/dashboard')

    } catch {
      setError('Network error. Check your connection.')
      setStep('entry')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <Logo />

        <div style={{ background: 'white', borderRadius: 20, padding: '28px 24px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 20, marginTop: 0 }}>
            {step === 'sending' ? 'Sending OTP…' : 'Sign In'}
          </h2>

          {step === 'entry' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="07XX XXX XXX"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleContinue()}
                  inputMode="tel"
                  style={{ width: '100%', border: '1.5px solid #d1d5db', borderRadius: 10, padding: '12px 14px', fontSize: 16, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                  School Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1834"
                  value={schoolCode}
                  onChange={e => setSchoolCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleContinue()}
                  maxLength={4}
                  inputMode="numeric"
                  style={{ width: '100%', border: '1.5px solid #d1d5db', borderRadius: 10, padding: '12px 14px', fontSize: 16, letterSpacing: '0.15em', boxSizing: 'border-box', outline: 'none' }}
                />
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '5px 0 0' }}>
                  Get this 4-digit code from your school secretary.
                </p>
              </div>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
                  {error}
                </div>
              )}

              <button
                onClick={handleContinue}
                disabled={loading}
                style={{ width: '100%', padding: '14px', background: loading ? '#86efac' : G, color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading ? 'Checking…' : 'Continue'}
              </button>
            </>
          )}

          {step === 'sending' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🔑</div>
              <p style={{ color: '#374151', fontSize: 14 }}>
                Signing you in…
              </p>
              <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 8 }}>
                You will be redirected automatically.
              </p>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 24 }}>
          Your phone must be registered by the school to access this portal.
        </p>
      </div>
    </div>
  )
}
