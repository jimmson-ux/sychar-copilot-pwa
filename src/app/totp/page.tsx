'use client'

// /totp — TOTP login page
// Staff enters email + 6-digit code from their authenticator app.

import { useState } from 'react'

export default function TOTPPage() {
  const [email,   setEmail]   = useState('')
  const [token,   setToken]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const r = await fetch('/api/auth/totp/verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: email.trim().toLowerCase(), token: token.trim() }),
    }).catch(() => null)

    if (!r) { setError('Network error. Please try again.'); setLoading(false); return }

    const d = await r.json() as {
      success?: boolean
      reason?: string
      actionLink?: string
      subRole?: string
      fullName?: string
      staffId?: string
      forcePasswordChange?: boolean
    }

    if (!d.success) {
      setError(
        d.reason === 'invalid_token'       ? 'Incorrect code. Try again (codes refresh every 30s).' :
        d.reason === 'totp_not_configured' ? 'TOTP not set up for this account. Contact your admin.' :
        d.reason === 'invalid_credentials' ? 'Email not found.' :
        'Verification failed. Please try again.',
      )
      setLoading(false)
      return
    }

    // Apply staff session hints
    if (d.subRole) {
      localStorage.setItem('sychar_role',     d.subRole)
      localStorage.setItem('sychar_name',     d.fullName ?? '')
      localStorage.setItem('sychar_staff_id', d.staffId ?? '')
      const opts = 'path=/; SameSite=Lax; max-age=86400'
      document.cookie = `sychar-role=${d.subRole}; ${opts}`
      document.cookie = `sychar-sub=active; ${opts}`
    }

    // Follow Supabase action link to create session
    if (d.actionLink) window.location.href = d.actionLink
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .inp {
          width: 100%; padding: 14px 16px;
          border: 1.5px solid #e5e7eb; border-radius: 12px;
          font-size: 15px; background: #fafafa;
          outline: none; transition: border-color .18s, box-shadow .18s;
        }
        .inp:focus {
          border-color: #1e40af;
          box-shadow: 0 0 0 3px rgba(30,64,175,.12);
          background: white;
        }
        .btn {
          width: 100%; padding: 15px;
          background: linear-gradient(135deg, #1e40af, #059669);
          color: white; border: none; border-radius: 12px;
          font-size: 15px; font-weight: 600; cursor: pointer;
          min-height: 52px;
        }
        .btn:disabled { opacity: .6; cursor: not-allowed; }
        .otp-input {
          width: 100%; padding: 18px 16px;
          border: 1.5px solid #e5e7eb; border-radius: 12px;
          font-size: 28px; font-weight: 700; letter-spacing: 12px;
          text-align: center; background: #fafafa; outline: none;
          font-family: monospace;
          transition: border-color .18s, box-shadow .18s;
        }
        .otp-input:focus {
          border-color: #1e40af;
          box-shadow: 0 0 0 3px rgba(30,64,175,.12);
          background: white;
        }
      `}</style>

      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: 'linear-gradient(135deg, #f0f4ff 0%, #f0fdf4 100%)',
        padding: '24px 16px',
      }}>
        <div style={{
          width: '100%', maxWidth: 400,
          background: 'white', borderRadius: 24,
          boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}>
          <div style={{ height: 6, background: 'linear-gradient(90deg, #1e40af, #059669)' }} />

          <div style={{ padding: '36px 36px 40px' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔐</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
                Authenticator Code
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>
                Enter the 6-digit code from your authenticator app
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Email address
                </label>
                <input
                  className="inp"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
                  6-digit code
                </label>
                <input
                  className="otp-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={token}
                  onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                  autoComplete="one-time-code"
                />
              </div>

              {error && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#dc2626' }}>
                  {error}
                </div>
              )}

              <button type="submit" className="btn" disabled={loading || token.length < 6}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin .8s linear infinite' }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    Verifying…
                  </span>
                ) : 'Verify'}
              </button>
            </form>

            <div style={{ marginTop: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <a href="/login" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>
                ← Other sign-in methods
              </a>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>
                No authenticator app? Ask your principal for a Magic Push or Emergency Code.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
