'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const C = { surface: '#0f0f1e', border: 'rgba(99,102,241,0.18)', text: '#e2e8f0', muted: '#475569', accent: '#6366f1', accentL: '#818cf8', green: '#4ade80', red: '#f87171', amber: '#fbbf24' }
const MONO = '"JetBrains Mono", monospace'

export default function SettingsPage() {
  const [email,    setEmail]    = useState('')
  const [uid,      setUid]      = useState('')
  const [newPw,    setNewPw]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [showImp,  setShowImp]  = useState(false)
  const [impResult, setImpResult] = useState('')
  const [schoolId,  setSchoolId]  = useState('')

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? '')
      setUid(data.user?.id ?? '')
    })
  }, [])

  function flash(type: 'ok' | 'err', text: string) { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000) }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPw.length < 8) { flash('err', 'Min 8 chars'); return }
    setSaving(true)
    const sb = createClient()
    const { error } = await sb.auth.updateUser({ password: newPw })
    setSaving(false)
    if (error) flash('err', 'Failed to change password')
    else { flash('ok', 'Password changed'); setNewPw('') }
  }

  async function impersonate() {
    if (!schoolId.trim()) return
    const r = await fetch('/api/super/impersonate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school_id: schoolId }) })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.magic_link) {
      setImpResult(`Link for ${d.school_name} — expires 1h`)
      window.open(d.magic_link, '_blank')
    } else {
      setImpResult(d.error ?? 'Failed')
    }
  }

  return (
    <div style={{ fontFamily: MONO, color: C.text }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.accentL, margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.1em' }}>ACCOUNT · SECURITY · IMPERSONATION</p>
      </div>

      {msg && (
        <div style={{ background: msg.type === 'ok' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)', border: `1px solid ${msg.type === 'ok' ? C.green : C.red}30`, borderRadius: 8, padding: '8px 14px', marginBottom: 20, fontSize: 11, color: msg.type === 'ok' ? C.green : C.red }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Account info */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 22 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: 16 }}>Account</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>USER ID</div>
            <div style={{ fontSize: 11, color: C.text, background: '#07071180', borderRadius: 6, padding: '7px 10px' }}>{uid || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>EMAIL</div>
            <div style={{ fontSize: 12, color: C.accentL, background: '#07071180', borderRadius: 6, padding: '7px 10px' }}>{email || '—'}</div>
          </div>
        </div>

        {/* Change password */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 22 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: 16 }}>Change Password</div>
          <form onSubmit={changePassword}>
            <input
              type="password"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="New password (min 8 chars)"
              minLength={8}
              style={{ width: '100%', background: '#07071180', border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, fontFamily: MONO, fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box', marginBottom: 14 }}
            />
            <button type="submit" disabled={saving} style={{ padding: '9px 20px', borderRadius: 7, border: 'none', background: saving ? C.muted : C.accent, color: '#fff', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving…' : 'CHANGE PASSWORD'}
            </button>
          </form>
        </div>

        {/* Impersonation */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 22, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase' }}>School Impersonation</div>
              <div style={{ fontSize: 10, color: C.red, marginTop: 4 }}>⚠ Generates a magic link to log in as the school principal. All actions are logged.</div>
            </div>
            <button onClick={() => setShowImp(s => !s)} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.amber}`, background: C.amber + '15', color: C.amber, fontFamily: MONO, fontSize: 11, cursor: 'pointer' }}>
              {showImp ? 'CANCEL' : 'IMPERSONATE →'}
            </button>
          </div>

          {showImp && (
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  placeholder="School UUID…"
                  value={schoolId}
                  onChange={e => setSchoolId(e.target.value)}
                  style={{ flex: 1, background: '#07071180', border: `1px solid ${C.amber}40`, borderRadius: 7, color: C.text, fontFamily: MONO, fontSize: 12, padding: '9px 12px', outline: 'none' }}
                />
                <button onClick={impersonate} style={{ padding: '9px 18px', borderRadius: 7, border: 'none', background: C.amber, color: '#000', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  GO →
                </button>
              </div>
              {impResult && <div style={{ marginTop: 10, fontSize: 11, color: impResult.includes('Failed') ? C.red : C.green }}>{impResult}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
