'use client'

import { useEffect, useState, useCallback } from 'react'

const C = { surface: '#0f0f1e', border: 'rgba(99,102,241,0.18)', text: '#e2e8f0', muted: '#475569', accent: '#6366f1', accentL: '#818cf8', green: '#4ade80', red: '#f87171', amber: '#fbbf24' }
const MONO = '"JetBrains Mono", monospace'

type LogRow = { id: string; actor_email: string; action: string; entity_type: string; entity_id: string | null; meta: Record<string, unknown>; created_at: string }

const ACTION_COLORS: Record<string, string> = {
  billing_extend: C.green, billing_suspend: C.red, billing_reactivate: C.green,
  feature_toggle: C.accentL, impersonate_start: C.amber, user_suspend: C.red,
  db_repair: C.amber, design_update: C.accentL, config_pricing_update: C.amber,
  config_maintenance: C.amber, export_school_data: C.accent,
}

export default function LogsPage() {
  const [logs,    setLogs]    = useState<LogRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(0)
  const [search,  setSearch]  = useState('')
  const [action,  setAction]  = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback((p: number) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), limit: '50' })
    if (search) params.set('q', search)
    if (action) params.set('action', action)
    fetch(`/api/super/logs?${params}`)
      .then(r => r.json())
      .then(d => { setLogs(d.logs ?? []); setTotal(d.total ?? 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [search, action])

  useEffect(() => { setPage(0); load(0) }, [load])

  const totalPages = Math.ceil(total / 50)

  return (
    <div style={{ fontFamily: MONO, color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.accentL, margin: 0 }}>System Logs</h1>
          <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.1em' }}>AUDIT TRAIL — {total.toLocaleString()} EVENTS</p>
        </div>
        <button onClick={() => load(page)} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.accentL, fontFamily: MONO, fontSize: 11, cursor: 'pointer' }}>
          ↺ REFRESH
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input placeholder="Search email…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: 200, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: MONO, fontSize: 12, padding: '7px 12px', outline: 'none' }} />
        <input placeholder="Filter action…" value={action} onChange={e => setAction(e.target.value)}
          style={{ width: 180, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: MONO, fontSize: 12, padding: '7px 12px', outline: 'none' }} />
      </div>

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 12 }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Time', 'Actor', 'Action', 'Entity', 'Meta'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 9, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(l => {
                const actionColor = ACTION_COLORS[l.action] ?? C.muted
                const isExp = expanded === l.id
                return (
                  <>
                    <tr key={l.id}
                      onClick={() => setExpanded(isExp ? null : l.id)}
                      style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(99,102,241,0.05)'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 14px', color: C.muted, whiteSpace: 'nowrap', fontSize: 11 }}>
                        {new Date(l.created_at).toLocaleString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11 }}>{l.actor_email || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 10, color: actionColor, background: actionColor + '18', borderRadius: 4, padding: '2px 7px', border: `1px solid ${actionColor}30` }}>
                          {l.action}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: C.muted, fontSize: 11 }}>
                        {l.entity_type}{l.entity_id ? ` · ${l.entity_id.slice(0, 8)}…` : ''}
                      </td>
                      <td style={{ padding: '10px 14px', color: C.muted, fontSize: 10 }}>
                        {isExp ? '▲' : '▼'}
                      </td>
                    </tr>
                    {isExp && (
                      <tr key={`${l.id}-meta`} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td colSpan={5} style={{ padding: '0 14px 12px 14px' }}>
                          <pre style={{ fontFamily: MONO, fontSize: 11, color: C.text, background: '#07071190', borderRadius: 6, padding: '10px 12px', margin: 0, overflowX: 'auto' }}>
                            {JSON.stringify(l.meta, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
              {logs.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 12 }}>No logs found.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18 }}>
          <button onClick={() => { setPage(p => { const n = Math.max(0, p - 1); load(n); return n }) }} disabled={page === 0}
            style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: page === 0 ? C.muted : C.accentL, fontFamily: MONO, fontSize: 11, cursor: page === 0 ? 'default' : 'pointer' }}>
            ← Prev
          </button>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted, padding: '6px 0' }}>
            {page + 1} / {totalPages}
          </span>
          <button onClick={() => { setPage(p => { const n = Math.min(totalPages - 1, p + 1); load(n); return n }) }} disabled={page === totalPages - 1}
            style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: page === totalPages - 1 ? C.muted : C.accentL, fontFamily: MONO, fontSize: 11, cursor: page === totalPages - 1 ? 'default' : 'pointer' }}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
