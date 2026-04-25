'use client'

import { useEffect, useState, useCallback } from 'react'

const C = { surface: '#0f0f1e', border: 'rgba(99,102,241,0.18)', text: '#e2e8f0', muted: '#475569', accent: '#6366f1', accentL: '#818cf8', green: '#4ade80', red: '#f87171', amber: '#fbbf24' }
const MONO = '"JetBrains Mono", monospace'

type UserRow = { userId: string; schoolId: string; schoolName: string; role: string; subRole: string | null; isActive: boolean; createdAt: string }

export default function UsersPage() {
  const [users,   setUsers]   = useState<UserRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(0)
  const [search,  setSearch]  = useState('')
  const [busy,    setBusy]    = useState<string | null>(null)
  const [msg,     setMsg]     = useState('')

  const load = useCallback((p: number) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), limit: '50' })
    if (search) params.set('q', search)
    fetch(`/api/super/users?${params}`)
      .then(r => r.json())
      .then(d => { setUsers(d.users ?? []); setTotal(d.total ?? 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [search])

  useEffect(() => { setPage(0); load(0) }, [load])

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  async function action(endpoint: string, userId: string, body?: Record<string, unknown>) {
    setBusy(userId)
    const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body }) })
    setBusy(null)
    if (r.ok) { flash('Done'); load(page) }
    else { const d = await r.json().catch(() => ({})); flash(d.error ?? 'Failed') }
  }

  async function resetPassword(userId: string) {
    const pw = prompt('New password (min 8 chars):')
    if (!pw || pw.length < 8) return
    setBusy(userId)
    const r = await fetch(`/api/super/users/${userId}/reset-password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ new_password: pw }) })
    setBusy(null)
    if (r.ok) { flash('Password reset') } else { flash('Failed') }
  }

  async function changeRole(userId: string) {
    const role = prompt('New role (principal/deputy/teacher/bursar/nurse/admin):')
    if (!role) return
    setBusy(userId)
    const r = await fetch(`/api/super/users/${userId}/change-role`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role }) })
    setBusy(null)
    if (r.ok) { flash('Role updated'); load(page) } else flash('Failed')
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div style={{ fontFamily: MONO, color: C.text }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.accentL, margin: 0 }}>Users</h1>
        <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.1em' }}>STAFF RECORDS — {total.toLocaleString()} TOTAL</p>
      </div>

      {msg && <div style={{ background: 'rgba(74,222,128,0.12)', border: `1px solid ${C.green}30`, borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 11, color: C.green }}>✓ {msg}</div>}

      <input placeholder="Search school or role…" value={search} onChange={e => setSearch(e.target.value)}
        style={{ width: 240, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: MONO, fontSize: 12, padding: '7px 12px', outline: 'none', marginBottom: 18 }} />

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 12 }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['User ID', 'School', 'Role', 'Sub-Role', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 9, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.userId} style={{ borderBottom: `1px solid ${C.border}`, opacity: u.isActive ? 1 : 0.5 }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(99,102,241,0.05)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 14px', color: C.muted, fontSize: 10 }}>{u.userId.slice(0, 12)}…</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{u.schoolName}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 10, color: C.accentL, background: C.accent + '18', borderRadius: 4, padding: '2px 8px' }}>{u.role}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {u.subRole === 'super_admin'
                      ? <span style={{ fontSize: 10, color: C.amber, background: C.amber + '18', borderRadius: 4, padding: '2px 8px' }}>super_admin</span>
                      : <span style={{ color: C.muted }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 10, color: u.isActive ? C.green : C.red }}>{u.isActive ? '● active' : '● suspended'}</span>
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={() => resetPassword(u.userId)} disabled={busy === u.userId} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: MONO, opacity: busy === u.userId ? 0.5 : 1 }}>Reset PW</button>
                      <button onClick={() => action(`/api/super/users/${u.userId}/magic-link`, u.userId)} disabled={busy === u.userId} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${C.accent}`, background: C.accent + '15', color: C.accentL, fontFamily: MONO, opacity: busy === u.userId ? 0.5 : 1 }}>Magic Link</button>
                      <button onClick={() => changeRole(u.userId)} disabled={busy === u.userId} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${C.amber}`, background: C.amber + '15', color: C.amber, fontFamily: MONO, opacity: busy === u.userId ? 0.5 : 1 }}>Role</button>
                      {u.isActive && <button onClick={() => action(`/api/super/users/${u.userId}/suspend`, u.userId)} disabled={busy === u.userId} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${C.red}`, background: C.red + '15', color: C.red, fontFamily: MONO, opacity: busy === u.userId ? 0.5 : 1 }}>Suspend</button>}
                      <button onClick={() => action(`/api/super/users/${u.userId}/revoke-sessions`, u.userId)} disabled={busy === u.userId} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${C.red}`, background: C.red + '10', color: C.red, fontFamily: MONO, opacity: busy === u.userId ? 0.5 : 1 }}>Revoke</button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 12 }}>No users found.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18 }}>
          <button onClick={() => { setPage(p => { const n = Math.max(0, p - 1); load(n); return n }) }} disabled={page === 0}
            style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: page === 0 ? C.muted : C.accentL, fontFamily: MONO, fontSize: 11, cursor: page === 0 ? 'default' : 'pointer' }}>← Prev</button>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted, padding: '6px 0' }}>{page + 1} / {totalPages}</span>
          <button onClick={() => { setPage(p => { const n = Math.min(totalPages - 1, p + 1); load(n); return n }) }} disabled={page === totalPages - 1}
            style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: page === totalPages - 1 ? C.muted : C.accentL, fontFamily: MONO, fontSize: 11, cursor: page === totalPages - 1 ? 'default' : 'pointer' }}>Next →</button>
        </div>
      )}
    </div>
  )
}
