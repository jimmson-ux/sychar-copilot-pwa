'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const G = '#16a34a'

// Ephemeral client — separate storageKey so it never touches staff auth cookies.
// persistSession: true so PKCE code_verifier (written during signInWithOAuth) is
// still readable here on the redirect-back.
function getParentSbClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { storageKey: 'parent_sb_auth', persistSession: true } },
  )
}

function CallbackInner() {
  const router      = useRouter()
  const params      = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [msg,    setMsg]    = useState('')

  useEffect(() => {
    async function run() {
      const code      = params.get('code')
      const errorDesc = params.get('error_description')

      if (errorDesc) {
        setMsg(decodeURIComponent(errorDesc))
        setStatus('error')
        return
      }
      if (!code) {
        setMsg('No authorization code received.')
        setStatus('error')
        return
      }

      const schoolCode = sessionStorage.getItem('parent_google_school_code')
      if (!schoolCode) {
        setMsg('School code lost. Please go back and try again.')
        setStatus('error')
        return
      }

      const sb = getParentSbClient()

      // Exchange the OAuth code for a Supabase session
      const { data, error } = await sb.auth.exchangeCodeForSession(code)
      if (error || !data.session) {
        setMsg(error?.message ?? 'Google sign-in failed.')
        setStatus('error')
        return
      }

      const accessToken = data.session.access_token

      // Verify email against school records and issue our parent JWT
      const res = await fetch('/api/parent/auth/google-verify', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ schoolCode }),
      })
      const json = await res.json()

      // Always sign out of Supabase — we use our own parent JWT from here
      await sb.auth.signOut()

      if (!res.ok) {
        setMsg(json.error ?? 'Verification failed.')
        setStatus('error')
        return
      }

      localStorage.setItem('parent_token',       json.token)
      localStorage.setItem('parent_school_id',   schoolCode)
      localStorage.setItem('parent_student_ids', JSON.stringify(json.student_ids))
      sessionStorage.removeItem('parent_google_school_code')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jAny = json as any
      const consentRes = await fetch('/api/parent/consent', {
        headers: { Authorization: `Bearer ${jAny.token}` },
      }).catch(() => null)
      const consentJson = await consentRes?.json().catch(() => null) as { hasConsent?: boolean } | null
      router.replace(consentJson?.hasConsent ? '/parent/dashboard' : '/parent/consent')
    }

    run()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: '60px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔑</div>
        <p style={{ color: '#374151', fontSize: 15, fontWeight: 600 }}>Signing you in…</p>
        <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>Verifying your Google account</p>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ color: '#dc2626', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sign-in failed</h2>
      <p style={{ color: '#374151', fontSize: 14, marginBottom: 24 }}>{msg}</p>
      <button
        onClick={() => router.replace('/parent')}
        style={{ background: G, color: 'white', border: 'none', borderRadius: 12, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
      >
        Back to Login
      </button>
    </div>
  )
}

export default function ParentAuthCallbackPage() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <Suspense fallback={
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 48 }}>🔑</div>
            <p style={{ color: '#374151', marginTop: 16 }}>Loading…</p>
          </div>
        }>
          <CallbackInner />
        </Suspense>
      </div>
    </div>
  )
}
