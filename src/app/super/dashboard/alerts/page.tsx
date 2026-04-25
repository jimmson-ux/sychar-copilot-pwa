'use client'

import { useEffect, useState, useCallback } from 'react'

const C = { surface: '#0f0f1e', border: 'rgba(99,102,241,0.18)', text: '#e2e8f0', muted: '#475569', accent: '#6366f1', accentL: '#818cf8', green: '#4ade80', red: '#f87171', amber: '#fbbf24' }
const MONO = '"JetBrains Mono", monospace'

type Alert = { id: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; at: string }

const SEV_COLOR: Record<Alert['severity'], string> = { critical: C.red, warning: C.amber, info: C.accentL }

export default function AlertsPage() {
  const [alerts,   setAlerts]   = useState<Alert[]>([])
  const [loading,  setLoading]  = useState(true)
  const [checkedAt, setChecked] = useState('')
  const [title,    setTitle]    = useState('')
  const [detail,   setDetail]   = useState('')
  const [sev,      setSev]      = useState<'info' | 'warning' | 'critical'>('warning')
  const [posting,  setPosting]  = useState(false)
  const [msg,      setMsg]      = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/super/alerts')
      .then(r => r.json())
      .then(d => { setAlerts(d.alerts ?? []); setChecked(d.checkedAt ?? '') })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function post() {
    if (!title.trim()) return
    setPosting(true)
    await fetch('/api/super/alerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, detail, severity: sev }) })
    setPosting(false)
    setTitle(''); setDetail('')
    setMsg('Alert logged'); setTimeout(() => setMsg(''), 2500)
    load()
  }

  return (
    <div style={{ fontFamily: MONO, color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.accentL, margin: 0 }}>Alerts</h1>
          {checkedAt && <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.08em' }}>Checked: {new Date(checkedAt).toLocaleTimeString()}</p>}
        </div>
        <button onClick={load} style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.accentL, fontFamily: MONO, fontSize: 11, cursor: 'pointer' }}>↺ REFRESH</button>
      </div>

      {/* Active alerts */}
      {loading ? (
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 24 }}>Checking…</div>
      ) : alerts.length === 0 ? (
        <div style={{ background: 'rgba(74,222,128,0.08)', border: `1px solid ${C.green}30`, borderRadius: 10, padding: '14px 18px', marginBottom: 24, color: C.green, fontSize: 12 }}>
          ● All systems healthy — no active alerts
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {alerts.map(a => {
            const col = SEV_COLOR[a.severity]
            return (
              <div key={a.id} style={{ background: col + '10', border: `1px solid ${col}30`, borderRadius: 10, padding: '12px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <span style={{ fontSize: 14, color: col, marginTop: 1 }}>{a.severity === 'critical' ? '⛔' : a.severity === 'warning' ? '⚠' : 'ℹ'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: col }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{a.detail}</div>
                </div>
                <span style={{ fontSize: 10, color: C.muted, whiteSpace: 'nowrap' }}>
                  {new Date(a.at).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Manual alert */}
      {msg && <div style={{ background: 'rgba(74,222,128,0.12)', border: `1px solid ${C.green}30`, borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 11, color: C.green }}>✓ {msg}</div>}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: 16 }}>Log Manual Alert</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['info', 'warning', 'critical'] as const).map(s => (
            <button key={s} onClick={() => setSev(s)} style={{ padding: '5px 12px', borderRadius: 6, fontFamily: MONO, fontSize: 10, cursor: 'pointer', border: `1px solid ${sev === s ? SEV_COLOR[s] : C.border}`, background: sev === s ? SEV_COLOR[s] + '22' : 'transparent', color: sev === s ? SEV_COLOR[s] : C.muted, textTransform: 'uppercase' }}>{s}</button>
          ))}
        </div>
        <input placeholder="Alert title…" value={title} onChange={e => setTitle(e.target.value)}
          style={{ width: '100%', background: '#07071180', border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, fontFamily: MONO, fontSize: 12, padding: '9px 12px', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
        <input placeholder="Detail (optional)…" value={detail} onChange={e => setDetail(e.target.value)}
          style={{ width: '100%', background: '#07071180', border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, fontFamily: MONO, fontSize: 12, padding: '9px 12px', outline: 'none', boxSizing: 'border-box', marginBottom: 14 }} />
        <button onClick={post} disabled={posting || !title.trim()} style={{ padding: '9px 20px', borderRadius: 7, border: 'none', background: posting ? C.muted : C.accent, color: '#fff', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: posting ? 'wait' : 'pointer' }}>
          {posting ? 'Logging…' : 'LOG ALERT'}
        </button>
      </div>
    </div>
  )
}
