'use client'

import { useState, useEffect, useCallback } from 'react'

type TalentEntry = {
  rank: number; student_id: string; full_name: string; class_name: string;
  total_points: number; by_category: Record<string, number>;
}

type PointRecord = {
  id: string; student_id: string; category: string; sub_category: string | null;
  points: number; reason: string; awarded_at: string;
  students: { full_name: string; class_name: string } | null;
  staff_records: { full_name: string } | null;
}

const CATEGORIES = [
  'Academic Excellence', 'Leadership & Character', 'Sports & Physical',
  'Arts & Culture', 'Innovation & Technical', 'School Citizenship',
]
const CAT_COLORS: Record<string, string> = {
  'Academic Excellence':    'bg-blue-100 text-blue-700',
  'Leadership & Character': 'bg-purple-100 text-purple-700',
  'Sports & Physical':      'bg-green-100 text-green-700',
  'Arts & Culture':         'bg-pink-100 text-pink-700',
  'Innovation & Technical': 'bg-orange-100 text-orange-700',
  'School Citizenship':     'bg-teal-100 text-teal-700',
}

export default function TalentPage() {
  const [tab, setTab]             = useState<'board' | 'award' | 'nominations'>('board')
  const [leaderboard, setLeaderboard] = useState<TalentEntry[]>([])
  const [recentPoints, setRecent] = useState<PointRecord[]>([])
  const [selectedCat, setSelectedCat] = useState('')
  const [students, setStudents]   = useState<{ id: string; full_name: string; class_name: string }[]>([])
  const [search, setSearch]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState('')
  const [form, setForm]           = useState({ student_id: '', category: CATEGORIES[0], sub_category: '', points: '3', reason: '' })

  const load = useCallback(async () => {
    const [lb, rp] = await Promise.all([
      fetch('/api/talent/leaderboard?school_id=self'),
      fetch('/api/talent/points?limit=20'),
    ])
    if (lb.ok) { const d = await lb.json(); setLeaderboard(d.overall ?? []) }
    if (rp.ok) { const d = await rp.json(); setRecent(d.points ?? []) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (search.length < 2) { setStudents([]); return }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/students/search?q=${encodeURIComponent(search)}&limit=6`)
      if (r.ok) { const d = await r.json(); setStudents(d.students ?? []) }
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  async function awardPoints(e: React.FormEvent) {
    e.preventDefault()
    if (!form.student_id) { setMsg('Select a student'); return }
    setSaving(true); setMsg('')
    const r = await fetch('/api/talent/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, points: Number(form.points) }),
    })
    setSaving(false)
    if (r.ok) {
      setMsg('Points awarded!')
      setForm({ student_id: '', category: CATEGORIES[0], sub_category: '', points: '3', reason: '' })
      setSearch(''); setStudents([])
      load()
    } else {
      const d = await r.json(); setMsg(d.error ?? 'Error')
    }
  }

  const filtered = selectedCat
    ? leaderboard.filter(s => (s.by_category[selectedCat] ?? 0) > 0)
        .sort((a, b) => (b.by_category[selectedCat] ?? 0) - (a.by_category[selectedCat] ?? 0))
    : leaderboard

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Talent & Recognition</h1>
        <a href={`/talent/`} target="_blank" rel="noreferrer"
          className="text-xs text-blue-600 border border-blue-200 px-3 py-1 rounded-lg hover:bg-blue-50">
          Public Hall of Fame ↗
        </a>
      </div>

      <div className="flex gap-2 border-b">
        {(['board', 'award', 'nominations'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {t === 'board' ? 'Leaderboard' : t === 'award' ? 'Award Points' : 'Peer Nominations'}
          </button>
        ))}
      </div>

      {/* ── LEADERBOARD ──────────────────────────────────────────────────── */}
      {tab === 'board' && (
        <div className="space-y-3">
          {/* Category filter */}
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setSelectedCat('')}
              className={`text-xs px-2 py-1 rounded-full border ${!selectedCat ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
              All
            </button>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setSelectedCat(c)}
                className={`text-xs px-2 py-1 rounded-full border ${selectedCat === c ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                {c}
              </button>
            ))}
          </div>

          {/* Top 3 podium */}
          {filtered.length >= 3 && (
            <div className="flex justify-center items-end gap-4 py-4">
              {[filtered[1], filtered[0], filtered[2]].map((s, pos) => {
                const heights = ['h-20', 'h-28', 'h-16']
                const medals  = ['🥈', '🥇', '🥉']
                const pts = selectedCat ? s.by_category[selectedCat] : s.total_points
                return (
                  <div key={s.student_id} className="flex flex-col items-center gap-1">
                    <p className="text-lg">{medals[pos]}</p>
                    <p className="text-xs font-medium text-center max-w-16 leading-tight">{s.full_name.split(' ')[0]}</p>
                    <p className="text-xs text-gray-500">{s.class_name}</p>
                    <div className={`${heights[pos]} w-14 ${pos === 1 ? 'bg-yellow-400' : pos === 0 ? 'bg-gray-300' : 'bg-orange-300'} rounded-t flex items-end justify-center pb-1`}>
                      <span className="text-xs font-bold">{pts}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Full list */}
          <div className="space-y-2">
            {filtered.map(s => (
              <div key={s.student_id} className="bg-white rounded-xl px-4 py-3 shadow-sm border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-400 w-5">#{s.rank}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.full_name}</p>
                    <p className="text-xs text-gray-500">{s.class_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 flex-wrap justify-end">
                    {Object.entries(s.by_category).filter(([, v]) => v > 0).map(([cat, pts]) => (
                      <span key={cat} className={`text-xs px-1.5 py-0.5 rounded-full ${CAT_COLORS[cat] ?? 'bg-gray-100 text-gray-600'}`}>
                        {pts}
                      </span>
                    ))}
                  </div>
                  <span className="text-sm font-bold text-gray-900 ml-1">{s.total_points}pts</span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-sm text-gray-500 text-center py-8">No points recorded yet</p>}
          </div>
        </div>
      )}

      {/* ── AWARD POINTS ─────────────────────────────────────────────────── */}
      {tab === 'award' && (
        <div className="space-y-4">
          <form onSubmit={awardPoints} className="bg-white rounded-xl p-4 shadow-sm border space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Student</label>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search student..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {students.length > 0 && (
                <div className="border rounded-lg mt-1 divide-y bg-white shadow">
                  {students.map(s => (
                    <button key={s.id} type="button"
                      onClick={() => { setForm(f => ({ ...f, student_id: s.id })); setSearch(`${s.full_name} (${s.class_name})`); setStudents([]) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
                      {s.full_name} <span className="text-gray-500">{s.class_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <div className="flex flex-wrap gap-1">
                {CATEGORIES.map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, category: c }))}
                    className={`text-xs px-2 py-1 rounded-full border ${form.category === c ? CAT_COLORS[c] + ' border-current' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sub-category (optional)</label>
                <input value={form.sub_category} onChange={e => setForm(f => ({ ...f, sub_category: e.target.value }))}
                  placeholder="e.g. Debate, Football, STEM..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Points (1–10)</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 5, 10].map(p => (
                    <button key={p} type="button" onClick={() => setForm(f => ({ ...f, points: String(p) }))}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium ${form.points === String(p) ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-700'}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="What did this student do to deserve recognition?"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {msg && <p className={`text-sm ${msg === 'Points awarded!' ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}

            <button type="submit" disabled={saving || !form.student_id || !form.reason.trim()}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-blue-700">
              {saving ? 'Awarding…' : 'Award Points'}
            </button>
            <p className="text-xs text-gray-400 text-center">Max 3 nominations per category per week per teacher · Parent notified automatically</p>
          </form>

          {/* Recent awards */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent Awards</p>
            {recentPoints.map(p => (
              <div key={p.id} className="bg-white rounded-xl px-4 py-3 shadow-sm border flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900">{(p as unknown as { students: { full_name: string } | null }).students?.full_name ?? 'Unknown'}</p>
                  <p className="text-xs text-gray-500">{p.category} · {p.reason.slice(0, 60)}{p.reason.length > 60 ? '…' : ''}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CAT_COLORS[p.category] ?? 'bg-gray-100'}`}>+{p.points}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PEER NOMINATIONS ─────────────────────────────────────────────── */}
      {tab === 'nominations' && (
        <PeerNominationsList />
      )}
    </div>
  )
}

function PeerNominationsList() {
  const [noms, setNoms] = useState<{ id: string; category: string; reason: string; status: string; submitted_at: string }[]>([])
  const [saving, setSaving] = useState('')

  useEffect(() => {
    fetch('/api/talent/peer-nominations').then(r => r.json()).then(d => setNoms(d.nominations ?? []))
  }, [])

  async function action(id: string, act: 'approve' | 'reject') {
    setSaving(id)
    await fetch('/api/talent/peer-nominations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomination_id: id, action: act }),
    })
    setSaving('')
    setNoms(prev => prev.filter(n => n.id !== id))
  }

  return (
    <div className="space-y-3">
      {noms.filter(n => n.status === 'pending').length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">No pending peer nominations</p>
      )}
      {noms.filter(n => n.status === 'pending').map(n => (
        <div key={n.id} className="bg-white rounded-xl p-4 shadow-sm border border-l-4 border-l-purple-400">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{n.category}</span>
              <p className="text-sm text-gray-800 mt-1">{n.reason}</p>
              <p className="text-xs text-gray-400 mt-0.5">{new Date(n.submitted_at).toLocaleString('en-KE')}</p>
            </div>
            <div className="flex gap-1 ml-3">
              <button onClick={() => action(n.id, 'approve')} disabled={saving === n.id}
                className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">Approve</button>
              <button onClick={() => action(n.id, 'reject')} disabled={saving === n.id}
                className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200">Reject</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
