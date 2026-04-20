'use client'

import { useState, useEffect, useCallback } from 'react'

type SuspensionCase = {
  id: string; status: string; incident_date: string; allegations: string;
  submitted_at: string | null; created_at: string;
  students: { full_name: string; class_name: string; admission_number: string | null } | null;
  staff_records: { full_name: string } | null;
}

type CaseDetail = {
  id: string; status: string; incident_date: string; allegations: string;
  student_response: string | null; student_informed_date: string | null;
  draft_letter: string | null;
  students: { full_name: string; class_name: string; admission_number: string | null; parent_phone: string | null } | null;
  scraped_evidence: {
    tod_reports: { duty_date: string; report: string; staff_records: { full_name: string } | null }[];
    corrective_history: { date: string; incident_type: string; severity: string; action_taken: string }[];
    attendance_summary: { total_days: number; present_days: number; attendance_pct: number | null };
  };
}

export default function DeputySuspensionPage() {
  const [view, setView]         = useState<'list' | 'create' | 'detail'>('list')
  const [cases, setCases]       = useState<SuspensionCase[]>([])
  const [detail, setDetail]     = useState<CaseDetail | null>(null)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState('')
  const [students, setStudents] = useState<{ id: string; full_name: string; class_name: string }[]>([])
  const [search, setSearch]     = useState('')

  const [newForm, setNewForm] = useState({ student_id: '', incident_date: new Date().toISOString().split('T')[0], allegations: '' })
  const [editForm, setEditForm] = useState({ student_informed_date: '', student_response: '', draft_letter: '' })

  const loadCases = useCallback(async () => {
    const r = await fetch('/api/suspension/cases')
    if (r.ok) { const d = await r.json(); setCases(d.cases ?? []) }
  }, [])

  useEffect(() => { loadCases() }, [loadCases])

  useEffect(() => {
    if (search.length < 2) { setStudents([]); return }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/students/search?q=${encodeURIComponent(search)}&limit=6`)
      if (r.ok) { const d = await r.json(); setStudents(d.students ?? []) }
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  async function openDetail(caseId: string) {
    const r = await fetch(`/api/suspension/cases/${caseId}`)
    if (r.ok) {
      const d = await r.json()
      const c = d.case
      setDetail({ ...c, scraped_evidence: d.scraped_evidence })
      setEditForm({
        student_informed_date: c.student_informed_date ?? '',
        student_response:      c.student_response ?? '',
        draft_letter:          c.draft_letter ?? '',
      })
      setView('detail')
    }
  }

  async function createCase(e: React.FormEvent) {
    e.preventDefault()
    if (!newForm.student_id) { setMsg('Select a student'); return }
    setSaving(true); setMsg('')
    const r = await fetch('/api/suspension/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newForm),
    })
    setSaving(false)
    if (r.ok) {
      const d = await r.json()
      setMsg('Case created'); setNewForm({ student_id: '', incident_date: new Date().toISOString().split('T')[0], allegations: '' })
      setSearch(''); setStudents([])
      await loadCases()
      openDetail(d.case_id)
    } else {
      const d = await r.json(); setMsg(d.error ?? 'Error')
    }
  }

  async function saveProgress() {
    if (!detail) return
    setSaving(true); setMsg('')
    const r = await fetch(`/api/suspension/cases/${detail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_informed_date: editForm.student_informed_date || undefined,
        student_response:      editForm.student_response || undefined,
        draft_letter:          editForm.draft_letter || undefined,
      }),
    })
    setSaving(false)
    setMsg(r.ok ? 'Saved' : 'Error saving')
  }

  async function submitToPrincipal() {
    if (!detail) return
    setSaving(true); setMsg('')
    const r = await fetch(`/api/suspension/cases/${detail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_informed_date: editForm.student_informed_date,
        student_response:      editForm.student_response,
        draft_letter:          editForm.draft_letter,
        submit:                true,
      }),
    })
    setSaving(false)
    if (r.ok) {
      setMsg('Submitted to principal')
      loadCases()
      setView('list')
    } else {
      const d = await r.json(); setMsg(d.error ?? 'Error')
    }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft:     'bg-gray-100 text-gray-600',
      submitted: 'bg-blue-100 text-blue-700',
      approved:  'bg-green-100 text-green-700',
      declined:  'bg-red-100 text-red-600',
    }
    return map[s] ?? 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Suspension Cases</h1>
        {view === 'list' && (
          <button onClick={() => setView('create')} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700">
            + New Case
          </button>
        )}
        {view !== 'list' && (
          <button onClick={() => { setView('list'); setMsg(''); setDetail(null) }} className="text-sm text-blue-600 hover:underline">
            ← Back
          </button>
        )}
      </div>

      {/* ── LIST ─────────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="space-y-3">
          {cases.length === 0 && <p className="text-sm text-gray-500 text-center py-8">No cases yet</p>}
          {cases.map(c => (
            <button key={c.id} onClick={() => openDetail(c.id)}
              className="w-full bg-white rounded-xl p-4 shadow-sm border text-left hover:border-blue-300 transition-colors">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-900">{c.students?.full_name ?? 'Unknown'}</p>
                  <p className="text-xs text-gray-500">{c.students?.class_name} · Incident: {new Date(c.incident_date).toLocaleDateString('en-KE')}</p>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-1">{c.allegations}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge(c.status)}`}>{c.status}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── CREATE ────────────────────────────────────────────────────────── */}
      {view === 'create' && (
        <form onSubmit={createCase} className="bg-white rounded-xl p-4 shadow-sm border space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Student</label>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search student..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {students.length > 0 && (
              <div className="border rounded-lg mt-1 divide-y bg-white shadow">
                {students.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => { setNewForm(f => ({ ...f, student_id: s.id })); setSearch(`${s.full_name} (${s.class_name})`); setStudents([]) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
                    {s.full_name} <span className="text-gray-500">{s.class_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Incident Date</label>
            <input type="date" value={newForm.incident_date} onChange={e => setNewForm(f => ({ ...f, incident_date: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Allegations</label>
            <textarea rows={4} value={newForm.allegations} onChange={e => setNewForm(f => ({ ...f, allegations: e.target.value }))}
              placeholder="Describe the incident and allegations in detail..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {msg && <p className="text-sm text-red-500">{msg}</p>}

          <button type="submit" disabled={saving || !newForm.student_id || !newForm.allegations.trim()}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-blue-700">
            {saving ? 'Creating…' : 'Create Case & Load Evidence'}
          </button>
        </form>
      )}

      {/* ── DETAIL / EVIDENCE PANEL ──────────────────────────────────────── */}
      {view === 'detail' && detail && (
        <div className="space-y-4">
          {/* Student info */}
          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <div className="flex justify-between">
              <div>
                <p className="font-bold text-gray-900 text-lg">{detail.students?.full_name}</p>
                <p className="text-sm text-gray-500">{detail.students?.class_name} · {detail.students?.admission_number ?? 'No adm. no.'}</p>
              </div>
              <span className={`text-sm font-semibold px-3 py-1 rounded-full h-fit ${statusBadge(detail.status)}`}>{detail.status}</span>
            </div>
            <p className="text-sm text-gray-700 mt-2">{detail.allegations}</p>
          </div>

          {/* Auto-scraped evidence */}
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 space-y-3">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Auto-Scraped Evidence</p>

            {/* Attendance */}
            <div className="text-sm">
              <span className="font-medium text-gray-700">Attendance (30 days): </span>
              {detail.scraped_evidence.attendance_summary.attendance_pct !== null
                ? <span className={`font-semibold ${(detail.scraped_evidence.attendance_summary.attendance_pct ?? 100) < 75 ? 'text-red-600' : 'text-green-600'}`}>
                    {detail.scraped_evidence.attendance_summary.attendance_pct}%
                    ({detail.scraped_evidence.attendance_summary.present_days}/{detail.scraped_evidence.attendance_summary.total_days} days)
                  </span>
                : <span className="text-gray-500">No data</span>
              }
            </div>

            {/* Discipline history */}
            {detail.scraped_evidence.corrective_history.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Corrective History ({detail.scraped_evidence.corrective_history.length} records)</p>
                <div className="space-y-1">
                  {detail.scraped_evidence.corrective_history.slice(0, 5).map((h, i) => (
                    <div key={i} className="text-xs bg-white rounded p-2 border">
                      <span className="font-medium">{new Date(h.date).toLocaleDateString('en-KE')}</span>
                      {' · '}{h.incident_type} · <span className="text-red-600">{h.severity}</span>
                      {' · '}{h.action_taken}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TOD reports */}
            {detail.scraped_evidence.tod_reports.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">TOD Reports (±7 days)</p>
                {detail.scraped_evidence.tod_reports.slice(0, 3).map((t, i) => (
                  <div key={i} className="text-xs bg-white rounded p-2 border mb-1">
                    <span className="font-medium">{new Date(t.duty_date).toLocaleDateString('en-KE')}</span>
                    {t.staff_records && <span className="text-gray-500"> · {t.staff_records.full_name}</span>}
                    <p className="mt-0.5 text-gray-700 line-clamp-2">{t.report}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mandatory checklist */}
          <div className="bg-white rounded-xl p-4 shadow-sm border space-y-3">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Mandatory Checklist</p>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date Student Was Informed *</label>
              <input type="date" value={editForm.student_informed_date}
                onChange={e => setEditForm(f => ({ ...f, student_informed_date: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Student Response *</label>
              <textarea rows={3} value={editForm.student_response}
                onChange={e => setEditForm(f => ({ ...f, student_response: e.target.value }))}
                placeholder="Record the student's response to the allegations..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Draft Letter</label>
              <textarea rows={8} value={editForm.draft_letter}
                onChange={e => setEditForm(f => ({ ...f, draft_letter: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>

          {msg && <p className={`text-sm ${msg === 'Saved' || msg === 'Submitted to principal' ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}

          {detail.status === 'draft' && (
            <div className="flex gap-3">
              <button onClick={saveProgress} disabled={saving}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-gray-200">
                Save Progress
              </button>
              <button onClick={submitToPrincipal} disabled={saving || !editForm.student_informed_date || !editForm.student_response?.trim()}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-blue-700">
                {saving ? 'Submitting…' : 'Submit to Principal'}
              </button>
            </div>
          )}

          {detail.status === 'submitted' && (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-sm text-blue-700 text-center">
              Case submitted — awaiting principal review
            </div>
          )}

          {detail.status === 'approved' && (
            <div className="bg-green-50 rounded-xl p-4 border border-green-200 text-sm text-green-700 text-center">
              Case approved and suspension issued
            </div>
          )}

          {detail.status === 'declined' && (
            <div className="bg-red-50 rounded-xl p-4 border border-red-200 text-sm text-red-700 text-center">
              Case declined by principal
            </div>
          )}
        </div>
      )}
    </div>
  )
}
