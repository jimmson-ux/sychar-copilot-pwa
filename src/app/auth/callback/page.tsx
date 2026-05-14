'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

function CallbackInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    async function run() {
      const code      = params.get('code')
      const next      = params.get('next') ?? '/dashboard'
      const errorDesc = params.get('error_description')

      if (errorDesc) {
        setErrMsg(decodeURIComponent(errorDesc))
        return
      }

      if (!code) {
        setErrMsg('No authorization code received. Please try signing in again.')
        return
      }

      const supabase = createClient()
      const { data, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)

      if (exchangeErr || !data.session) {
        setErrMsg(exchangeErr?.message ?? 'Authentication failed. Please try again.')
        return
      }

      // Password recovery: session is established, send straight to /change-password
      if (next === '/change-password') {
        router.replace('/change-password')
        return
      }

      // Google OAuth: look up staff record and write role cookies
      const user = data.session.user
      const { data: staffById } = await supabase
        .from('staff_records')
        .select('sub_role, full_name, id, force_password_change')
        .eq('user_id', user.id)
        .maybeSingle()

      // Email fallback — handles first-time Google sign-in where user_id hasn't been linked yet
      let staff = staffById
      if (!staff && user.email) {
        const { data: byEmail } = await supabase
          .from('staff_records')
          .select('sub_role, full_name, id, force_password_change')
          .eq('email', user.email.toLowerCase())
          .maybeSingle()
        staff = byEmail ?? null
      }

      if (!staff) {
        setErrMsg('No staff record found for this Google account. Ask your admin to link your account.')
        return
      }

      const s = staff as { sub_role: string; full_name: string; id: string; force_password_change: boolean }
      localStorage.setItem('sychar_role',     s.sub_role)
      localStorage.setItem('sychar_name',     s.full_name)
      localStorage.setItem('sychar_staff_id', s.id)
      const opts = 'path=/; SameSite=Lax; max-age=86400'
      document.cookie = `sychar-role=${s.sub_role}; ${opts}`
      document.cookie = `sychar-sub=active; ${opts}`

      router.replace(s.force_password_change ? '/change-password' : '/dashboard')
    }

    run()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (errMsg) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <p style={{ color: '#dc2626', fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Sign-in failed</p>
        <p style={{ color: '#374151', fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>{errMsg}</p>
        <a href="/login" style={{
          display: 'inline-block', padding: '10px 24px', borderRadius: 10,
          background: '#1e40af', color: 'white', textDecoration: 'none',
          fontSize: 14, fontWeight: 600,
        }}>
          Back to login
        </a>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔑</div>
      <p style={{ color: '#374151', fontSize: 15, fontWeight: 600 }}>Signing you in…</p>
      <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>Just a moment</p>
      <div style={{ width: 28, height: 28, border: '3px solid #1e40af', borderTopColor: 'transparent', borderRadius: '50%', margin: '20px auto 0', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0f4ff 0%, #f0fdf4 100%)',
    }}>
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
