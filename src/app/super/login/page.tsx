'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function SuperLoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password,
      })

      if (authError || !data.user) {
        setError(authError?.message ?? 'Login failed')
        setLoading(false)
        return
      }

      // Fetch role — must be super_admin
      const { data: staff } = await supabase
        .from('staff_records')
        .select('sub_role')
        .eq('user_id', data.user.id)
        .single()

      if (staff?.sub_role !== 'super_admin') {
        await supabase.auth.signOut()
        setError('Access denied — super admin only.')
        setLoading(false)
        return
      }

      // Set routing cookies
      document.cookie = 'sychar-role=super_admin; path=/; SameSite=Lax; max-age=86400'
      document.cookie = 'sychar-sub=active; path=/; SameSite=Lax; max-age=86400'

      window.location.assign('/super/dashboard')
    } catch {
      setError('Unexpected error. Try again.')
      setLoading(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <form onSubmit={handleSubmit} style={{ background: '#1e293b', padding: 40, borderRadius: 12, width: 360, color: '#f1f5f9' }}>
        <h1 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 700, color: '#09D1C7' }}>Sychar Super Admin</h1>

        {error && (
          <p style={{ background: '#450a0a', color: '#fca5a5', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {error}
          </p>
        )}

        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Email</span>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 24 }}>
          <span style={{ fontSize: 13, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: 14, boxSizing: 'border-box' }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: loading ? '#334155' : '#09D1C7', color: '#0f172a', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </main>
  )
}
