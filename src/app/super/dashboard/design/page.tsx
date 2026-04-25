'use client'

import { useEffect, useState, useCallback } from 'react'

const C = { surface: '#0f0f1e', border: 'rgba(99,102,241,0.18)', text: '#e2e8f0', muted: '#475569', accent: '#6366f1', accentL: '#818cf8', green: '#4ade80', red: '#f87171', amber: '#fbbf24' }
const MONO = '"JetBrains Mono", monospace'

type School = { id: string; name: string; county: string; isActive: boolean }

export default function DesignPage() {
  const [schools,    setSchools]    = useState<School[]>([])
  const [selected,   setSelected]   = useState<string>('')
  const [themeColor, setThemeColor] = useState('#6366f1')
  const [logoUrl,    setLogoUrl]    = useState('')
  const [logoFile,   setLogoFile]   = useState<File | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState('')

  useEffect(() => {
    fetch('/api/super/fleet').then(r => r.json()).then(d => setSchools(d.schools ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const loadDesign = useCallback((schoolId: string) => {
    if (!schoolId) return
    fetch(`/api/super/design/${schoolId}`).then(r => r.json()).then(d => {
      setThemeColor(d.school?.theme_color ?? '#6366f1')
      setLogoUrl(d.school?.logo_url ?? '')
    }).catch(() => {})
  }, [])

  function selectSchool(id: string) {
    setSelected(id)
    setLogoFile(null)
    loadDesign(id)
  }

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  async function save() {
    if (!selected) return
    setSaving(true)

    if (logoFile) {
      const form = new FormData()
      form.append('school_id', selected)
      form.append('file', logoFile)
      const r = await fetch('/api/super/design/upload-logo', { method: 'POST', body: form })
      if (!r.ok) { flash('Logo upload failed'); setSaving(false); return }
      const d = await r.json().catch(() => ({}))
      setLogoUrl(d.logo_url ?? '')
      setLogoFile(null)
    }

    const r = await fetch(`/api/super/design/${selected}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme_color: themeColor }),
    })
    setSaving(false)
    if (r.ok) { flash('Saved') } else { flash('Failed') }
  }

  const school = schools.find(s => s.id === selected)

  return (
    <div style={{ fontFamily: MONO, color: C.text }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.accentL, margin: 0 }}>Design / Brand</h1>
        <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.1em' }}>THEME COLOR · LOGO · SCHOOL BRANDING</p>
      </div>

      {msg && <div style={{ background: 'rgba(74,222,128,0.12)', border: `1px solid ${C.green}30`, borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 11, color: C.green }}>✓ {msg}</div>}

      {loading ? (
        <div style={{ color: C.muted, fontSize: 12 }}>Loading schools…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
          {/* School list */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', maxHeight: 500, overflowY: 'auto' }}>
            {schools.map(s => (
              <div key={s.id}
                onClick={() => selectSchool(s.id)}
                style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, background: selected === s.id ? C.accent + '22' : 'transparent', borderLeft: selected === s.id ? `3px solid ${C.accent}` : '3px solid transparent' }}
                onMouseEnter={e => { if (s.id !== selected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(99,102,241,0.05)' }}
                onMouseLeave={e => { if (s.id !== selected) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <div style={{ fontSize: 12, fontWeight: selected === s.id ? 700 : 400, color: selected === s.id ? C.accentL : C.text }}>{s.name}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.county}</div>
              </div>
            ))}
          </div>

          {/* Editor */}
          {school ? (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 22 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 20 }}>{school.name}</div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Theme Color</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="color" value={themeColor} onChange={e => setThemeColor(e.target.value)}
                    style={{ width: 48, height: 36, borderRadius: 7, border: `1px solid ${C.border}`, cursor: 'pointer', background: 'transparent', padding: 2 }} />
                  <input value={themeColor} onChange={e => setThemeColor(e.target.value)}
                    style={{ width: 100, background: '#07071180', border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, fontFamily: MONO, fontSize: 13, padding: '8px 12px', outline: 'none' }} />
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: themeColor, boxShadow: `0 0 10px ${themeColor}` }} />
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>School Logo</div>
                {logoUrl && !logoFile && (
                  <div style={{ marginBottom: 10 }}>
                    <img src={logoUrl} alt="logo" style={{ height: 60, borderRadius: 8, border: `1px solid ${C.border}`, objectFit: 'contain', background: '#fff', padding: 4 }} />
                  </div>
                )}
                {logoFile && (
                  <div style={{ fontSize: 11, color: C.accentL, marginBottom: 8 }}>
                    ✓ {logoFile.name} ({(logoFile.size / 1024).toFixed(1)} KB)
                  </div>
                )}
                <input type="file" accept="image/*" onChange={e => setLogoFile(e.target.files?.[0] ?? null)}
                  style={{ fontFamily: MONO, fontSize: 11, color: C.muted, cursor: 'pointer' }} />
              </div>

              <button onClick={save} disabled={saving}
                style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: saving ? C.muted : C.accent, color: '#fff', fontFamily: MONO, fontWeight: 700, fontSize: 12, cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'SAVING…' : 'SAVE CHANGES'}
              </button>
            </div>
          ) : (
            <div style={{ background: C.surface, border: `1px dashed ${C.border}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 12 }}>
              Select a school to edit branding
            </div>
          )}
        </div>
      )}
    </div>
  )
}
