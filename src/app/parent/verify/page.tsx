'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const G = '#16a34a'

export default function ParentVerifyPage() {
  const router     = useRouter()
  const inputRefs  = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
                      useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]
  const [digits,   setDigits]   = useState(['', '', '', '', '', ''])
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [resent,   setResent]   = useState(false)
  const [ctx,      setCtx]      = useState<{ phone: string; schoolId: string; _ctx: string } | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('parent_auth')
    if (!raw) { router.replace('/parent'); return }
    try { setCtx(JSON.parse(raw)) } catch { router.replace('/parent') }
    inputRefs[0].current?.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDigit(i: number, val: string) {
    const d = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = d
    setDigits(next)
    if (d && i < 5) inputRefs[i + 1].current?.focus()
    if (next.every(x => x) && next.join('').length === 6) {
      verify(next.join(''))
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs[i - 1].current?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) {
      setDigits(text.split(''))
      verify(text)
    }
  }

  async function verify(otp: string) {
    if (!ctx) return
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/parent/auth/verify-otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone: ctx.phone, otp, school_id: ctx.schoolId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Invalid OTP. Try again.')
        setDigits(['', '', '', '', '', ''])
        inputRefs[0].current?.focus()
        setLoading(false)
        return
      }
      localStorage.setItem('parent_token',     data.token)
      localStorage.setItem('parent_school_id', ctx.schoolId)
      localStorage.setItem('parent_student_ids', JSON.stringify(data.student_ids))
      sessionStorage.removeItem('parent_auth')
      router.replace('/parent/dashboard')
    } catch {
      setError('Network error. Check your connection.')
      setLoading(false)
    }
  }

  async function resendOtp() {
    if (!ctx || resent) return
    try {
      await fetch('/api/parent/auth/request-otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ _ctx: ctx._ctx }),
      })
      setResent(true)
      setDigits(['', '', '', '', '', ''])
      setTimeout(() => setResent(false), 60000)
    } catch {
      setError('Could not resend. Try again.')
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#14532d', margin: 0 }}>Check WhatsApp</h1>
          <p style={{ fontSize: 13, color: '#4b7a5e', margin: '6px 0 0' }}>
            Enter the 6-digit code sent to<br />
            <strong>{ctx?.phone ?? '…'}</strong>
          </p>
        </div>

        <div style={{ background: 'white', borderRadius: 20, padding: '28px 24px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={inputRefs[i]}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={e => handleDigit(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                onPaste={handlePaste}
                disabled={loading}
                style={{
                  width: 44, height: 52, textAlign: 'center', fontSize: 22, fontWeight: 700,
                  border: `2px solid ${d ? G : '#d1d5db'}`, borderRadius: 10, outline: 'none',
                  background: loading ? '#f9fafb' : 'white', color: '#111827',
                  transition: 'border-color 0.15s',
                }}
              />
            ))}
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', color: G, fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
              Verifying…
            </div>
          )}

          <button
            onClick={() => verify(digits.join(''))}
            disabled={loading || digits.join('').length < 6}
            style={{ width: '100%', padding: '14px', background: digits.join('').length === 6 && !loading ? G : '#d1d5db', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: digits.join('').length === 6 ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}
          >
            Verify Code
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={resendOtp}
            disabled={resent}
            style={{ background: 'none', border: 'none', color: resent ? '#9ca3af' : G, fontSize: 13, fontWeight: 600, cursor: resent ? 'default' : 'pointer' }}
          >
            {resent ? 'Code sent! Wait 60s to resend.' : 'Resend Code'}
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button
            onClick={() => router.replace('/parent')}
            style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 12, cursor: 'pointer' }}
          >
            ← Use a different phone number
          </button>
        </div>
      </div>
    </div>
  )
}
