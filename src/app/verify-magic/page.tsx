'use client'

// /verify-magic
// Three modes:
//   ?t=TOKEN             — new device waiting for push approval (polls /status)
//   ?t=TOKEN&approve=1   — existing device opened via push notification action (calls /consume)
//   ?complete=1          — Supabase magic-link callback (exchange code, apply session)

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Phase = 'loading' | 'waiting' | 'approving' | 'success' | 'error'

export default function VerifyMagicPage() {
  return (
    <Suspense fallback={<VerifyShell phase="loading" msg="Loading…" />}>
      <VerifyMagicInner />
    </Suspense>
  )
}

function VerifyShell({ phase, msg }: { phase: Phase; msg: string }) {
  const icon  = phase === 'success' ? '✅' : phase === 'error' ? '❌' : '⏳'
  const color = phase === 'success' ? '#16a34a' : phase === 'error' ? '#dc2626' : '#1e40af'
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #f0f4ff 0%, #f0fdf4 100%)', fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
      <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.08)', padding: '48px 40px', maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>{icon}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color, marginBottom: 12 }}>{msg}</div>
      </div>
    </div>
  )
}

function VerifyMagicInner() {
  const params   = useSearchParams()
  const [phase,  setPhase]  = useState<Phase>('loading')
  const [msg,    setMsg]    = useState('')
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  // Apply staff session after Supabase creates the user session
  async function applyStaffSession() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setPhase('error'); setMsg('Session not found. Please try again.'); return }

    const { data: staff } = await supabase
      .from('staff_records')
      .select('sub_role, force_password_change, full_name, id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!staff) { setPhase('error'); setMsg('No staff record found for this account.'); return }

    localStorage.setItem('sychar_role',     staff.sub_role ?? '')
    localStorage.setItem('sychar_name',     staff.full_name ?? '')
    localStorage.setItem('sychar_staff_id', staff.id)
    const opts = 'path=/; SameSite=Lax; max-age=86400'
    document.cookie = `sychar-role=${staff.sub_role ?? ''}; ${opts}`
    document.cookie = `sychar-sub=active; ${opts}`

    setPhase('success')
    setTimeout(() => {
      window.location.assign(staff.force_password_change ? '/change-password' : '/dashboard')
    }, 800)
  }

  useEffect(() => {
    const token    = params.get('t')
    const approve  = params.get('approve')
    const complete = params.get('complete')

    // Mode 3: Supabase callback — exchange code for session
    if (complete === '1') {
      setPhase('loading')
      setMsg('Completing sign-in…')
      // Give Supabase SSR a moment to set the session cookie from the URL hash/code
      setTimeout(() => applyStaffSession(), 1200)
      return
    }

    if (!token) {
      setPhase('error')
      setMsg('Invalid link. No token found.')
      return
    }

    // Mode 2: Existing device approving — call consume then show success
    if (approve === '1') {
      setPhase('approving')
      setMsg('Approving login…')
      fetch('/api/auth/magic-link/consume', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token }),
      })
        .then(r => r.json())
        .then((d: { success?: boolean; reason?: string }) => {
          if (d.success) {
            setPhase('success')
            setMsg('Login approved! The other device is being signed in.')
          } else {
            setPhase('error')
            setMsg(d.reason === 'expired_or_used'
              ? 'This link has expired or was already used.'
              : 'Approval failed. Please try again.')
          }
        })
        .catch(() => { setPhase('error'); setMsg('Network error. Please try again.') })
      return
    }

    // Mode 1: New device — poll for approval
    setPhase('waiting')
    setMsg('Waiting for approval on your other device…')

    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/auth/magic-link/status?t=${token}`)
        const d = await r.json() as { status: string; actionLink?: string }

        if (d.status === 'approved' && d.actionLink) {
          stopPolling()
          setMsg('Approved! Signing you in…')
          // Follow the Supabase action link to create the session
          window.location.href = d.actionLink
        } else if (d.status === 'expired') {
          stopPolling()
          setPhase('error')
          setMsg('The login request expired. Please try again.')
        }
      } catch { /* offline — keep polling */ }
    }, 2000)

    return stopPolling
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const icon = phase === 'success' ? '✅'
    : phase === 'error'   ? '❌'
    : phase === 'waiting' ? '🔔'
    : '⏳'

  const color = phase === 'success' ? '#16a34a'
    : phase === 'error' ? '#dc2626'
    : '#1e40af'

  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center',
      background: 'linear-gradient(135deg, #f0f4ff 0%, #f0fdf4 100%)',
      fontFamily: 'system-ui, sans-serif', padding: '24px',
    }}>
      <div style={{
        background: 'white', borderRadius: 20,
        boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
        padding: '48px 40px', maxWidth: 400, width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>{icon}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color, marginBottom: 12 }}>
          {phase === 'loading'   ? 'Signing you in…'
          : phase === 'waiting'  ? 'Waiting for approval'
          : phase === 'approving'? 'Approving…'
          : phase === 'success'  ? 'Signed in!'
          : 'Sign-in failed'}
        </div>
        <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
          {msg || (phase === 'waiting'
            ? 'Check the push notification on your other device and tap ✅ Approve.'
            : '')}
        </div>
        {phase === 'waiting' && (
          <div style={{ marginTop: 24 }}>
            <div style={{
              width: 32, height: 32, border: `3px solid ${color}`,
              borderTopColor: 'transparent', borderRadius: '50%',
              margin: '0 auto', animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
        {phase === 'error' && (
          <button
            onClick={() => window.location.assign('/login')}
            style={{
              marginTop: 24, padding: '12px 24px',
              background: '#1e40af', color: 'white',
              border: 'none', borderRadius: 10, cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
            }}
          >
            Back to login
          </button>
        )}
      </div>
    </div>
  )
}
