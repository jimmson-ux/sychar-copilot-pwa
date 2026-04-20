'use client'

import { useState, useEffect, useCallback } from 'react'

type StockItem = {
  id: string; item_name: string; current_count: number; unit: string;
  min_threshold: number; category: string; status: 'green' | 'amber' | 'red' | 'empty'; updated_at: string;
}

type Visit = {
  id: string; student_id: string; arrived_at: string; complaint: string;
  action_taken: string; outcome: string | null; discharged_at: string | null;
  students: { full_name: string; class_name: string; admission_number: string | null } | null;
}

const QUICK_COMPLAINTS = ['Headache', 'Stomach ache', 'Fever', 'Injury', 'Nausea', 'Dizziness', 'Chest pain', 'Anxiety']
const QUICK_ACTIONS    = ['Paracetamol given', 'Bandaged wound', 'Rested', 'Ice pack applied', 'ORS given', 'Referred to hospital']
const OUTCOMES         = ['discharged', 'sent_home', 'bed_rest', 'referred_hospital'] as const

export default function NursePage() {
  const [tab, setTab]           = useState<'log' | 'sickbay' | 'stock'>('log')
  const [students, setStudents] = useState<{ id: string; full_name: string; class_name: string; admission_number: string | null }[]>([])
  const [visits, setVisits]     = useState<Visit[]>([])
  const [stock, setStock]       = useState<StockItem[]>([])
  const [search, setSearch]     = useState('')
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState('')

  const [form, setForm] = useState({
    student_id: '', complaint: '', action_taken: '', outcome: 'discharged' as string,
    quantity_used: '', item_id: '',
  })

  const [stockForm, setStockForm] = useState({ item_id: '', delta: '', reason: '' })

  const loadData = useCallback(async () => {
    const [vRes, sRes] = await Promise.all([
      fetch('/api/nurse/visits?status=active'),
      fetch('/api/nurse/stock'),
    ])
    if (vRes.ok) { const d = await vRes.json(); setVisits(d.visits ?? []) }
    if (sRes.ok) { const d = await sRes.json(); setStock(d.items ?? []) }
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

  async function logVisit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.student_id) { setMsg('Select a student'); return }
    setSaving(true); setMsg('')
    const r = await fetch('/api/nurse/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id:    form.student_id,
        complaint:     form.complaint,
        action_taken:  form.action_taken,
        outcome:       form.outcome,
        quantity_used: form.quantity_used ? Number(form.quantity_used) : undefined,
        item_id:       form.item_id || undefined,
      }),
    })
    setSaving(false)
    if (r.ok) {
      setMsg('Visit logged')
      setForm({ student_id: '', complaint: '', action_taken: '', outcome: 'discharged', quantity_used: '', item_id: '' })
      setSearch(''); setStudents([])
      loadData()
    } else {
      const d = await r.json(); setMsg(d.error ?? 'Error')
    }
  }

  async function discharge(visitId: string) {
    await fetch(`/api/nurse/visits/${visitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: 'discharged' }),
    })
    loadData()
  }

  async function updateStock(e: React.FormEvent) {
    e.preventDefault()
    if (!stockForm.item_id || !stockForm.delta) return
    setSaving(true)
    await fetch(`/api/nurse/stock/${stockForm.item_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta: Number(stockForm.delta), reason: stockForm.reason || undefined }),
    })
    setSaving(false)
    setStockForm({ item_id: '', delta: '', reason: '' })
    loadData()
  }

  const statusColor = (s: string) =>
    s === 'green' ? 'bg-green-100 text-green-800' :
    s === 'amber' ? 'bg-yellow-100 text-yellow-800' :
    s === 'red'   ? 'bg-red-100 text-red-700' :
                    'bg-gray-200 text-gray-700'

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Sick Bay</h1>

      <div className="flex gap-2 border-b">
        {(['log', 'sickbay', 'stock'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {t === 'log' ? 'Log Visit' : t === 'sickbay' ? `Sick Bay (${visits.length})` : 'Stock'}
          </button>
        ))}
      </div>

      {/* ── LOG VISIT ─────────────────────────────────────────────────────── */}
      {tab === 'log' && (
        <form onSubmit={logVisit} className="space-y-4 bg-white rounded-xl p-4 shadow-sm border">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Student</label>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or admission number..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {students.length > 0 && (
              <div className="border rounded-lg mt-1 divide-y bg-white shadow z-10 relative">
                {students.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => { setForm(f => ({ ...f, student_id: s.id })); setSearch(`${s.full_name} (${s.class_name})`); setStudents([]) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
                    <span className="font-medium">{s.full_name}</span>
                    <span className="text-gray-500 ml-2">{s.class_name}</span>
                    {s.admission_number && <span className="text-gray-400 ml-1 text-xs">#{s.admission_number}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Complaint</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {QUICK_COMPLAINTS.map(q => (
                <button key={q} type="button"
                  onClick={() => setForm(f => ({ ...f, complaint: q }))}
                  className={`text-xs px-2 py-1 rounded-full border ${form.complaint === q ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                  {q}
                </button>
              ))}
            </div>
            <input value={form.complaint} onChange={e => setForm(f => ({ ...f, complaint: e.target.value }))}
              placeholder="Or type complaint..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Action Taken</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {QUICK_ACTIONS.map(q => (
                <button key={q} type="button"
                  onClick={() => setForm(f => ({ ...f, action_taken: q }))}
                  className={`text-xs px-2 py-1 rounded-full border ${form.action_taken === q ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                  {q}
                </button>
              ))}
            </div>
            <input value={form.action_taken} onChange={e => setForm(f => ({ ...f, action_taken: e.target.value }))}
              placeholder="Or type action..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Outcome</label>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map(o => (
                <button key={o} type="button"
                  onClick={() => setForm(f => ({ ...f, outcome: o }))}
                  className={`text-sm py-2 rounded-lg border font-medium transition-colors ${form.outcome === o ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                  {o === 'discharged' ? 'Discharged' : o === 'sent_home' ? 'Sent Home' : o === 'bed_rest' ? 'Bed Rest' : 'Refer to Hospital'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Medication Used (optional)</label>
              <select value={form.item_id} onChange={e => setForm(f => ({ ...f, item_id: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">None</option>
                {stock.filter(i => i.category === 'medication').map(i => (
                  <option key={i.id} value={i.id}>{i.item_name} ({i.current_count} left)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
              <input type="number" min="1" value={form.quantity_used}
                onChange={e => setForm(f => ({ ...f, quantity_used: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {msg && <p className={`text-sm ${msg === 'Visit logged' ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}

          <button type="submit" disabled={saving || !form.student_id || !form.complaint || !form.action_taken}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-blue-700 transition-colors">
            {saving ? 'Saving…' : 'Log Visit'}
          </button>
        </form>
      )}

      {/* ── SICK BAY ─────────────────────────────────────────────────────── */}
      {tab === 'sickbay' && (
        <div className="space-y-3">
          {visits.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No students currently in sick bay</p>
          )}
          {visits.map(v => (
            <div key={v.id} className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-900">{v.students?.full_name ?? 'Unknown'}</p>
                  <p className="text-xs text-gray-500">
                    {v.students?.class_name} · Arrived {new Date(v.arrived_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-sm text-gray-700 mt-1">{v.complaint}</p>
                  <p className="text-xs text-gray-500">{v.action_taken}</p>
                </div>
                <button onClick={() => discharge(v.id)}
                  className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-lg font-medium hover:bg-green-200">
                  Discharge
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── STOCK ────────────────────────────────────────────────────────── */}
      {tab === 'stock' && (
        <div className="space-y-4">
          <form onSubmit={updateStock} className="bg-white rounded-xl p-4 shadow-sm border space-y-3">
            <p className="text-sm font-semibold text-gray-700">Update Stock</p>
            <select value={stockForm.item_id} onChange={e => setStockForm(f => ({ ...f, item_id: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select item…</option>
              {stock.map(i => <option key={i.id} value={i.id}>{i.item_name} ({i.current_count} {i.unit})</option>)}
            </select>
            <div className="flex gap-2">
              <input type="number" placeholder="Delta (−used / +restock)" value={stockForm.delta}
                onChange={e => setStockForm(f => ({ ...f, delta: e.target.value }))}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input placeholder="Reason (optional)" value={stockForm.reason}
                onChange={e => setStockForm(f => ({ ...f, reason: e.target.value }))}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button type="submit" disabled={saving || !stockForm.item_id || !stockForm.delta}
              className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-blue-700">
              Update Stock
            </button>
          </form>

          <div className="space-y-2">
            {stock.map(i => (
              <div key={i.id} className="bg-white rounded-xl px-4 py-3 shadow-sm border flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900">{i.item_name}</p>
                  <p className="text-xs text-gray-500 capitalize">{i.category} · threshold {i.min_threshold} {i.unit}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColor(i.status)}`}>
                  {i.current_count} {i.unit}
                </span>
              </div>
            ))}
            {stock.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">No stock items configured</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
