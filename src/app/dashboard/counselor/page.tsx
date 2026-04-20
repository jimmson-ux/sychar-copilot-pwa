'use client'

import { useState, useEffect, useCallback } from 'react'

type GcCase = {
  id: string; student_id: string; status: string; category: string;
  referral_source: string; risk_level: string; opened_at: string;
  last_session_date: string | null; session_count: number;
  presenting_issue: string | null; management_plan: string | null;
  students: { full_name: string; class_name: string; admission_number: string | null } | null;
}

type AnonReferral = {
  id: string; concern: string; category: string; contact_pref: string;
  first_name: string | null; class_name: string | null; submitted_at: string; status: string;
}

const RISK_COLORS: Record<string, string> = {
  low:    'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high:   'bg-orange-100 text-orange-700',
  crisis: 'bg-red-100 text-red-700',
}
const CATEGORIES = ['academic', 'behavioural', 'family', 'trauma', 'career', 'peer', 'other']
const REFERRAL_SOURCES = ['self', 'teacher', 'parent', 'deputy', 'anonymous']

export default function CounselorPage() {
  const [tab, setTab]         = useState<'cases' | 'new' | 'referrals'>('cases')
  const [cases, setCases]     = useState<GcCase[]>([])
  const [referrals, setReferrals] = useState<AnonReferral[]>([])
  const [selected, setSelected]   = useState<GcCase | null>(null)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState('')
  const [students, setStudents]   = useState<{ id: string; full_name: string; class_name: string }[]>([])
  const [search, setSearch]       = useState('')

  // Session note form
  const [sessionForm, setSessionForm] = useState({
    session_date: new Date().toISOString().split('T')[0],
    session_type: 'individual',
    duration_minutes: '60',
    session_notes: '',
    counselor_observations: '',
    trauma_indicators: '',
  })

  // New case form
  const [caseForm, setCaseForm] = useState({
    student_id: '', category: 'academic', referral_source: 'teacher',
    risk_level: 'low', presenting_issue: '', management_plan: '',
  })

  const loadData = useCallback(async () => {
    const [cRes, rRes] = await Promise.all([
      fetch('/api/gc/cases'),
      fetch('/api/gc/cases?include_referrals=1'),
    ])
    if (cRes.ok) { const d = await cRes.json(); setCases(d.cases ?? []) }
    // Anonymous referrals via alerts
    const aRes = await fetch('/api/alerts?type=gc_anonymous_referral&limit=20')
    if (aRes.ok) {
      const d = await aRes.json()
      setReferrals((d.alerts ?? []).map((a: { id: string; detail: { concern_preview?: string; category?: string; contact_pref?: string }; created_at: string }) => ({
        id: a.id,
        concern: a.detail?.concern_preview ?? '',
        category: a.detail?.category ?? 'other',
        contact_pref: a.detail?.contact_pref ?? 'none',
        first_name: null,
        class_name: null,
        submitted_at: a.created_at,
        status: 'new',
      })))
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (search.length < 2) { setStudents([]); return }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/students/search?q=${encodeURIComponent(search)}&limit=6`)
      if (r.ok) { const d = await r.json(); setStudents(d.students ?? []) }
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  async function createCase(e: React.FormEvent) {
    e.preventDefault()
    if (!caseForm.student_id) { setMsg('Select a student'); return }
    setSaving(true); setMsg('')
    const r = await fetch('/api/gc/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(caseForm),
    })
    setSaving(false)
    if (r.ok) {
      setMsg('Case opened')
      setCaseForm({ student_id: '', category: 'academic', referral_source: 'teacher', risk_level: 'low', presenting_issue: '', management_plan: '' })
      setSearch(''); setStudents([])
      loadData(); setTab('cases')
    } else {
      const d = await r.json(); setMsg(d.error ?? 'Error')
    }
  }

  async function addSession(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSaving(true); setMsg('')
    const r = await fetch('/api/gc/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_id:               selected.id,
        session_date:          sessionForm.session_date,
        session_type:          sessionForm.session_type,
        duration_minutes:      Number(sessionForm.duration_minutes),
        session_notes:         sessionForm.session_notes || undefined,
        counselor_observations: sessionForm.counselor_observations || undefined,
        trauma_indicators:     sessionForm.trauma_indicators
          ? sessionForm.trauma_indicators.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
      }),
    })
    setSaving(false)
    if (r.ok) {
      setMsg('Session saved (encrypted)')
      setSessionForm({ session_date: new Date().toISOString().split('T')[0], session_type: 'individual', duration_minutes: '60', session_notes: '', counselor_observations: '', trauma_indicators: '' })
      loadData()
    } else {
      const d = await r.json(); setMsg(d.error ?? 'Error')
    }
  }

  async function updateRisk(caseId: string, risk_level: string) {
    await fetch(`/api/gc/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ risk_level }),
    })
    loadData()
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-900">G&C Sanctuary</h1>

      <div className="flex gap-2 border-b">
        {(['cases', 'new', 'referrals'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {t === 'cases' ? `Active Cases (${cases.filter(c => c.status === 'active').length})` : t === 'new' ? 'Open Case' : `Referrals (${referrals.length})`}
          </button>
        ))}
      </div>

      {/* ── ACTIVE CASES ─────────────────────────────────────────────────── */}
      {tab === 'cases' && (
        <div className="space-y-3">
          {cases.length === 0 && <p className="text-sm text-gray-500 text-center py-8">No cases yet</p>}
          {cases.map(c => (
            <div key={c.id} className={`bg-white rounded-xl p-4 shadow-sm border cursor-pointer transition-all ${selected?.id === c.id ? 'ring-2 ring-blue-400' : 'hover:border-gray-300'}`}
              onClick={() => setSelected(selected?.id === c.id ? null : c)}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-900">{c.students?.full_name ?? 'Unknown'}</p>
                  <p className="text-xs text-gray-500">{c.students?.class_name} · {c.category} · {c.referral_source} referral</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.session_count} session{c.session_count !== 1 ? 's' : ''} · Opened {new Date(c.opened_at).toLocaleDateString('en-KE')}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RISK_COLORS[c.risk_level] ?? 'bg-gray-100 text-gray-600'}`}>{c.risk_level}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{c.status}</span>
                </div>
              </div>

              {/* Session panel — expand on select */}
              {selected?.id === c.id && (
                <div className="mt-4 pt-4 border-t space-y-4" onClick={e => e.stopPropagation()}>
                  {/* Risk level quick-change */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Risk Level</p>
                    <div className="flex gap-2">
                      {['low', 'medium', 'high', 'crisis'].map(r => (
                        <button key={r} onClick={() => updateRisk(c.id, r)}
                          className={`text-xs px-3 py-1 rounded-full border font-medium ${c.risk_level === r ? RISK_COLORS[r] + ' border-current' : 'bg-gray-50 text-gray-600'}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Add session note */}
                  <form onSubmit={addSession} className="space-y-3">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Add Session Note (Tier 1 — Encrypted)</p>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="date" value={sessionForm.session_date}
                        onChange={e => setSessionForm(f => ({ ...f, session_date: e.target.value }))}
                        className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <select value={sessionForm.session_type}
                        onChange={e => setSessionForm(f => ({ ...f, session_type: e.target.value }))}
                        className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {['individual', 'group', 'family', 'crisis'].map(t => <option key={t}>{t}</option>)}
                      </select>
                      <input type="number" min="15" max="180" value={sessionForm.duration_minutes}
                        onChange={e => setSessionForm(f => ({ ...f, duration_minutes: e.target.value }))}
                        placeholder="Min"
                        className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <textarea rows={3} value={sessionForm.session_notes}
                      onChange={e => setSessionForm(f => ({ ...f, session_notes: e.target.value }))}
                      placeholder="Session notes (AES-256 encrypted)..."
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    <textarea rows={2} value={sessionForm.counselor_observations}
                      onChange={e => setSessionForm(f => ({ ...f, counselor_observations: e.target.value }))}
                      placeholder="Counselor observations (encrypted)..."
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    <input value={sessionForm.trauma_indicators}
                      onChange={e => setSessionForm(f => ({ ...f, trauma_indicators: e.target.value }))}
                      placeholder="Trauma indicators (comma-separated, encrypted)..."
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    {msg && <p className={`text-xs ${msg.includes('saved') ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}
                    <button type="submit" disabled={saving}
                      className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-blue-700">
                      {saving ? 'Encrypting & saving…' : 'Save Session Note'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── OPEN NEW CASE ────────────────────────────────────────────────── */}
      {tab === 'new' && (
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
                    onClick={() => { setCaseForm(f => ({ ...f, student_id: s.id })); setSearch(`${s.full_name} (${s.class_name})`); setStudents([]) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
                    {s.full_name} <span className="text-gray-500">{s.class_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select value={caseForm.category} onChange={e => setCaseForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Referral Source</label>
              <select value={caseForm.referral_source} onChange={e => setCaseForm(f => ({ ...f, referral_source: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {REFERRAL_SOURCES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Risk Level</label>
            <div className="flex gap-2">
              {['low', 'medium', 'high', 'crisis'].map(r => (
                <button key={r} type="button" onClick={() => setCaseForm(f => ({ ...f, risk_level: r }))}
                  className={`flex-1 text-sm py-2 rounded-lg border font-medium ${caseForm.risk_level === r ? RISK_COLORS[r] + ' border-current' : 'bg-gray-50 text-gray-600'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Presenting Issue (Tier 2 — summary only)</label>
            <textarea rows={3} value={caseForm.presenting_issue}
              onChange={e => setCaseForm(f => ({ ...f, presenting_issue: e.target.value }))}
              placeholder="Brief presenting issue — no clinical detail here..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Management Plan (Tier 2)</label>
            <textarea rows={2} value={caseForm.management_plan}
              onChange={e => setCaseForm(f => ({ ...f, management_plan: e.target.value }))}
              placeholder="Initial management approach..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {msg && <p className={`text-sm ${msg === 'Case opened' ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}

          <button type="submit" disabled={saving || !caseForm.student_id}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-blue-700">
            {saving ? 'Opening…' : 'Open Case'}
          </button>
        </form>
      )}

      {/* ── ANONYMOUS REFERRALS ──────────────────────────────────────────── */}
      {tab === 'referrals' && (
        <div className="space-y-3">
          {referrals.length === 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border text-center">
              <p className="text-sm text-gray-500">No anonymous referrals</p>
              <p className="text-xs text-gray-400 mt-1">Students can reach out at <code className="bg-gray-100 px-1 rounded">/talk</code></p>
            </div>
          )}
          {referrals.map(r => (
            <div key={r.id} className="bg-white rounded-xl p-4 shadow-sm border border-l-4 border-l-yellow-400">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-gray-500">
                    {new Date(r.submitted_at).toLocaleString('en-KE')}
                    {r.first_name && ` · ${r.first_name}`}
                    {r.class_name && ` · ${r.class_name}`}
                    {` · ${r.category}`}
                  </p>
                  <p className="text-sm text-gray-800 mt-1">{r.concern}</p>
                  <p className="text-xs text-gray-500 mt-1">Contact pref: <span className="font-medium">{r.contact_pref}</span></p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
