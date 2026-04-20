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

export default function LoginPage() {
  const [theme, setTheme]       = useState<SchoolTheme | null>(null)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    fetch('/api/school-theme')
      .then(r => r.ok ? r.json() : null)
      .then((d: SchoolTheme | null) => { if (d) setTheme(d) })
      .catch(() => {})
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()

      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (authErr) {
        setError(authErr.message === 'Invalid login credentials'
          ? 'Incorrect email or password.'
          : authErr.message)
        setLoading(false)
        return
      }

      if (!data.user) {
        setError('Login failed — please try again.')
        setLoading(false)
        return
      }

      // Fetch staff record to get sub_role and force_password_change
      const { data: staff, error: staffErr } = await supabase
        .from('staff_records')
        .select('sub_role, force_password_change, full_name, id')
        .eq('user_id', data.user.id)
        .single()

      if (staffErr || !staff) {
        // Fallback: try matching by email
        const { data: staffByEmail } = await supabase
          .from('staff_records')
          .select('sub_role, force_password_change, full_name, id')
          .eq('email', email.trim().toLowerCase())
          .single()

        if (!staffByEmail) {
          setError('No staff record found for this account. Contact admin.')
          setLoading(false)
          return
        }

        applySession(staffByEmail.sub_role, staffByEmail.full_name, staffByEmail.id, staffByEmail.force_password_change)
        return
      }

      applySession(staff.sub_role, staff.full_name, staff.id, staff.force_password_change)
    } catch (err) {
      console.error('[login] unexpected error:', err)
      setError('Unexpected error — please try again.')
      setLoading(false)
    }
  }

  function applySession(subRole: string, fullName: string, staffId: string, forceChange: boolean) {
    // Store identity hints (routing only — real auth enforced by RLS)
    localStorage.setItem('sychar_role',     subRole)
    localStorage.setItem('sychar_name',     fullName)
    localStorage.setItem('sychar_staff_id', staffId)

    const cookieOpts = 'path=/; SameSite=Lax; max-age=86400'
    document.cookie = `sychar-role=${subRole}; ${cookieOpts}`
    document.cookie = `sychar-sub=active; ${cookieOpts}`

    window.location.assign(forceChange ? '/change-password' : '/dashboard')
  }

  const primary   = theme?.themeColor   ?? '#1e40af'
  const secondary = theme?.secondaryColor ?? '#059669'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Space Grotesk', system-ui, sans-serif; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position:  400px 0; }
        }
        .fade-up { animation: fadeUp 0.4s ease both; }
        .fade-up-1 { animation-delay: 0.05s; }
        .fade-up-2 { animation-delay: 0.12s; }
        .fade-up-3 { animation-delay: 0.2s; }
        .login-input {
          width: 100%; padding: 14px 16px;
          border: 1.5px solid #e5e7eb; border-radius: 12px;
          font-size: 15px; font-family: inherit;
          background: #fafafa; color: #111827;
          outline: none; transition: border-color 0.18s, box-shadow 0.18s;
        }
        .login-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
          background: white;
        }
        .login-btn {
          width: 100%; padding: 15px;
          background: linear-gradient(135deg, var(--primary), var(--secondary));
          color: white; border: none; border-radius: 12px;
          font-size: 16px; font-weight: 600; font-family: inherit;
          cursor: pointer; transition: opacity 0.18s, transform 0.18s;
          min-height: 52px; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .login-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
        .login-btn:active:not(:disabled) { transform: translateY(0); }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .pw-wrap { position: relative; }
        .pw-wrap input { padding-right: 48px; }
        .pw-toggle {
          position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #9ca3af;
          display: flex; align-items: center; padding: 4px;
        }
        .pw-toggle:hover { color: #6b7280; }
        .skeleton {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 400px 100%;
          animation: shimmer 1.4s ease infinite;
          border-radius: 6px;
        }
      `}</style>

      <div style={{ '--primary': primary, '--secondary': secondary } as React.CSSProperties & Record<string, string>}>
        <div style={{
          minHeight: '100vh',
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr)',
          placeItems: 'center',
          background: 'linear-gradient(135deg, #f0f4ff 0%, #f0fdf4 100%)',
          padding: '24px 16px',
        }}>

          <div style={{
            width: '100%', maxWidth: 420,
            background: 'white', borderRadius: 24,
            boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
            overflow: 'hidden',
          }}>

            {/* Top gradient band */}
            <div style={{
              height: 6,
              background: `linear-gradient(90deg, ${primary}, ${secondary})`,
            }} />

            <div style={{ padding: '36px 36px 40px' }}>

              {/* Sychar branding */}
              <div className="fade-up" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)',
                  border: '1px solid #e0e7ff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <SycharIcon size={28} />
                </div>
                <div>
                  <div style={{
                    fontSize: 15, fontWeight: 700,
                    background: 'linear-gradient(90deg, #1e40af, #0891b2, #22c55e)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text', lineHeight: 1.2,
                  }}>
                    Sychar CoPilot
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, letterSpacing: '0.05em' }}>
                    The future of educational management
                  </div>
                </div>
              </div>

              {/* School identity */}
              <div className="fade-up fade-up-1" style={{ textAlign: 'center', marginBottom: 32 }}>
                {theme?.logoUrl ? (
                  <img
                    src={theme.logoUrl}
                    alt="School logo"
                    style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 12px', display: 'block', border: '2px solid #f3f4f6' }}
                  />
                ) : (
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${primary}22, ${secondary}22)`,
                    border: `2px solid ${primary}33`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px',
                    fontSize: 24, color: primary, fontWeight: 700,
                  }}>
                    {theme?.name ? theme.name[0].toUpperCase() : '🏫'}
                  </div>
                )}
                {theme ? (
                  <>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
                      {theme.name}
                    </div>
                    {theme.motto && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}>
                        &ldquo;{theme.motto}&rdquo;
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="skeleton" style={{ height: 20, width: 200, margin: '0 auto 6px' }} />
                    <div className="skeleton" style={{ height: 14, width: 150, margin: '0 auto' }} />
                  </>
                )}
              </div>

              {/* Login form */}
              <form className="fade-up fade-up-2" onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
                    Email address
                  </label>
                  <input
                    className="login-input"
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
                    Password
                  </label>
                  <div className="pw-wrap">
                    <input
                      className="login-input"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="pw-toggle"
                      onClick={() => setShowPw(v => !v)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      <EyeIcon open={showPw} />
                    </button>
                  </div>
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

                <button type="submit" className="login-btn" disabled={loading}>
                  {loading ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                  ) : 'Sign in'}
                </button>
              </form>

              {/* Footer */}
              <div className="fade-up fade-up-3" style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#d1d5db' }}>
                Powered by Sychar CoPilot &middot; &copy; {new Date().getFullYear()}
              </div>

            </div>
          </div>

        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
