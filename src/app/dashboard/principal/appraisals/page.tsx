'use client'

import { useState, useEffect, useCallback } from 'react'

type Appraisal = {
  staff_id: string; staff_name: string; subject: string | null; term_id: string;
  punctuality_score: number | null; completion_score: number | null;
  velocity_score: number | null; outcome_score: number | null; compliance_score: number | null;
  overall_score: number | null; rating: string | null;
  principal_remarks: string | null; shared_with_teacher: boolean;
  data_points: { lessons_logged: number; heartbeat_sessions: number; compliance_tasks: number; marks_entered: number };
}

const RATING_STYLE: Record<string, string> = {
  'Exceeds Expectations':  'bg-green-100 text-green-700',
  'Meeting Expectations':  'bg-blue-100 text-blue-700',
  'Needs Improvement':     'bg-yellow-100 text-yellow-700',
  'Critical':              'bg-red-100 text-red-700',
}

const METRIC_LABELS = ['Punctuality', 'Completion', 'Velocity', 'Outcomes', 'Compliance']
const WEIGHTS       = ['20%', '20%', '20%', '25%', '15%']

export default function AppraisalsPage() {
  const [appraisals, setAppraisals] = useState<Appraisal[]>([])
  const [termId, setTermId]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<Appraisal | null>(null)
  const [remarks, setRemarks]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [msg, setMsg]               = useState('')
  const [bomMode, setBomMode]       = useState(false)

  const load = useCallback(async (t?: string) => {
    setLoading(true)
    const q = t ? `?term_id=${t}` : ''
    const r = await fetch(`/api/principal/appraisals${q}`)
    if (r.ok) {
      const d = await r.json()
      setAppraisals(d.appraisals ?? [])
      if (d.term_id) setTermId(d.term_id)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveRemarks(a: Appraisal, share = false) {
    setSaving(true); setMsg('')
    const r = await fetch(`/api/principal/appraisals/${a.staff_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term_id:             termId,
        principal_remarks:   remarks,
        share_with_teacher:  share,
        punctuality_score:   a.punctuality_score,
        completion_score:    a.completion_score,
        velocity_score:      a.velocity_score,
        outcome_score:       a.outcome_score,
        compliance_score:    a.compliance_score,
        overall_score:       a.overall_score,
        rating:              a.rating,
      }),
    })
    setSaving(false)
    setMsg(r.ok ? (share ? 'Shared with teacher' : 'Saved') : 'Error')
    if (r.ok) load(termId)
  }

  function generateTscForm(a: Appraisal) {
    const lines = [
      'TSC TEACHER APPRAISAL FORM',
      '==========================',
      `Name: ${a.staff_name}`,
      `Subject(s): ${a.subject ?? 'N/A'}`,
      `Term: ${a.term_id}`,
      '',
      'PERFORMANCE METRICS',
      `1. Punctuality Score:        ${a.punctuality_score ?? 'N/A'}%`,
      `2. Lesson Completion Score:  ${a.completion_score  ?? 'N/A'}%`,
      `3. Syllabus Velocity Score:  ${a.velocity_score    ?? 'N/A'}%`,
      `4. Student Outcomes Score:   ${a.outcome_score     ?? 'N/A'}%`,
      `5. Compliance Score:         ${a.compliance_score  ?? 'N/A'}%`,
      '',
      `OVERALL SCORE: ${a.overall_score ?? 'N/A'}%`,
      `RATING: ${a.rating ?? 'N/A'}`,
      '',
      'DATA POINTS',
      `Lessons Logged:      ${a.data_points.lessons_logged}`,
      `Heartbeat Sessions:  ${a.data_points.heartbeat_sessions}`,
      `Compliance Tasks:    ${a.data_points.compliance_tasks}`,
      `Mark Entries:        ${a.data_points.marks_entered}`,
      '',
      'PRINCIPAL REMARKS',
      a.principal_remarks ?? '(None)',
      '',
      `Signature: ___________________   Date: ${new Date().toLocaleDateString('en-KE')}`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a2   = document.createElement('a')
    a2.href    = url
    a2.download = `TSC_Appraisal_${a.staff_name.replace(/\s+/g, '_')}_${a.term_id}.txt`
    a2.click()
    URL.revokeObjectURL(url)
  }

  const scoreBar = (score: number | null) => {
    if (score === null) return <span className="text-gray-400 text-xs">No data</span>
    const color = score >= 85 ? 'bg-green-500' : score >= 70 ? 'bg-blue-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
          <div className={`${color} h-1.5 rounded-full`} style={{ width: `${Math.min(100, score)}%` }} />
        </div>
        <span className="text-xs font-medium w-8 text-right">{score}%</span>
      </div>
    )
  }

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Computing appraisals…</div>

  // BOM PRESENTATION MODE
  if (bomMode) {
    return (
      <div className="p-4 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Staff Appraisals — BOM Summary</h1>
          <button onClick={() => setBomMode(false)} className="text-sm text-blue-600 hover:underline">← Detail View</button>
        </div>
        <p className="text-sm text-gray-500">Term {termId} · {appraisals.length} staff</p>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Subject</th>
                <th className="text-center px-3 py-2">Punct.</th>
                <th className="text-center px-3 py-2">Complet.</th>
                <th className="text-center px-3 py-2">Veloc.</th>
                <th className="text-center px-3 py-2">Outcome</th>
                <th className="text-center px-3 py-2">Comply</th>
                <th className="text-center px-3 py-2">Overall</th>
                <th className="text-center px-3 py-2">Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {appraisals.map(a => (
                <tr key={a.staff_id} className={`${a.rating === 'Critical' ? 'bg-red-50' : a.rating === 'Exceeds Expectations' ? 'bg-green-50' : ''}`}>
                  <td className="px-4 py-2 font-medium text-gray-900">{a.staff_name}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{a.subject ?? '—'}</td>
                  <td className="text-center px-3 py-2">{a.punctuality_score ?? '—'}</td>
                  <td className="text-center px-3 py-2">{a.completion_score ?? '—'}</td>
                  <td className="text-center px-3 py-2">{a.velocity_score ?? '—'}</td>
                  <td className="text-center px-3 py-2">{a.outcome_score ?? '—'}</td>
                  <td className="text-center px-3 py-2">{a.compliance_score ?? '—'}</td>
                  <td className="text-center px-3 py-2 font-bold">{a.overall_score ?? '—'}</td>
                  <td className="text-center px-3 py-2">
                    {a.rating && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RATING_STYLE[a.rating] ?? ''}`}>{a.rating}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-4 gap-3 text-center">
          {['Exceeds Expectations', 'Meeting Expectations', 'Needs Improvement', 'Critical'].map(r => (
            <div key={r} className={`rounded-xl p-3 ${RATING_STYLE[r]}`}>
              <p className="text-2xl font-bold">{appraisals.filter(a => a.rating === r).length}</p>
              <p className="text-xs mt-0.5">{r}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // DETAIL VIEW
  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Staff Appraisals</h1>
        <div className="flex gap-2">
          <select value={termId} onChange={e => { setTermId(e.target.value); load(e.target.value) }}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {['2026-T1', '2025-T3', '2025-T2', '2025-T1'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => setBomMode(true)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
            BOM View
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {appraisals.map(a => (
          <div key={a.staff_id}
            className={`bg-white rounded-xl shadow-sm border cursor-pointer transition-all ${selected?.staff_id === a.staff_id ? 'ring-2 ring-blue-400' : 'hover:border-gray-300'}`}
            onClick={() => { setSelected(selected?.staff_id === a.staff_id ? null : a); setRemarks(a.principal_remarks ?? ''); setMsg('') }}>
            <div className="p-4 flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{a.staff_name}</p>
                  {a.subject && <span className="text-xs text-gray-500">{a.subject}</span>}
                  {a.shared_with_teacher && <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Shared</span>}
                </div>
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {[a.punctuality_score, a.completion_score, a.velocity_score, a.outcome_score, a.compliance_score].map((sc, i) => (
                    <div key={i}>
                      <p className="text-xs text-gray-400 mb-0.5">{METRIC_LABELS[i]} <span className="text-gray-300">({WEIGHTS[i]})</span></p>
                      {scoreBar(sc)}
                    </div>
                  ))}
                </div>
              </div>
              <div className="ml-4 text-right">
                <p className="text-2xl font-bold text-gray-900">{a.overall_score ?? '—'}</p>
                {a.rating && <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RATING_STYLE[a.rating] ?? ''}`}>{a.rating}</span>}
              </div>
            </div>

            {selected?.staff_id === a.staff_id && (
              <div className="px-4 pb-4 pt-0 border-t space-y-3" onClick={e => e.stopPropagation()}>
                <div className="grid grid-cols-4 gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                  <span>Lessons logged: <b>{a.data_points.lessons_logged}</b></span>
                  <span>Heartbeats: <b>{a.data_points.heartbeat_sessions}</b></span>
                  <span>Compliance tasks: <b>{a.data_points.compliance_tasks}</b></span>
                  <span>Mark entries: <b>{a.data_points.marks_entered}</b></span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Principal Remarks</label>
                  <textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)}
                    placeholder="Add written remarks before sharing with teacher..."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                {msg && <p className={`text-xs ${msg.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>{msg}</p>}
                <div className="flex gap-2">
                  <button onClick={() => saveRemarks(a, false)} disabled={saving}
                    className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
                    Save Remarks
                  </button>
                  <button onClick={() => saveRemarks(a, true)} disabled={saving}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    Share with Teacher
                  </button>
                  <button onClick={() => generateTscForm(a)}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700">
                    TSC Form ↓
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
