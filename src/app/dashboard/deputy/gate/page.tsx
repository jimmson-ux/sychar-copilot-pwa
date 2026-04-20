'use client'

import { useState, useEffect, useCallback } from 'react'

type GatePass = {
  id: string; reason: string; exit_pin: string; pin_expires_at: string;
  expected_return: string; status: string; exited_at: string | null; created_at: string;
  students: { full_name: string; class_name: string; admission_number: string | null } | null;
  staff_records: { full_name: string } | null;
}

const REASONS = ['Medical', 'Fees', 'Family Emergency', 'Authorized Home Leave', 'School Errand']
const STATUS_COLORS: Record<string, string> = {
  pending:  'bg-blue-100 text-blue-700',
  exited:   'bg-orange-100 text-orange-700',
  returned: 'bg-green-100 text-green-700',
  expired:  'bg-gray-100 text-gray-500',
}

export default function GatePage() {
  const [tab, setTab]       = useState<'active' | 'create' | 'history'>('active')
  const [passes, setPasses] = useState<GatePass[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState('')
  const [students, setStudents] = useState<{ id: string; full_name: string; class_name: string }[]>([])
  const [search, setSearch] = useState('')
  const [form, setForm]     = useState({ student_id: '', reason: 'Medical', expected_return: '' })

  const load = useCallback(async (status = 'pending') => {
    const r = await fetch(`/api/gate/passes?status=${status}`)
    if (r.ok) { const d = await r.json(); setPasses(d.passes ?? []) }
  }, [])

  useEffect(() => {
    if (tab === 'active')  load('pending')
    if (tab === 'history') load('exited')
  }, [tab, load])

  useEffect(() => {
    if (search.length < 2) { setStudents([]); return }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/students/search?q=${encodeURIComponent(search)}&limit=6`)
      if (r.ok) { const d = await r.json(); setStudents(d.students ?? []) }
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  async function createPass(e: React.FormEvent) {
    e.preventDefault()
    if (!form.student_id || !form.expected_return) { setMsg('All fields required'); return }
    setSaving(true); setMsg('')
    const r = await fetch('/api/gate/passes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (r.ok) {
      const d = await r.json()
      setMsg(`Pass created! PIN: ${d.exit_pin} (valid 2 hrs) — Guard + parent notified`)
      setForm({ student_id: '', reason: 'Medical', expected_return: '' })
      setSearch(''); setStudents([])
      load()
    } else {
      const d = await r.json(); setMsg(d.error ?? 'Error')
    }
  }

  const pinExpired = (p: GatePass) => new Date(p.pin_expires_at) < new Date()

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Gate Pass System</h1>

      <div className="flex gap-2 border-b">
        {(['active', 'create', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {t === 'active' ? `Active (${passes.filter(p => p.status === 'pending').length})` : t === 'create' ? 'Issue Pass' : 'History'}
          </button>
        ))}
      </div>

      {/* ── ACTIVE PASSES ────────────────────────────────────────────────── */}
      {tab === 'active' && (
        <div className="space-y-3">
          {passes.length === 0 && <p className="text-sm text-gray-500 text-center py-8">No active gate passes</p>}
          {passes.map(p => (
            <div key={p.id} className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-900">{p.students?.full_name ?? 'Unknown'}</p>
                  <p className="text-xs text-gray-500">{p.students?.class_name} · {p.reason}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Expected return: {new Date(p.expected_return).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full block mb-1 ${STATUS_COLORS[p.status] ?? ''}`}>{p.status}</span>
                  {!pinExpired(p) && p.status === 'pending' && (
                    <div className="text-center bg-gray-900 text-white rounded-lg px-3 py-1">
                      <p className="text-xs text-gray-400">PIN</p>
                      <p className="text-xl font-bold font-mono tracking-widest">{p.exit_pin}</p>
                    </div>
                  )}
                  {pinExpired(p) && <span className="text-xs text-gray-400">PIN expired</span>}
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">Issued by {p.staff_records?.full_name ?? 'Admin'} · {new Date(p.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── CREATE PASS ───────────────────────────────────────────────────── */}
      {tab === 'create' && (
        <form onSubmit={createPass} className="bg-white rounded-xl p-4 shadow-sm border space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Student *</label>
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
            <div className="flex flex-wrap gap-1">
              {REASONS.map(r => (
                <button key={r} type="button" onClick={() => setForm(f => ({ ...f, reason: r }))}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium ${form.reason === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Expected Return *</label>
            <input type="datetime-local" value={form.expected_return}
              onChange={e => setForm(f => ({ ...f, expected_return: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
            On issuing: Parent WhatsApp + guard notification sent simultaneously. 4-digit PIN valid 2 hours.
          </div>

          {msg && (
            <div className={`text-sm rounded p-2 ${msg.startsWith('Pass created') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {msg}
            </div>
          )}

          <button type="submit" disabled={saving || !form.student_id || !form.expected_return}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-blue-700">
            {saving ? 'Issuing…' : 'Issue Gate Pass'}
          </button>
        </form>
      )}

      {/* ── HISTORY ──────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="space-y-2">
          {passes.map(p => (
            <div key={p.id} className="bg-white rounded-xl px-4 py-3 shadow-sm border flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-900">{p.students?.full_name}</p>
                <p className="text-xs text-gray-500">{p.reason} · {p.students?.class_name}</p>
                {p.exited_at && <p className="text-xs text-gray-400">Exited: {new Date(p.exited_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</p>}
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status] ?? ''}`}>{p.status}</span>
            </div>
          ))}
          {passes.length === 0 && <p className="text-sm text-gray-500 text-center py-8">No history</p>}
        </div>
      )}
    </div>
  )
}
