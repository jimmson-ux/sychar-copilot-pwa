'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function SycharIcon({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} fill="none">
      <defs>
        <linearGradient id="sg2" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#1e40af"/>
          <stop offset="50%"  stopColor="#0891b2"/>
          <stop offset="100%" stopColor="#22c55e"/>
        </linearGradient>
      </defs>
      <path d="M10 15 Q30 8 50 15"  stroke="url(#sg2)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M10 30 Q30 30 50 30" stroke="url(#sg2)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M10 45 Q30 52 50 45" stroke="url(#sg2)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M15 10 Q8 30 15 50"  stroke="url(#sg2)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M45 10 Q52 30 45 50" stroke="url(#sg2)" strokeWidth="5" strokeLinecap="round"/>
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

export default function ChangePasswordPage() {
  const router = useRouter()
  const [newPw,     setNewPw]     = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showNew,   setShowNew]   = useState(false)
  const [showConf,  setShowConf]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [done,      setDone]      = useState(false)

  // Password strength
  const hasLength    = newPw.length >= 8
  const hasUpper     = /[A-Z]/.test(newPw)
  const hasNumber    = /[0-9]/.test(newPw)
  const hasSpecial   = /[^A-Za-z0-9]/.test(newPw)
  const strongEnough = hasLength && hasUpper && hasNumber

  const requirements = [
    { label: 'At least 8 characters', met: hasLength },
    { label: 'One uppercase letter',  met: hasUpper  },
    { label: 'One number',            met: hasNumber },
    { label: 'One special character', met: hasSpecial },
  ]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!strongEnough) {
      setError('Password does not meet the requirements below.')
      return
    }
    if (newPw !== confirmPw) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      const { error: updErr } = await supabase.auth.updateUser({ password: newPw })

      if (updErr) {
        setError(updErr.message)
        setLoading(false)
        return
      }

      // Clear force_password_change flag
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('staff_records')
          .update({ force_password_change: false })
          .eq('user_id', user.id)
      }

      setDone(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    } catch (err) {
      console.error('[change-password]', err)
      setError('Unexpected error — please try again.')
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, sans-serif; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fade-up { animation: fadeUp 0.35s ease both; }
        .cp-input {
          width: 100%; padding: 13px 16px;
          border: 1.5px solid #e5e7eb; border-radius: 12px;
          font-size: 15px; font-family: inherit;
          background: #fafafa; color: #111827;
          outline: none; transition: border-color 0.18s, box-shadow 0.18s;
        }
        .cp-input:focus {
          border-color: #1e40af;
          box-shadow: 0 0 0 3px rgba(30,64,175,0.12);
          background: white;
        }
        .cp-btn {
          width: 100%; padding: 14px;
          background: linear-gradient(135deg, #1e40af, #059669);
          color: white; border: none; border-radius: 12px;
          font-size: 16px; font-weight: 600; font-family: inherit;
          cursor: pointer; transition: opacity 0.18s, transform 0.18s;
          min-height: 50px; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .cp-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .cp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .pw-wrap { position: relative; }
        .pw-wrap input { padding-right: 48px; }
        .pw-toggle {
          position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #9ca3af;
          display: flex; align-items: center; padding: 4px;
        }
        .pw-toggle:hover { color: #6b7280; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        display: 'grid', placeItems: 'center',
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
          <div style={{ padding: '32px 32px 36px' }}>

            {/* Header */}
            <div className="fade-up" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)',
                border: '1px solid #e0e7ff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <SycharIcon size={24} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Set New Password</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Required before you can continue</div>
              </div>
            </div>

            {done ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', color: '#16a34a',
                }}>
                  <CheckIcon />
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 6 }}>Password updated!</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Redirecting to your dashboard…</div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
                    New password
                  </label>
                  <div className="pw-wrap">
                    <input
                      className="cp-input"
                      type={showNew ? 'text' : 'password'}
                      value={newPw}
                      onChange={e => setNewPw(e.target.value)}
                      placeholder="Choose a strong password"
                      required
                      autoFocus
                    />
                    <button type="button" className="pw-toggle" onClick={() => setShowNew(v => !v)}>
                      <EyeIcon open={showNew} />
                    </button>
                  </div>
                </div>

                {/* Requirements */}
                {newPw.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {requirements.map(r => (
                      <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                          background: r.met ? '#dcfce7' : '#f3f4f6',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: r.met ? '#16a34a' : '#9ca3af',
                          fontSize: 9, fontWeight: 700,
                        }}>
                          {r.met ? '✓' : '·'}
                        </div>
                        <span style={{ color: r.met ? '#374151' : '#9ca3af' }}>{r.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
                    Confirm password
                  </label>
                  <div className="pw-wrap">
                    <input
                      className="cp-input"
                      type={showConf ? 'text' : 'password'}
                      value={confirmPw}
                      onChange={e => setConfirmPw(e.target.value)}
                      placeholder="Repeat your password"
                      required
                    />
                    <button type="button" className="pw-toggle" onClick={() => setShowConf(v => !v)}>
                      <EyeIcon open={showConf} />
                    </button>
                  </div>
                  {confirmPw.length > 0 && newPw !== confirmPw && (
                    <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>Passwords do not match</div>
                  )}
                </div>

                {error && (
                  <div style={{
                    padding: '10px 14px',
                    background: '#fef2f2', border: '1px solid #fecaca',
                    borderRadius: 10, fontSize: 13, color: '#dc2626',
                  }}>
                    {error}
                  </div>
                )}

                <button type="submit" className="cp-btn" disabled={loading}>
                  {loading ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                  ) : 'Update password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
