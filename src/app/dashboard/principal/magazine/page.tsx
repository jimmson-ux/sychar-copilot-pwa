'use client'

import { useState, useEffect, useCallback } from 'react'

type ContentItem = {
  id: string; section: string; title: string; body: string | null;
  image_url: string | null; featured: boolean; approved: boolean;
  parental_consent: boolean; tags: string[]; published_at: string | null; created_at: string;
}

const SECTIONS = ['about', 'highlights', 'achievements', 'arts', 'sports', 'academics', 'leadership', 'community']
const SECTION_ICONS: Record<string, string> = {
  about: '🏫', highlights: '✨', achievements: '🏆', arts: '🎨',
  sports: '⚽', academics: '📚', leadership: '👑', community: '🤝',
}

export default function MagazinePage() {
  const [items, setItems]         = useState<ContentItem[]>([])
  const [filterSec, setFilterSec] = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState('')
  const [form, setForm] = useState({
    section: 'highlights', title: '', body: '', image_url: '', featured: false, tags: '',
  })

  const load = useCallback(async () => {
    const r = await fetch('/api/magazine/content')
    if (r.ok) { const d = await r.json(); setItems(d.content ?? []) }
  }, [])

  useEffect(() => { load() }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg('')
    const r = await fetch('/api/magazine/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section:   form.section,
        title:     form.title,
        body:      form.body   || undefined,
        image_url: form.image_url || undefined,
        featured:  form.featured,
        tags:      form.tags ? form.tags.split(',').map(t => t.trim()) : [],
      }),
    })
    setSaving(false)
    if (r.ok) {
      setMsg('Published')
      setForm({ section: 'highlights', title: '', body: '', image_url: '', featured: false, tags: '' })
      setShowForm(false); load()
    } else {
      const d = await r.json(); setMsg(d.error ?? 'Error')
    }
  }

  async function toggleFeature(id: string, featured: boolean) {
    await fetch('/api/magazine/content', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, featured: !featured }),
    })
    load()
  }

  async function revokeConsent(id: string) {
    if (!confirm('Remove this item (consent revoked)?')) return
    await fetch('/api/magazine/content', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, parental_consent: false }),
    })
    load()
  }

  const filtered = filterSec ? items.filter(i => i.section === filterSec) : items

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">E-Magazine</h1>
        <div className="flex gap-2">
          <a href="/magazine/" target="_blank" rel="noreferrer"
            className="text-xs border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50">
            View Public ↗
          </a>
          <button onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">
            + Add Content
          </button>
        </div>
      </div>

      {/* Add content form */}
      {showForm && (
        <form onSubmit={submit} className="bg-white rounded-xl p-4 shadow-sm border space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Section</label>
              <select value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {SECTIONS.map(s => <option key={s} value={s}>{SECTION_ICONS[s]} {s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Content title..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <textarea rows={3} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            placeholder="Body text (optional)..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          <div className="flex gap-2">
            <input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
              placeholder="Image URL (optional)"
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="Tags (comma-separated)"
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} />
            Feature on homepage
          </label>
          {msg && <p className={`text-xs ${msg === 'Published' ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={saving || !form.title}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </form>
      )}

      {/* Section filter */}
      <div className="flex flex-wrap gap-1">
        <button onClick={() => setFilterSec('')}
          className={`text-xs px-2 py-1 rounded-full border ${!filterSec ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-600'}`}>
          All ({items.length})
        </button>
        {SECTIONS.map(s => {
          const count = items.filter(i => i.section === s).length
          return (
            <button key={s} onClick={() => setFilterSec(s)}
              className={`text-xs px-2 py-1 rounded-full border ${filterSec === s ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
              {SECTION_ICONS[s]} {s} ({count})
            </button>
          )
        })}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map(item => (
          <div key={item.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden ${item.featured ? 'border-yellow-300' : ''}`}>
            {item.image_url && (
              <img src={item.image_url} alt={item.title}
                className="w-full h-36 object-cover" loading="lazy" />
            )}
            <div className="p-3">
              <div className="flex items-start justify-between gap-1">
                <div>
                  {item.featured && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded mr-1">Featured</span>}
                  <span className="text-xs text-gray-500">{SECTION_ICONS[item.section]} {item.section}</span>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{item.title}</p>
                  {item.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.body}</p>}
                </div>
                {!item.approved && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded shrink-0">Pending</span>}
              </div>
              <div className="flex gap-1 mt-2">
                <button onClick={() => toggleFeature(item.id, item.featured)}
                  className={`text-xs px-2 py-1 rounded ${item.featured ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'} hover:opacity-80`}>
                  {item.featured ? 'Unfeature' : 'Feature'}
                </button>
                <button onClick={() => revokeConsent(item.id)}
                  className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100">
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-gray-500 text-center py-8 col-span-2">No content yet</p>}
      </div>
    </div>
  )
}
