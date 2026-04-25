'use client'

import { useEffect, useState } from 'react'

const C = { surface: '#0f0f1e', border: 'rgba(99,102,241,0.18)', text: '#e2e8f0', muted: '#475569', accent: '#6366f1', accentL: '#818cf8', green: '#4ade80', red: '#f87171', amber: '#fbbf24', blue: '#38bdf8' }
const MONO = '"JetBrains Mono", monospace'

type Pricing = { gate_pass: number; visitor_log: number; staff_attendance: number; pocket_money: number; bread_voucher: number }
type ApiService = { name: string; ok: boolean; latencyMs: number; error?: string }

const ADDON_LABELS: Record<keyof Pricing, string> = {
  gate_pass: 'Gate Pass', visitor_log: 'Visitor Log', staff_attendance: 'Staff Attendance', pocket_money: 'Pocket Money', bread_voucher: 'Bread Voucher',
}

export default function ConfigPage() {
  const [pricing,    setPricing]    = useState<Pricing | null>(null)
  const [draft,      setDraft]      = useState<Pricing | null>(null)
  const [services,   setServices]   = useState<ApiService[]>([])
  const [maintenance, setMaintenance] = useState(false)
  const [maintMsg,   setMaintMsg]   = useState('')
  const [loading,    setLoading]    = useState(true)
  const [checking,   setChecking]   = useState(false)
  const [saving,     setSaving]     = useState('')
  const [msg,        setMsg]        = useState('')

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  useEffect(() => {
    Promise.all([
      fetch('/api/super/config/pricing').then(r => r.json()),
      fetch('/api/super/config/maintenance').then(r => r.json()),
    ]).then(([p, m]) => {
      const pr = p.pricing as Pricing
      setPricing(pr); setDraft(pr)
      setMaintenance(m.maintenance_mode ?? false)
      setMaintMsg(m.maintenance_message ?? '')
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function savePricing() {
    if (!draft) return
    setSaving('pricing')
    const r = await fetch('/api/super/config/pricing', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) })
    setSaving('')
    if (r.ok) { setPricing(draft); flash('Pricing saved') } else flash('Failed')
  }

  async function saveMaintenance() {
    setSaving('maint')
    const r = await fetch('/api/super/config/maintenance', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ maintenance_mode: maintenance, maintenance_message: maintMsg }) })
    setSaving('')
    if (r.ok) { flash('Maintenance settings saved') } else { flash('Failed') }
  }

  async function checkApis() {
    setChecking(true)
    const r = await fetch('/api/super/config/api-health')
    const d = await r.json().catch(() => ({}))
    setServices(d.services ?? [])
    setChecking(false)
  }

  if (loading) return <div style={{ color: C.muted, fontFamily: MONO, fontSize: 12, paddingTop: 60, textAlign: 'center' }}>Loading…</div>

  return (
    <div style={{ fontFamily: MONO, color: C.text }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.accentL, margin: 0 }}>Config</h1>
        <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.1em' }}>PRICING · MAINTENANCE · API HEALTH</p>
      </div>

      {msg && <div style={{ background: 'rgba(74,222,128,0.12)', border: `1px solid ${C.green}30`, borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 11, color: C.green }}>✓ {msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Add-on pricing */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: 16 }}>Add-on Pricing (KES / yr)</div>
          {draft && (Object.keys(ADDON_LABELS) as (keyof Pricing)[]).map(k => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: C.text }}>{ADDON_LABELS[k]}</span>
              <input
                type="number"
                min="0"
                value={draft[k]}
                onChange={e => setDraft(p => p ? { ...p, [k]: parseInt(e.target.value) || 0 } : p)}
                style={{ width: 100, background: '#07071180', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: MONO, fontSize: 12, padding: '5px 10px', outline: 'none', textAlign: 'right' }}
              />
            </div>
          ))}
          <button onClick={savePricing} disabled={saving === 'pricing'} style={{ marginTop: 10, padding: '9px 20px', borderRadius: 7, border: 'none', background: saving === 'pricing' ? C.muted : C.accent, color: '#fff', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: saving === 'pricing' ? 'wait' : 'pointer' }}>
            {saving === 'pricing' ? 'Saving…' : 'SAVE PRICING'}
          </button>
        </div>

        {/* Maintenance */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: 16 }}>Maintenance Mode</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <button onClick={() => setMaintenance(m => !m)} style={{
              width: 52, height: 28, borderRadius: 14, border: `1px solid ${maintenance ? C.red : C.border}`,
              background: maintenance ? C.red + '33' : 'rgba(255,255,255,0.06)', cursor: 'pointer', position: 'relative',
            }}>
              <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: '50%', background: maintenance ? C.red : C.muted, position: 'absolute', top: 4, left: maintenance ? 30 : 4, transition: 'left 0.2s' }} />
            </button>
            <span style={{ fontSize: 13, color: maintenance ? C.red : C.muted, fontWeight: maintenance ? 700 : 400 }}>
              {maintenance ? 'ON — site in maintenance' : 'OFF — site is live'}
            </span>
          </div>
          <textarea
            value={maintMsg}
            onChange={e => setMaintMsg(e.target.value)}
            rows={3}
            placeholder="Maintenance message shown to users…"
            style={{ width: '100%', background: '#07071180', border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, fontFamily: MONO, fontSize: 12, padding: '9px 12px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 14 }}
          />
          <button onClick={saveMaintenance} disabled={saving === 'maint'} style={{ padding: '9px 20px', borderRadius: 7, border: 'none', background: saving === 'maint' ? C.muted : maintenance ? C.red : C.green, color: '#fff', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: saving === 'maint' ? 'wait' : 'pointer' }}>
            {saving === 'maint' ? 'Saving…' : 'SAVE'}
          </button>
        </div>

        {/* API Health */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase' }}>API Key Health Check</div>
            <button onClick={checkApis} disabled={checking} style={{ padding: '7px 16px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.accentL, fontFamily: MONO, fontSize: 11, cursor: checking ? 'wait' : 'pointer' }}>
              {checking ? 'Checking…' : '● CHECK NOW'}
            </button>
          </div>
          {services.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 12 }}>Click "Check Now" to ping all configured APIs.</div>
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {services.map(s => (
                <div key={s.name} style={{ background: s.ok ? C.green + '10' : C.red + '10', border: `1px solid ${s.ok ? C.green : C.red}30`, borderRadius: 10, padding: '12px 18px', minWidth: 160 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: s.ok ? C.green : C.red, marginBottom: 4 }}>{s.ok ? '● ' : '○ '}{s.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{s.ok ? `${s.latencyMs}ms` : (s.error ?? 'Error')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
