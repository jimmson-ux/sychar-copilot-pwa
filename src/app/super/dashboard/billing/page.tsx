'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatKES, getDaysUntilExpiry, getExpiryBadge } from '@/lib/billing'
import type { School } from '@/lib/billing'

const C = { surface: '#0f0f1e', border: 'rgba(99,102,241,0.18)', text: '#e2e8f0', muted: '#475569', accent: '#6366f1', accentL: '#818cf8', green: '#4ade80', amber: '#fbbf24', red: '#f87171', blue: '#38bdf8' }
const MONO = '"JetBrains Mono", monospace'

type InvoicedSchool = School & { invoice: { basePrice: number; addonsPrice: number; totalYearly: number; tier: string } | null; daysLeft: number }
type BillingStats   = { totalARR: number; activeARR: number }

export default function BillingPage() {
  const [schools, setSchools] = useState<InvoicedSchool[]>([])
  const [stats,   setStats]   = useState<BillingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState<string | null>(null)
  const [msg,     setMsg]     = useState('')
  const [search,  setSearch]  = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/super/billing').then(r => r.json()).then(d => {
      setSchools(d.schools ?? [])
      setStats(d.stats ?? null)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  async function extend(schoolId: string, days: number) {
    setBusy(schoolId)
    const r = await fetch('/api/super/billing/extend', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school_id: schoolId, days }) })
    setBusy(null)
    if (r.ok) { flash(`Extended ${days} days`); load() } else flash('Failed')
  }

  async function suspend(schoolId: string) {
    if (!confirm('Suspend this school?')) return
    setBusy(schoolId)
    await fetch('/api/super/billing/suspend', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school_id: schoolId }) })
    setBusy(null); flash('Suspended'); load()
  }

  async function reactivate(schoolId: string) {
    setBusy(schoolId)
    await fetch('/api/super/billing/reactivate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school_id: schoolId }) })
    setBusy(null); flash('Reactivated'); load()
  }

  const visible = schools.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ fontFamily: MONO, color: C.text }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.accentL, margin: 0 }}>Billing Control</h1>
        <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.1em' }}>EXTEND · SUSPEND · REACTIVATE</p>
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total ARR',  value: formatKES(stats.totalARR),  color: C.accentL },
            { label: 'Active ARR', value: formatKES(stats.activeARR), color: C.green   },
          ].map(s => (
            <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px', flex: 1 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {msg && <div style={{ background: 'rgba(74,222,128,0.12)', border: `1px solid ${C.green}30`, borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 11, color: C.green }}>✓ {msg}</div>}

      <input placeholder="Search school…" value={search} onChange={e => setSearch(e.target.value)}
        style={{ width: 220, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: MONO, fontSize: 12, padding: '7px 12px', outline: 'none', marginBottom: 18 }} />

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 12 }}>Loading…</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['School', 'Tier', 'Base', 'Add-ons', 'Total/yr', 'Expiry', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 9, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(s => {
                const days  = getDaysUntilExpiry(s.subscription_expires_at)
                const badge = getExpiryBadge(days)
                const bHex  = badge.color === 'green' ? C.green : badge.color === 'amber' ? C.amber : C.red
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: s.is_active ? 1 : 0.5 }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(99,102,241,0.05)'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{s.county}</div>
                    </td>
                    <td style={{ padding: '11px 14px', color: C.muted, fontSize: 10 }}>{s.invoice?.tier ?? '—'}</td>
                    <td style={{ padding: '11px 14px' }}>{s.invoice ? formatKES(s.invoice.basePrice) : '—'}</td>
                    <td style={{ padding: '11px 14px', color: s.invoice?.addonsPrice ? C.blue : C.muted }}>{s.invoice ? formatKES(s.invoice.addonsPrice) : '—'}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: C.green }}>{s.invoice ? formatKES(s.invoice.totalYearly) : '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 10, color: bHex, background: bHex + '18', border: `1px solid ${bHex}30`, borderRadius: 4, padding: '3px 7px' }}>{badge.label}</span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 10, color: s.is_active ? C.green : C.red, background: (s.is_active ? C.green : C.red) + '15', borderRadius: 4, padding: '3px 8px' }}>
                        {s.is_active ? '● live' : '● off'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', display: 'flex', gap: 6 }}>
                      <button onClick={() => extend(s.id, 30)} disabled={busy === s.id} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${C.accent}`, background: C.accent + '22', color: C.accentL, opacity: busy === s.id ? 0.5 : 1 }}>+30d</button>
                      <button onClick={() => extend(s.id, 365)} disabled={busy === s.id} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${C.accent}`, background: C.accent + '22', color: C.accentL, opacity: busy === s.id ? 0.5 : 1 }}>+1yr</button>
                      {s.is_active
                        ? <button onClick={() => suspend(s.id)} disabled={busy === s.id} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${C.red}`, background: C.red + '15', color: C.red, opacity: busy === s.id ? 0.5 : 1 }}>Suspend</button>
                        : <button onClick={() => reactivate(s.id)} disabled={busy === s.id} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${C.green}`, background: C.green + '15', color: C.green, opacity: busy === s.id ? 0.5 : 1 }}>Reactivate</button>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
