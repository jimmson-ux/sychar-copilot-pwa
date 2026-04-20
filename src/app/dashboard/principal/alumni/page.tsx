'use client'

import { useState, useEffect, useCallback } from 'react'

type AlumniRecord = {
  id: string; full_name: string; graduation_year: number; kcse_grade: string | null;
  class_name: string; current_occupation: string | null; university: string | null;
  mentorship_available: boolean; subject_specialization: string | null; verified: boolean;
}

type Project = {
  id: string; title: string; description: string | null; target_amount: number;
  raised_amount: number; progress_pct: number; status: string; deadline: string | null;
}

type Stats = {
  total: number; verified: number; with_mentor: number;
  career_outcomes: { occupation: string; count: number }[];
  university_placements: { university: string; count: number }[];
  grade_breakdown: { grade: string; count: number }[];
}

export default function AlumniPage() {
  const [tab, setTab]       = useState<'alumni' | 'projects' | 'graduate'>('alumni')
  const [alumni, setAlumni] = useState<AlumniRecord[]>([])
  const [stats, setStats]   = useState<Stats | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')
  const [students, setStudents] = useState<{ id: string; full_name: string; class_name: string }[]>([])
  const [search, setSearch] = useState('')

  const [gradForm, setGradForm] = useState({ student_id: '', graduation_year: new Date().getFullYear(), kcse_grade: '', career_pathway: '' })
  const [projForm, setProjForm] = useState({ title: '', description: '', target_amount: '', deadline: '' })

  const load = useCallback(async () => {
    const [aRes, pRes] = await Promise.all([
      fetch('/api/alumni'),
      fetch('/api/alumni/projects'),
    ])
    if (aRes.ok) { const d = await aRes.json(); setAlumni(d.alumni ?? []); setStats(d.stats) }
    if (pRes.ok) { const d = await pRes.json(); setProjects(d.projects ?? []) }
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

  async function graduateStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!gradForm.student_id) { setMsg('Select a student'); return }
    setSaving(true); setMsg('')
    const r = await fetch('/api/alumni/graduate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gradForm),
    })
    setSaving(false)
    if (r.ok) {
      setMsg('Student graduated! Alumni record created + WhatsApp sent.')
      setGradForm({ student_id: '', graduation_year: new Date().getFullYear(), kcse_grade: '', career_pathway: '' })
      setSearch(''); setStudents([])
      load(); setTab('alumni')
    } else {
      const d = await r.json(); setMsg(d.error ?? 'Error')
    }
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg('')
    const r = await fetch('/api/alumni/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...projForm, target_amount: Number(projForm.target_amount) }),
    })
    setSaving(false)
    if (r.ok) {
      setMsg('Project created')
      setProjForm({ title: '', description: '', target_amount: '', deadline: '' })
      load()
    } else {
      const d = await r.json(); setMsg(d.error ?? 'Error')
    }
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Alumni Portal</h1>

      <div className="flex gap-2 border-b">
        {(['alumni', 'projects', 'graduate'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {t === 'alumni' ? `Alumni (${alumni.length})` : t === 'projects' ? 'Donation Projects' : 'Graduate Student'}
          </button>
        ))}
      </div>

      {/* ── ALUMNI LIST ───────────────────────────────────────────────────── */}
      {tab === 'alumni' && (
        <div className="space-y-4">
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-3 shadow-sm border text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-xs text-gray-500">Total Alumni</p>
              </div>
              <div className="bg-white rounded-xl p-3 shadow-sm border text-center">
                <p className="text-2xl font-bold text-blue-600">{stats.verified}</p>
                <p className="text-xs text-gray-500">Registered</p>
              </div>
              <div className="bg-white rounded-xl p-3 shadow-sm border text-center">
                <p className="text-2xl font-bold text-green-600">{stats.with_mentor}</p>
                <p className="text-xs text-gray-500">Mentors Available</p>
              </div>
              <div className="bg-white rounded-xl p-3 shadow-sm border text-center">
                <p className="text-2xl font-bold text-purple-600">{stats.university_placements.length}</p>
                <p className="text-xs text-gray-500">Universities</p>
              </div>
            </div>
          )}

          {/* Career outcomes */}
          {stats && stats.career_outcomes.length > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Career Outcomes</p>
              <div className="space-y-1.5">
                {stats.career_outcomes.slice(0, 6).map(o => (
                  <div key={o.occupation} className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 flex-1 truncate">{o.occupation}</span>
                    <div className="w-24 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${Math.round((o.count / stats.career_outcomes[0].count) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-medium text-gray-600 w-4">{o.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alumni table */}
          <div className="space-y-2">
            {alumni.map(a => (
              <div key={a.id} className="bg-white rounded-xl px-4 py-3 shadow-sm border">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900">{a.full_name}</p>
                    <p className="text-xs text-gray-500">{a.class_name} · Class of {a.graduation_year}{a.kcse_grade && ` · KCSE ${a.kcse_grade}`}</p>
                    {a.current_occupation && <p className="text-xs text-gray-600">{a.current_occupation}</p>}
                    {a.university && <p className="text-xs text-blue-600">{a.university}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {a.verified && <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Registered</span>}
                    {a.mentorship_available && <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">Mentor</span>}
                  </div>
                </div>
              </div>
            ))}
            {alumni.length === 0 && <p className="text-sm text-gray-500 text-center py-8">No alumni records yet</p>}
          </div>
        </div>
      )}

      {/* ── DONATION PROJECTS ─────────────────────────────────────────────── */}
      {tab === 'projects' && (
        <div className="space-y-4">
          {/* Create project form */}
          <form onSubmit={createProject} className="bg-white rounded-xl p-4 shadow-sm border space-y-3">
            <p className="text-sm font-semibold text-gray-700">New Donation Project</p>
            <input value={projForm.title} onChange={e => setProjForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Project title..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <textarea rows={2} value={projForm.description} onChange={e => setProjForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            <div className="flex gap-2">
              <input type="number" value={projForm.target_amount} onChange={e => setProjForm(f => ({ ...f, target_amount: e.target.value }))}
                placeholder="Target (KSh)"
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="date" value={projForm.deadline} onChange={e => setProjForm(f => ({ ...f, deadline: e.target.value }))}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {msg && <p className={`text-xs ${msg === 'Project created' ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}
            <button type="submit" disabled={saving || !projForm.title || !projForm.target_amount}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-blue-700">
              Create Project
            </button>
          </form>

          {/* Projects list */}
          {projects.map(p => (
            <div key={p.id} className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium text-gray-900">{p.title}</p>
                  {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                  {p.deadline && <p className="text-xs text-gray-400">Deadline: {new Date(p.deadline).toLocaleDateString('en-KE')}</p>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{p.status}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, p.progress_pct)}%` }} />
                </div>
                <span className="text-xs font-medium text-gray-700">KSh {p.raised_amount.toLocaleString()} / {p.target_amount.toLocaleString()}</span>
                <span className="text-xs text-gray-500">{p.progress_pct}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── GRADUATE STUDENT ─────────────────────────────────────────────── */}
      {tab === 'graduate' && (
        <form onSubmit={graduateStudent} className="bg-white rounded-xl p-4 shadow-sm border space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>This action is permanent.</strong> Student status will be set to &quot;graduated&quot; and an alumni record will be created. The student&apos;s UUID is preserved for data continuity.
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Student *</label>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search current student..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {students.length > 0 && (
              <div className="border rounded-lg mt-1 divide-y bg-white shadow">
                {students.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => { setGradForm(f => ({ ...f, student_id: s.id })); setSearch(`${s.full_name} (${s.class_name})`); setStudents([]) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
                    {s.full_name} <span className="text-gray-500">{s.class_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Graduation Year</label>
              <input type="number" value={gradForm.graduation_year}
                onChange={e => setGradForm(f => ({ ...f, graduation_year: Number(e.target.value) }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">KCSE Grade</label>
              <input value={gradForm.kcse_grade} onChange={e => setGradForm(f => ({ ...f, kcse_grade: e.target.value }))}
                placeholder="A, B+, C..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Career Pathway</label>
              <input value={gradForm.career_pathway} onChange={e => setGradForm(f => ({ ...f, career_pathway: e.target.value }))}
                placeholder="Engineering, Medicine..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {msg && <p className={`text-sm ${msg.startsWith('Student grad') ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}

          <button type="submit" disabled={saving || !gradForm.student_id}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-green-700">
            {saving ? 'Graduating…' : 'Graduate Student'}
          </button>
        </form>
      )}
    </div>
  )
}
