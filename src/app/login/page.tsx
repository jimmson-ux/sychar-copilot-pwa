'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface SchoolTheme {
  name: string
  motto: string
  logoUrl: string | null
  themeColor: string
  secondaryColor: string
}

type Tab = 'password' | 'push' | 'totp' | 'emergency'

function SycharIcon({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} fill="none">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#1e40af"/>
          <stop offset="50%"  stopColor="#0891b2"/>
          <stop offset="100%" stopColor="#22c55e"/>
        </linearGradient>
      </defs>
      <path d="M10 15 Q30 8 50 15"  stroke="url(#sg)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M10 30 Q30 30 50 30" stroke="url(#sg)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M10 45 Q30 52 50 45" stroke="url(#sg)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M15 10 Q8 30 15 50"  stroke="url(#sg)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M45 10 Q52 30 45 50" stroke="url(#sg)" strokeWidth="5" strokeLinecap="round"/>
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

function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite' }}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  )
}

export default function LoginPage() {
  const [theme,    setTheme]    = useState<SchoolTheme | null>(null)
  const [tab,      setTab]      = useState<Tab>('password')
  // Password tab
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  // Magic Push tab
  const [pushEmail,  setPushEmail]  = useState('')
  const [pushStatus, setPushStatus] = useState<'idle' | 'sending' | 'waiting' | 'no_devices' | 'error'>('idle')
  const [pushToken,  setPushToken]  = useState('')
  // TOTP tab
  const [totpEmail, setTotpEmail] = useState('')
  const [totpCode,  setTotpCode]  = useState('')
  // Emergency tab
  const [emergEmail, setEmergEmail] = useState('')
  const [emergCode,  setEmergCode]  = useState('')
  // Shared
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    fetch('/api/school-theme')
      .then(r => r.ok ? r.json() : null)
      .then((d: SchoolTheme | null) => { if (d) setTheme(d) })
      .catch(() => {})
  }, [])

  // Poll for push approval
  useEffect(() => {
    if (pushStatus !== 'waiting' || !pushToken) return
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/auth/magic-link/status?t=${pushToken}`)
        const d = await r.json() as { status: string; actionLink?: string }
        if (d.status === 'approved' && d.actionLink) {
          clearInterval(iv)
          window.location.href = d.actionLink
        } else if (d.status === 'expired') {
          clearInterval(iv)
          setPushStatus('error')
          setError('Login request expired. Please try again.')
        }
      } catch { /* offline — keep polling */ }
    }, 2000)
    return () => clearInterval(iv)
  }, [pushStatus, pushToken])

  function applySession(subRole: string, fullName: string, staffId: string, forceChange: boolean) {
    localStorage.setItem('sychar_role',     subRole)
    localStorage.setItem('sychar_name',     fullName)
    localStorage.setItem('sychar_staff_id', staffId)
    const opts = 'path=/; SameSite=Lax; max-age=86400'
    document.cookie = `sychar-role=${subRole}; ${opts}`
    document.cookie = `sychar-sub=active; ${opts}`
    window.location.assign(forceChange ? '/change-password' : '/dashboard')
  }

  // ── TAB 1: Password ──────────────────────────────────────────────────────────
  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password,
      })
      if (authErr) {
        setError(authErr.message === 'Invalid login credentials' ? 'Incorrect email or password.' : authErr.message)
        setLoading(false)
        return
      }
      if (!data.user) { setError('Login failed — please try again.'); setLoading(false); return }

      const { data: staff } = await supabase
        .from('staff_records')
        .select('sub_role, force_password_change, full_name, id')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (!staff) {
        const { data: byEmail } = await supabase
          .from('staff_records')
          .select('sub_role, force_password_change, full_name, id')
          .eq('email', email.trim().toLowerCase())
          .maybeSingle()
        if (!byEmail) { setError('No staff record found. Contact admin.'); setLoading(false); return }
        applySession(byEmail.sub_role, byEmail.full_name, byEmail.id, byEmail.force_password_change)
        return
      }
      applySession(staff.sub_role, staff.full_name, staff.id, staff.force_password_change)
    } catch {
      setError('Unexpected error — please try again.')
      setLoading(false)
    }
  }

  // ── TAB 2: Magic Push ────────────────────────────────────────────────────────
  async function handleMagicPush(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setPushStatus('sending')
    const r = await fetch('/api/auth/magic-link/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pushEmail.trim().toLowerCase() }),
    }).catch(() => null)
    if (!r) { setPushStatus('error'); setError('Network error. Please try again.'); return }
    const d = await r.json() as { sent?: boolean; method?: string; token?: string; devices?: number }
    if (d.method === 'no_devices' || d.devices === 0) {
      setPushStatus('no_devices')
      return
    }
    if (d.token) {
      setPushToken(d.token)
      setPushStatus('waiting')
    } else {
      setPushStatus('error')
      setError('Failed to send push. Please try another method.')
    }
  }

  // ── TAB 3: TOTP ──────────────────────────────────────────────────────────────
  async function handleTOTP(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const r = await fetch('/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: totpEmail.trim().toLowerCase(), token: totpCode.trim() }),
    }).catch(() => null)
    if (!r) { setError('Network error.'); setLoading(false); return }
    const d = await r.json() as { success?: boolean; reason?: string; actionLink?: string; subRole?: string; fullName?: string; staffId?: string; forcePasswordChange?: boolean }
    if (!d.success) {
      setError(
        d.reason === 'invalid_token'       ? 'Incorrect code. Try again (codes refresh every 30s).' :
        d.reason === 'totp_not_configured' ? 'TOTP not set up. Ask your principal for Emergency Code.' :
        d.reason === 'invalid_credentials' ? 'Email not found.' :
        'Verification failed.',
      )
      setLoading(false)
      return
    }
    if (d.subRole) {
      localStorage.setItem('sychar_role',     d.subRole)
      localStorage.setItem('sychar_name',     d.fullName ?? '')
      localStorage.setItem('sychar_staff_id', d.staffId ?? '')
      const opts = 'path=/; SameSite=Lax; max-age=86400'
      document.cookie = `sychar-role=${d.subRole}; ${opts}`
      document.cookie = `sychar-sub=active; ${opts}`
    }
    if (d.actionLink) window.location.href = d.actionLink
  }

  // ── TAB 4: Emergency OTP ─────────────────────────────────────────────────────
  async function handleEmergency(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const r = await fetch('/api/auth/emergency-otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emergEmail.trim().toLowerCase(), otp: emergCode.trim() }),
    }).catch(() => null)
    if (!r) { setError('Network error.'); setLoading(false); return }
    const d = await r.json() as { success?: boolean; reason?: string; actionLink?: string; subRole?: string; fullName?: string; staffId?: string; forcePasswordChange?: boolean }
    if (!d.success) {
      setError(
        d.reason === 'invalid_or_expired_otp' ? 'Invalid or expired code. Ask admin for a new one.' :
        d.reason === 'otp_user_mismatch'       ? 'Code does not match this email.' :
        'Verification failed.',
      )
      setLoading(false)
      return
    }
    if (d.subRole) {
      localStorage.setItem('sychar_role',     d.subRole)
      localStorage.setItem('sychar_name',     d.fullName ?? '')
      localStorage.setItem('sychar_staff_id', d.staffId ?? '')
      const opts = 'path=/; SameSite=Lax; max-age=86400'
      document.cookie = `sychar-role=${d.subRole}; ${opts}`
      document.cookie = `sychar-sub=active; ${opts}`
    }
    if (d.actionLink) window.location.href = d.actionLink
  }

  function switchTab(t: Tab) {
    setTab(t)
    setError('')
    setLoading(false)
    setPushStatus('idle')
    setPushToken('')
  }

  const primary   = theme?.themeColor    ?? '#1e40af'
  const secondary = theme?.secondaryColor ?? '#059669'

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'password',  label: 'Password',     icon: '🔑' },
    { id: 'push',      label: 'Magic Push',   icon: '🔔' },
    { id: 'totp',      label: 'Authenticator',icon: '🔐' },
    { id: 'emergency', label: 'Emergency',    icon: '🆘' },
  ]

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: var(--font-space-grotesk, system-ui, sans-serif); }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
        .fade-up { animation: fadeUp 0.35s ease both; }
        .login-input {
          width: 100%; padding: 13px 15px;
          border: 1.5px solid #e5e7eb; border-radius: 11px;
          font-size: 14px; font-family: inherit;
          background: #fafafa; color: #111827;
          outline: none; transition: border-color .18s, box-shadow .18s;
        }
        .login-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent);
          background: white;
        }
        .login-btn {
          width: 100%; padding: 14px;
          background: linear-gradient(135deg, var(--primary), var(--secondary));
          color: white; border: none; border-radius: 11px;
          font-size: 15px; font-weight: 600; font-family: inherit;
          cursor: pointer; transition: opacity .18s, transform .18s;
          min-height: 50px; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .login-btn:hover:not(:disabled) { opacity: .92; transform: translateY(-1px); }
        .login-btn:active:not(:disabled) { transform: translateY(0); }
        .login-btn:disabled { opacity: .6; cursor: not-allowed; }
        .pw-wrap { position: relative; }
        .pw-wrap input { padding-right: 46px; }
        .pw-toggle { position: absolute; right: 13px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #9ca3af; display: flex; padding: 4px; }
        .pw-toggle:hover { color: #6b7280; }
        .tab-btn {
          flex: 1; padding: 8px 4px; border: none; background: none; cursor: pointer;
          font-family: inherit; font-size: 11px; font-weight: 500; color: #9ca3af;
          border-bottom: 2px solid transparent; transition: color .18s, border-color .18s;
          display: flex; flex-direction: column; align-items: center; gap: 3px;
        }
        .tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
        .tab-btn:hover:not(.active) { color: #6b7280; }
        .skeleton { background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 400px 100%; animation: shimmer 1.4s ease infinite; border-radius: 6px; }
        .otp-big { font-size: 26px; font-weight: 700; letter-spacing: 10px; text-align: center; font-family: monospace; }
      `}</style>

      <div style={{ '--primary': primary, '--secondary': secondary } as React.CSSProperties & Record<string, string>}>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #f0f4ff 0%, #f0fdf4 100%)', padding: '20px 16px' }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'white', borderRadius: 24, boxShadow: '0 8px 40px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

            <div style={{ height: 5, background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />

            <div style={{ padding: '28px 30px 32px' }}>

              {/* Branding */}
              <div className="fade-up" style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 22 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)', border: '1px solid #e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SycharIcon size={26} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, background: 'linear-gradient(90deg, #1e40af, #0891b2, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', lineHeight: 1.2 }}>
                    Sychar CoPilot
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1, letterSpacing: '.05em' }}>
                    The future of educational management
                  </div>
                </div>
              </div>

              {/* School identity */}
              <div className="fade-up" style={{ textAlign: 'center', marginBottom: 20 }}>
                {theme?.logoUrl ? (
                  <img src={theme.logoUrl} alt="School logo" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 10px', display: 'block', border: '2px solid #f3f4f6' }} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: `linear-gradient(135deg, ${primary}22, ${secondary}22)`, border: `2px solid ${primary}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: 22, color: primary, fontWeight: 700 }}>
                    {theme?.name ? theme.name[0].toUpperCase() : '🏫'}
                  </div>
                )}
                {theme ? (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{theme.name}</div>
                    {theme.motto && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3, fontStyle: 'italic' }}>&ldquo;{theme.motto}&rdquo;</div>}
                  </>
                ) : (
                  <>
                    <div className="skeleton" style={{ height: 18, width: 180, margin: '0 auto 5px' }} />
                    <div className="skeleton" style={{ height: 12, width: 130, margin: '0 auto' }} />
                  </>
                )}
              </div>

              {/* Auth method tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', marginBottom: 20, gap: 0 }}>
                {TABS.map(t => (
                  <button
                    key={t.id}
                    className={`tab-btn${tab === t.id ? ' active' : ''}`}
                    onClick={() => switchTab(t.id)}
                  >
                    <span style={{ fontSize: 15 }}>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Tab 1: Password ── */}
              {tab === 'password' && (
                <form className="fade-up" onSubmit={handlePassword} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Email address</label>
                    <input className="login-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" autoFocus />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Password</label>
                    <div className="pw-wrap">
                      <input className="login-input" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required autoComplete="current-password" />
                      <button type="button" className="pw-toggle" onClick={() => setShowPw(v => !v)}>
                        <EyeIcon open={showPw} />
                      </button>
                    </div>
                  </div>
                  {error && <ErrorBox msg={error} />}
                  <button type="submit" className="login-btn" disabled={loading}>
                    {loading ? <Spinner /> : 'Sign in'}
                  </button>
                </form>
              )}

              {/* ── Tab 2: Magic Push ── */}
              {tab === 'push' && (
                <div className="fade-up">
                  {pushStatus === 'idle' || pushStatus === 'error' ? (
                    <form onSubmit={handleMagicPush} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                      <div style={{ padding: '10px 13px', background: '#eff6ff', borderRadius: 10, fontSize: 12, color: '#1e40af', lineHeight: 1.5 }}>
                        A push notification will be sent to your already-logged-in device. Tap ✅ Approve to sign in.
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Email address</label>
                        <input className="login-input" type="email" value={pushEmail} onChange={e => setPushEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" autoFocus />
                      </div>
                      {error && <ErrorBox msg={error} />}
                      <button type="submit" className="login-btn">
                        Send Magic Push
                      </button>
                    </form>
                  ) : pushStatus === 'sending' ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: '#6b7280' }}>
                      <div style={{ fontSize: 36, marginBottom: 12, animation: 'pulse 1.5s ease infinite' }}>🔔</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>Sending push notification…</div>
                    </div>
                  ) : pushStatus === 'waiting' ? (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>📱</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Waiting for approval</div>
                      <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
                        Check the push notification on your other device and tap <strong>✅ Approve</strong>.
                      </div>
                      <div style={{ width: 28, height: 28, border: `3px solid ${primary}`, borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
                      <button onClick={() => switchTab('push')} style={{ marginTop: 20, fontSize: 12, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                        Cancel
                      </button>
                    </div>
                  ) : pushStatus === 'no_devices' ? (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>📵</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>No registered devices</div>
                      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, marginBottom: 16 }}>
                        You have no devices with push enabled. Use the Authenticator or Emergency Code tab instead.
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button onClick={() => switchTab('totp')} className="login-btn" style={{ width: 'auto', padding: '10px 16px', fontSize: 13 }}>
                          🔐 Authenticator
                        </button>
                        <button onClick={() => switchTab('emergency')} className="login-btn" style={{ width: 'auto', padding: '10px 16px', fontSize: 13, background: 'linear-gradient(135deg, #7c3aed, #db2777)' }}>
                          🆘 Emergency
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* ── Tab 3: Authenticator (TOTP) ── */}
              {tab === 'totp' && (
                <form className="fade-up" onSubmit={handleTOTP} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                  <div style={{ padding: '10px 13px', background: '#f0fdf4', borderRadius: 10, fontSize: 12, color: '#15803d', lineHeight: 1.5 }}>
                    Open Google Authenticator (or any TOTP app) and enter the 6-digit code for Sychar CoPilot.
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Email address</label>
                    <input className="login-input" type="email" value={totpEmail} onChange={e => setTotpEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" autoFocus />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>6-digit code</label>
                    <input
                      className="login-input otp-big"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={totpCode}
                      onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      required
                      autoComplete="one-time-code"
                    />
                  </div>
                  {error && <ErrorBox msg={error} />}
                  <button type="submit" className="login-btn" disabled={loading || totpCode.length < 6}>
                    {loading ? <Spinner /> : 'Verify Code'}
                  </button>
                  <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>
                    No authenticator app? Ask your principal for a Magic Push or Emergency Code.
                  </div>
                </form>
              )}

              {/* ── Tab 4: Emergency OTP ── */}
              {tab === 'emergency' && (
                <form className="fade-up" onSubmit={handleEmergency} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                  <div style={{ padding: '10px 13px', background: '#fff7ed', borderRadius: 10, fontSize: 12, color: '#c2410c', lineHeight: 1.5 }}>
                    <strong>Emergency access only.</strong> Your principal or system admin will read you a 6-digit code valid for 5 minutes.
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Email address</label>
                    <input className="login-input" type="email" value={emergEmail} onChange={e => setEmergEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" autoFocus />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>Emergency code</label>
                    <input
                      className="login-input otp-big"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={emergCode}
                      onChange={e => setEmergCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      required
                      autoComplete="off"
                    />
                  </div>
                  {error && <ErrorBox msg={error} />}
                  <button type="submit" className="login-btn" disabled={loading || emergCode.length < 6}
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #db2777)' }}>
                    {loading ? <Spinner /> : 'Verify Emergency Code'}
                  </button>
                </form>
              )}

              <div style={{ textAlign: 'center', marginTop: 22, fontSize: 10, color: '#d1d5db' }}>
                Powered by Sychar CoPilot · © {new Date().getFullYear()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '9px 13px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 12, color: '#dc2626' }}>
      {msg}
    </div>
  )
}
