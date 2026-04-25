'use client'

import { useEffect, useState } from 'react'

const C = { surface: '#0f0f1e', border: 'rgba(99,102,241,0.18)', text: '#e2e8f0', muted: '#475569', accent: '#6366f1', accentL: '#818cf8', green: '#4ade80', red: '#f87171', amber: '#fbbf24' }
const MONO = '"JetBrains Mono", monospace'

type Engine = { name: string; configured: boolean; status: string }
type Provider = 'claude' | 'gemini'

export default function AIPage() {
  const [engines,  setEngines]  = useState<Engine[]>([])
  const [prompt,   setPrompt]   = useState('')
  const [provider, setProvider] = useState<Provider>('claude')
  const [model,    setModel]    = useState<'haiku' | 'sonnet' | 'opus'>('sonnet')
  const [reply,    setReply]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    fetch('/api/super/ai/openai')
      .then(r => r.json())
      .then(d => setEngines(d.engines ?? []))
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  async function ask() {
    if (!prompt.trim()) return
    setLoading(true)
    setReply('')
    const endpoint = provider === 'claude' ? '/api/super/ai/claude' : '/api/super/ai/gemini'
    const body: Record<string, string> = { prompt }
    if (provider === 'claude') body.model = model
    const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    setReply(d.reply ?? d.error ?? 'No response')
    setLoading(false)
  }

  return (
    <div style={{ fontFamily: MONO, color: C.text }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.accentL, margin: 0 }}>AI Engines</h1>
        <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.1em' }}>CLAUDE · GEMINI · API STATUS</p>
      </div>

      {/* Engine status */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
        {checking ? (
          <div style={{ color: C.muted, fontSize: 11 }}>Checking keys…</div>
        ) : engines.map(e => (
          <div key={e.name} style={{ background: C.surface, border: `1px solid ${e.configured ? C.green + '40' : C.red + '40'}`, borderRadius: 10, padding: '12px 16px', minWidth: 160 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: e.configured ? C.green : C.red, marginBottom: 4 }}>
              {e.configured ? '● ' : '○ '}{e.name}
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>{e.status}</div>
          </div>
        ))}
      </div>

      {/* AI Playground */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase', marginBottom: 16 }}>AI Playground</div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['claude', 'gemini'] as Provider[]).map(p => (
              <button key={p} onClick={() => setProvider(p)} style={{
                padding: '6px 14px', borderRadius: 6, fontFamily: MONO, fontSize: 11, cursor: 'pointer',
                border: `1px solid ${provider === p ? C.accent : C.border}`,
                background: provider === p ? C.accent + '22' : 'transparent',
                color: provider === p ? C.accentL : C.muted,
                textTransform: 'capitalize',
              }}>{p}</button>
            ))}
          </div>

          {provider === 'claude' && (
            <div style={{ display: 'flex', gap: 6 }}>
              {(['haiku', 'sonnet', 'opus'] as const).map(m => (
                <button key={m} onClick={() => setModel(m)} style={{
                  padding: '6px 12px', borderRadius: 6, fontFamily: MONO, fontSize: 10, cursor: 'pointer',
                  border: `1px solid ${model === m ? C.amber : C.border}`,
                  background: model === m ? C.amber + '18' : 'transparent',
                  color: model === m ? C.amber : C.muted,
                  textTransform: 'capitalize',
                }}>{m}</button>
              ))}
            </div>
          )}
        </div>

        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={4}
          placeholder="Enter prompt…"
          style={{ width: '100%', background: '#07071180', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: MONO, fontSize: 12, padding: '10px 12px', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
        />

        <button
          onClick={ask}
          disabled={loading || !prompt.trim()}
          style={{ marginTop: 10, padding: '9px 20px', borderRadius: 7, border: 'none', background: loading ? C.muted : C.accent, color: '#fff', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', letterSpacing: '0.06em' }}
        >
          {loading ? 'ASKING…' : 'ASK →'}
        </button>

        {reply && (
          <div style={{ marginTop: 18, background: '#07071180', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' }}>Response</div>
            <pre style={{ fontFamily: MONO, fontSize: 12, color: C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{reply}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
