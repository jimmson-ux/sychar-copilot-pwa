'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id:                  string
  title:               string
  event_date:          string
  event_time:          string | null
  category:            string
  description:         string | null
  audience:            string
  whatsapp_blast_sent: boolean
  created_at:          string
}

type Category = 'academic' | 'sports' | 'cultural' | 'holiday' | 'exam' | 'general'
type Audience  = 'all' | 'parents' | 'staff' | 'students'

const CATEGORIES: Category[] = ['academic', 'sports', 'cultural', 'holiday', 'exam', 'general']
const AUDIENCES:  Audience[]  = ['all', 'parents', 'staff', 'students']

const CAT_ICONS: Record<string, string> = {
  academic: '📚', sports: '⚽', cultural: '🎭',
  holiday: '🏖️', exam: '✏️', general: '📅',
}
const CAT_COLORS: Record<string, string> = {
  academic: '#dbeafe', sports: '#dcfce7', cultural: '#fce7f3',
  holiday:  '#fef9c3', exam:   '#fee2e2', general: '#f3f4f6',
}
const CAT_TEXT: Record<string, string> = {
  academic: '#1e40af', sports: '#166534', cultural: '#9d174d',
  holiday:  '#a16207', exam:   '#b91c1c', general: '#374151',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-KE', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })
}

function isUpcoming(dateStr: string) {
  return new Date(dateStr + 'T00:00:00') >= new Date(new Date().toDateString())
}

// ── Blank form ────────────────────────────────────────────────────────────────

const BLANK = {
  title: '', event_date: '', event_time: '', category: 'general' as Category,
  description: '', audience: 'all' as Audience, blast: false,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const router = useRouter()

  const [events, setEvents]         = useState<CalendarEvent[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editId, setEditId]         = useState<string | null>(null)
  const [form, setForm]             = useState({ ...BLANK })
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [filterCat, setFilterCat]   = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Load 3 months back + 6 months ahead
      const from = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
      const to   = new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0]
      const params = new URLSearchParams({ from, to })
      if (filterCat) params.set('category', filterCat)
      const res = await fetch(`/api/calendar?${params}`)
      if (res.status === 401) { router.push('/login'); return }
      if (res.status === 403) { router.push('/dashboard'); return }
      const json = await res.json()
      setEvents(json.events ?? [])
    } finally {
      setLoading(false)
    }
  }, [filterCat, router])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setEditId(null)
    setForm({ ...BLANK, event_date: new Date().toISOString().split('T')[0] })
    setSaveError('')
    setShowForm(true)
  }

  const openEdit = (ev: CalendarEvent) => {
    setEditId(ev.id)
    setForm({
      title:       ev.title,
      event_date:  ev.event_date,
      event_time:  ev.event_time ?? '',
      category:    (ev.category as Category),
      description: ev.description ?? '',
      audience:    (ev.audience as Audience),
      blast:       false,
    })
    setSaveError('')
    setShowForm(true)
  }

  const save = async () => {
    if (!form.title.trim() || !form.event_date) {
      setSaveError('Title and date are required.')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const body = {
        title:       form.title.trim(),
        event_date:  form.event_date,
        event_time:  form.event_time || undefined,
        category:    form.category,
        description: form.description.trim() || undefined,
        audience:    form.audience,
        blast:       form.blast && !editId,  // blast only on new events
      }
      const res = editId
        ? await fetch(`/api/calendar/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/calendar',             { method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const j = await res.json()
        setSaveError(j.error ?? 'Failed to save')
        return
      }
      setShowForm(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  const deleteEvent = async (id: string) => {
    const res = await fetch(`/api/calendar/${id}`, { method: 'DELETE' })
    if (res.ok) { setDeleteConfirm(null); load() }
  }

  // Group events by month
  const grouped: Record<string, CalendarEvent[]> = {}
  events.forEach(ev => {
    const key = new Date(ev.event_date + 'T00:00:00').toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(ev)
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard/principal')} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Dashboard
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">School Calendar</h1>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Event
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white border-b px-6 py-3 flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-500 mr-1">Filter:</span>
        {['', ...CATEGORIES].map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filterCat === cat
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat ? `${CAT_ICONS[cat]} ${cat.charAt(0).toUpperCase() + cat.slice(1)}` : 'All'}
          </button>
        ))}
      </div>

      {/* Event list */}
      <div className="max-w-3xl mx-auto p-6 space-y-8">
        {loading && (
          <div className="text-center text-gray-400 py-16">Loading calendar...</div>
        )}

        {!loading && events.length === 0 && (
          <div className="bg-white rounded-xl border p-12 text-center">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-gray-500 font-medium">No events found</p>
            <p className="text-gray-400 text-sm mt-1">Click &quot;Add Event&quot; to create the first calendar entry.</p>
          </div>
        )}

        {!loading && Object.entries(grouped).map(([month, monthEvents]) => (
          <div key={month}>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">{month}</h2>
            <div className="space-y-2">
              {monthEvents.map(ev => {
                const upcoming = isUpcoming(ev.event_date)
                return (
                  <div
                    key={ev.id}
                    className={`bg-white rounded-xl border flex gap-4 p-4 transition-shadow hover:shadow-md ${!upcoming ? 'opacity-60' : ''}`}
                  >
                    {/* Date column */}
                    <div className="flex-shrink-0 w-14 text-center">
                      <div className="text-xs text-gray-400 uppercase">
                        {new Date(ev.event_date + 'T00:00:00').toLocaleDateString('en-KE', { month: 'short' })}
                      </div>
                      <div className="text-2xl font-black text-gray-800 leading-tight">
                        {new Date(ev.event_date + 'T00:00:00').getDate()}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(ev.event_date + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short' })}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{ev.title}</span>
                        <span style={{
                          background: CAT_COLORS[ev.category] ?? '#f3f4f6',
                          color:      CAT_TEXT[ev.category]   ?? '#374151',
                          fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                        }}>
                          {CAT_ICONS[ev.category]} {ev.category}
                        </span>
                        {ev.whatsapp_blast_sent && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                            WhatsApp sent
                          </span>
                        )}
                      </div>
                      {ev.event_time && (
                        <p className="text-sm text-gray-500 mt-0.5">🕐 {ev.event_time.slice(0, 5)}</p>
                      )}
                      {ev.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{ev.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">Audience: {ev.audience}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEdit(ev)}
                        className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(ev.id)}
                        className="px-3 py-1.5 text-xs bg-gray-100 text-red-500 rounded-lg hover:bg-red-50 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Add / Edit Modal ────────────────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-blue-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">{editId ? 'Edit Event' : 'Add Calendar Event'}</h2>
              <button onClick={() => setShowForm(false)} className="text-blue-200 hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">Event Title *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Science Fair, KCSE Mock Exams"
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5">Date *</label>
                  <input
                    type="date"
                    value={form.event_date}
                    onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5">Time (optional)</label>
                  <input
                    type="time"
                    value={form.event_time}
                    onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Category + Audience */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5">Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{CAT_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-1.5">Audience</label>
                  <select
                    value={form.audience}
                    onChange={e => setForm(f => ({ ...f, audience: e.target.value as Audience }))}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {AUDIENCES.map(a => (
                      <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">Description (optional)</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Additional details..."
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* WhatsApp blast option (new events only, audience = all/parents) */}
              {!editId && ['all', 'parents'].includes(form.audience) && (
                <label className="flex items-center gap-3 cursor-pointer bg-green-50 rounded-lg p-3 border border-green-100">
                  <input
                    type="checkbox"
                    checked={form.blast}
                    onChange={e => setForm(f => ({ ...f, blast: e.target.checked }))}
                    className="w-4 h-4 accent-green-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-green-800">Send WhatsApp blast to parents</p>
                    <p className="text-xs text-green-600 mt-0.5">Notifies all registered parents via WhatsApp immediately</p>
                  </div>
                </label>
              )}

              {saveError && (
                <p className="text-red-600 text-sm">{saveError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : editId ? 'Save Changes' : 'Add Event'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ──────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center">
            <p className="text-4xl mb-3">🗑️</p>
            <h3 className="font-bold text-gray-900 text-lg">Delete Event?</h3>
            <p className="text-gray-500 text-sm mt-1 mb-6">
              {events.find(e => e.id === deleteConfirm)?.title}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteEvent(deleteConfirm)}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
