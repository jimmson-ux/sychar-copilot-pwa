'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'

interface SchoolInfo { name: string; motto: string | null; logo_url: string | null; theme_color: string | null }

interface TokenData {
  dept: string; school_id: string; hod_name: string; school: SchoolInfo | null
}

export default function OnboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token }         = use(params)
  const router            = useRouter()
  const [info, setInfo]   = useState<TokenData | null>(null)
  const [err, setErr]     = useState('')
  const [step, setStep]   = useState<'loading' | 'name' | 'subjects' | 'password' | 'done'>('loading')
  const [name, setName]   = useState('')
  const [candidates, setCandidates] = useState<string[]>([])
  const [subjects, setSubjects] = useState<string[]>([])
  const [subInput, setSubInput] = useState('')
  const [pw, setPw]       = useState('')
  const [pw2, setPw2]     = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/onboard/${token}`)
      .then(r => r.json())
      .then((d: TokenData & { error?: string }) => {
        if (d.error) { setErr(d.error); setStep('name'); return }
        setInfo(d); setStep('name')
      })
      .catch(() => { setErr('Network error — check your connection'); setStep('name') })
  }, [token])

  const themeColor = info?.school?.theme_color ?? '#1d4ed8'

  function addSubject() {
    const s = subInput.trim()
    if (s && !subjects.includes(s)) setSubjects(prev => [...prev, s])
    setSubInput('')
  }

  async function submit() {
    if (!name.trim()) { setErr('Enter your full name'); return }
    if (pw.length < 8) { setErr('Password must be at least 8 characters'); return }
    if (pw !== pw2) { setErr('Passwords do not match'); return }
    setSaving(true); setErr('')
    const r = await fetch(`/api/onboard/${token}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, password: pw, subjects }),
    })
    const d = await r.json() as { ok?: boolean; error?: string; candidates?: string[] }
    if (d.ok) {
      setStep('done')
    } else if (d.candidates) {
      setCandidates(d.candidates)
      setErr(`Multiple matches found — select your name:`)
    } else {
      setErr(d.error ?? 'Something went wrong')
    }
    setSaving(false)
  }

  // Progress bar values
  const stepNum = step === 'name' ? 1 : step === 'subjects' ? 2 : step === 'password' ? 3 : 3

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* School header */}
        {info?.school && (
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            {info.school.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={info.school.logo_url} alt={info.school.name} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 10px' }} />
            )}
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{info.school.name}</div>
            {info.school.motto && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{info.school.motto}</div>}
          </div>
        )}

        <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ height: 5, background: `linear-gradient(90deg, ${themeColor}, #059669)` }} />
          <div style={{ padding: '28px 24px' }}>

            {step === 'loading' && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>Verifying invitation…</div>
            )}

            {step === 'done' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 8 }}>You're set up!</div>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
                  Your password has been set. You can now log in to Sychar.
                </div>
                <button onClick={() => router.push('/login')}
                  style={{ width: '100%', padding: '13px', background: `linear-gradient(135deg, ${themeColor}, #059669)`, color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                  Go to Login
                </button>
              </div>
            )}

            {(step === 'name' || step === 'subjects' || step === 'password') && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>
                    {info ? `Welcome to ${info.dept}` : 'Teacher Onboarding'}
                  </div>
                  {info && (
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                      Invited by {info.hod_name} · Set up your account to get started
                    </div>
                  )}
                </div>

                {/* Step progress */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 22 }}>
                  {['Your name', 'Subjects', 'Password'].map((l, i) => (
                    <div key={l} style={{ flex: 1 }}>
                      <div style={{ height: 4, borderRadius: 2, background: i < stepNum ? themeColor : '#e5e7eb', transition: 'background 0.3s' }} />
                      <div style={{ fontSize: 9, color: i < stepNum ? themeColor : '#9ca3af', marginTop: 3 }}>{l}</div>
                    </div>
                  ))}
                </div>

                {err && (
                  <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 16 }}>
                    {err}
                    {candidates.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {candidates.map(c => (
                          <button key={c} onClick={() => { setName(c); setErr(''); setCandidates([]) }}
                            style={{ padding: '6px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 1: Name */}
                {step === 'name' && (
                  <>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Your full name (as registered)</label>
                    <input value={name} onChange={e => setName(e.target.value)}
                      placeholder="e.g. John Mwangi Kamau"
                      onKeyDown={e => e.key === 'Enter' && setStep('subjects')}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }} />
                    <button onClick={() => { if (!name.trim()) { setErr('Enter your full name'); return } setErr(''); setStep('subjects') }}
                      style={{ width: '100%', padding: '13px', background: `linear-gradient(135deg, ${themeColor}, #059669)`, color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                      Continue
                    </button>
                  </>
                )}

                {/* Step 2: Subjects */}
                {step === 'subjects' && (
                  <>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                      Subjects you teach <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
                    </label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <input value={subInput} onChange={e => setSubInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addSubject()}
                        placeholder="e.g. Mathematics"
                        style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13 }} />
                      <button onClick={addSubject} style={{ padding: '10px 14px', background: '#f3f4f6', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>Add</button>
                    </div>
                    {subjects.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                        {subjects.map(s => (
                          <span key={s} style={{ padding: '3px 10px', background: themeColor + '18', color: themeColor, borderRadius: 8, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {s}
                            <button onClick={() => setSubjects(prev => prev.filter(x => x !== s))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeColor, fontWeight: 800, padding: 0, fontSize: 12 }}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setStep('name')} style={{ flex: 1, padding: '11px', background: '#f3f4f6', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>Back</button>
                      <button onClick={() => { setErr(''); setStep('password') }} style={{ flex: 2, padding: '11px', background: `linear-gradient(135deg, ${themeColor}, #059669)`, color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                        Continue
                      </button>
                    </div>
                  </>
                )}

                {/* Step 3: Password */}
                {step === 'password' && (
                  <>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Create your password</label>
                    <input type="password" value={pw} onChange={e => setPw(e.target.value)}
                      placeholder="At least 8 characters"
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }} />
                    <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                      placeholder="Confirm password"
                      onKeyDown={e => e.key === 'Enter' && submit()}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }} />

                    {/* Requirements */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                      {[
                        { ok: pw.length >= 8, l: 'At least 8 characters' },
                        { ok: /[A-Z]/.test(pw), l: 'One uppercase letter' },
                        { ok: /[0-9]/.test(pw), l: 'One number' },
                        { ok: pw === pw2 && pw.length > 0, l: 'Passwords match' },
                      ].map(r => (
                        <div key={r.l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: r.ok ? '#16a34a' : '#9ca3af' }}>
                          <span>{r.ok ? '✓' : '○'}</span> {r.l}
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setStep('subjects')} style={{ flex: 1, padding: '11px', background: '#f3f4f6', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>Back</button>
                      <button onClick={submit} disabled={saving} style={{ flex: 2, padding: '11px', background: saving ? '#93c5fd' : `linear-gradient(135deg, ${themeColor}, #059669)`, color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                        {saving ? 'Setting up…' : 'Finish Setup'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#9ca3af' }}>
          Powered by Sychar School Management
        </div>
      </div>
    </div>
  )
}
