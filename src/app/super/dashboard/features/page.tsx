'use client'

import { useEffect, useState, useCallback } from 'react'
import { ADDON_META } from '@/lib/features'
import type { SchoolFeatures } from '@/lib/features'

const C = { bg: '#070711', surface: '#0f0f1e', border: 'rgba(99,102,241,0.18)', text: '#e2e8f0', muted: '#475569', accent: '#6366f1', accentL: '#818cf8', green: '#4ade80', red: '#f87171' }
const MONO = '"JetBrains Mono", monospace'

type School = { id: string; name: string; county: string; features: SchoolFeatures; isActive: boolean }

export default function FeaturesPage() {
  const [schools,  setSchools]  = useState<School[]>([])
  const [loading,  setLoading]  = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [search,   setSearch]   = useState('')
  const [msg,      setMsg]      = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/super/fleet')
      .then(r => r.json())
      .then(d => setSchools(d.schools ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(schoolId: string, feature: keyof SchoolFeatures, enabled: boolean) {
    const key = `${schoolId}:${feature}`
    setToggling(key)
    const r = await fetch('/api/super/features/toggle', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId, feature, enabled }),
    })
    if (r.ok) {
      setSchools(prev => prev.map(s => s.id === schoolId
        ? { ...s, features: { ...s.features, [feature]: enabled } }
        : s
      ))
      setMsg(`${feature} ${enabled ? 'enabled' : 'disabled'}`)
      setTimeout(() => setMsg(''), 2500)
    }
    setToggling(null)
  }

  const visible = schools.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  )

  const keys = Object.keys(ADDON_META) as (keyof SchoolFeatures)[]

  return (
    <div style={{ fontFamily: MONO, color: C.text }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.accentL, margin: 0 }}>Feature Flags</h1>
        <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.1em' }}>TOGGLE ADD-ONS PER SCHOOL</p>
      </div>

      {msg && (
        <div style={{ background: 'rgba(74,222,128,0.12)', border: `1px solid ${C.green}30`, borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 11, color: C.green }}>
          ✓ {msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center' }}>
        <input placeholder="Search school…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: 220, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: MONO, fontSize: 12, padding: '7px 12px', outline: 'none' }} />
        <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>{visible.length} schools</span>
      </div>

      {loading ? (
        <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', paddingTop: 60 }}>Loading…</div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase' }}>School</th>
                {keys.map(k => (
                  <th key={k} style={{ padding: '10px 10px', textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', color: C.muted, textTransform: 'uppercase', minWidth: 90 }}>
                    {ADDON_META[k].label.split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(s => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: s.isActive ? 1 : 0.5 }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(99,102,241,0.05)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                >
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ fontWeight: 600, color: C.text }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{s.county}</div>
                  </td>
                  {keys.map(k => {
                    const on  = s.features?.[k] === true
                    const key = `${s.id}:${k}`
                    const busy = toggling === key
                    return (
                      <td key={k} style={{ padding: '11px 10px', textAlign: 'center' }}>
                        <button
                          disabled={busy}
                          onClick={() => toggle(s.id, k, !on)}
                          style={{
                            width: 48, height: 24, borderRadius: 12,
                            background: on ? C.green + '33' : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${on ? C.green : C.border}`,
                            cursor: busy ? 'wait' : 'pointer',
                            position: 'relative', transition: 'all 0.2s',
                            opacity: busy ? 0.5 : 1,
                          }}
                        >
                          <span style={{
                            display: 'inline-block', width: 16, height: 16, borderRadius: '50%',
                            background: on ? C.green : C.muted,
                            position: 'absolute', top: 3, left: on ? 28 : 4, transition: 'left 0.2s',
                          }} />
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
