'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Notice {
  id: string
  title: string
  content: string
  target_audience: string
  created_at: string
}

const AUDIENCES = [
  { v: 'all',      l: 'Everyone' },
  { v: 'teachers', l: 'Teachers only' },
  { v: 'students', l: 'Students only' },
  { v: 'parents',  l: 'Parents only' },
  { v: 'staff',    l: 'All staff' },
]

function timeSince(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function NoticesPage() {
  const router  = useRouter()
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)
  const [form, setForm]       = useState({ title: '', content: '', target_audience: 'all' })
  const [err, setErr]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/notices?limit=50')
    if (r.status === 401) { router.push('/login'); return }
    if (r.ok) {
      const d = await r.json() as { notices: Notice[] }
      setNotices(d.notices)
    }
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.content.trim()) { setErr('Title and content are required'); return }
    setSaving(true); setErr('')
    const r = await fetch('/api/notices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (r.ok) {
      const n = await r.json() as Notice
      setNotices(prev => [n, ...prev])
      setForm({ title: '', content: '', target_audience: 'all' })
      setShowForm(false)
    } else {
      setErr('Failed to post notice')
    }
    setSaving(false)
  }

  async function deleteNotice(id: string) {
    if (!confirm('Delete this notice?')) return
    setDeleting(id)
    await fetch(`/api/notices?id=${id}`, { method: 'DELETE' })
    setNotices(prev => prev.filter(n => n.id !== id))
    setDeleting(null)
  }

  const CARD: React.CSSProperties = {
    background: 'white', border: '1px solid #f1f5f9',
    borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }

  return (
    <div style={{ padding: '20px 20px 48px', maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280', padding: '4px 8px', borderRadius: 8 }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>School Notices</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Post and manage announcements for staff, students, and parents</p>
        </div>
        <button
          onClick={() => setShowForm(f => !f)}
          style={{ padding: '10px 18px', background: 'linear-gradient(135deg,#1d4ed8,#059669)', color: 'white', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          {showForm ? '✕ Cancel' : '+ New Notice'}
        </button>
      </div>

      {/* New notice form */}
      {showForm && (
        <div style={{ ...CARD, padding: '20px', marginBottom: 20, border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8', marginBottom: 14 }}>New Notice</div>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Notice title…"
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit' }}
            />
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Notice content…"
              rows={4}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <select
              value={form.target_audience}
              onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, fontFamily: 'inherit' }}
            >
              {AUDIENCES.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
            </select>
            {err && <div style={{ color: '#dc2626', fontSize: 12 }}>{err}</div>}
            <button
              type="submit"
              disabled={saving}
              style={{ padding: '11px', background: saving ? '#93c5fd' : '#1d4ed8', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Posting…' : 'Post Notice'}
            </button>
          </form>
        </div>
      )}

      {/* Notices list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 100, background: '#f3f4f6', borderRadius: 16, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : notices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📢</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>No notices yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Post the first school notice using the button above</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notices.map(n => {
            const aud = AUDIENCES.find(a => a.v === n.target_audience)
            return (
              <div key={n.id} style={{ ...CARD, padding: '16px 20px', borderLeft: '4px solid #1d4ed8' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 6 }}>{n.title}</div>
                    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.content}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                      <span style={{ padding: '2px 10px', background: '#eff6ff', color: '#1d4ed8', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                        {aud?.l ?? n.target_audience}
                      </span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{timeSince(n.created_at)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteNotice(n.id)}
                    disabled={deleting === n.id}
                    style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, padding: '2px 6px', borderRadius: 6, lineHeight: 1 }}
                    title="Delete notice"
                  >
                    {deleting === n.id ? '…' : '×'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
