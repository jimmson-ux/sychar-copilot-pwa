'use client'

import { useState, useEffect, useCallback } from 'react'
import { use } from 'react'

type CaseDetail = {
  id: string; status: string; incident_date: string; allegations: string;
  student_response: string | null; student_informed_date: string | null;
  draft_letter: string | null;
  students: { full_name: string; class_name: string; admission_number: string | null; parent_phone: string | null } | null;
  staff_records: { full_name: string } | null;
}

type ScrapedEvidence = {
  tod_reports: { duty_date: string; report: string; staff_records: { full_name: string } | null }[];
  corrective_history: { date: string; incident_type: string; severity: string; action_taken: string; resolution_status: string }[];
  attendance_summary: { total_days: number; present_days: number; attendance_pct: number | null };
}

export default function PrincipalSuspensionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [caseData, setCaseData]   = useState<CaseDetail | null>(null)
  const [evidence, setEvidence]   = useState<ScrapedEvidence | null>(null)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState('')
  const [action, setAction]       = useState<'approve' | 'decline' | null>(null)

  const [approveForm, setApproveForm] = useState({
    start_date: '', end_date: '', final_letter: '',
  })
  const [declineReason, setDeclineReason] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(`/api/suspension/cases/${id}`)
    if (r.ok) {
      const d = await r.json()
      setCaseData(d.case)
      setEvidence(d.scraped_evidence)
      setApproveForm(f => ({ ...f, final_letter: d.case.draft_letter ?? '' }))
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function submit() {
    if (!action) return
    setSaving(true); setMsg('')

    const body = action === 'approve'
      ? { action, start_date: approveForm.start_date, end_date: approveForm.end_date, final_letter: approveForm.final_letter }
      : { action: 'decline', decline_reason: declineReason }

    const r = await fetch(`/api/suspension/cases/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)

    if (r.ok) {
      const d = await r.json()
      if (action === 'approve') {
        setMsg(`Approved. Record ID: ${d.record_id}. WhatsApp: ${d.whatsapp_sent ? 'sent' : 'failed'}${!d.whatsapp_sent && d.sms_sent ? ' (SMS fallback sent)' : ''}${d.gc_referral_suggested ? ' · G&C referral suggested.' : ''}`)
      } else {
        setMsg('Case declined.')
      }
      load()
    } else {
      const d = await r.json(); setMsg(d.error ?? 'Error')
    }
  }

  if (!caseData) return <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>

  const student   = caseData.students
  const submitted = new Date(caseData.incident_date)
  const attPct    = evidence?.attendance_summary.attendance_pct

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Suspension Review</h1>
        <a href="/dashboard/principal" className="text-sm text-blue-600 hover:underline">← Dashboard</a>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl p-4 shadow-sm border">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xl font-bold text-gray-900">{student?.full_name}</p>
            <p className="text-sm text-gray-500">{student?.class_name} · {student?.admission_number ?? 'No adm. no.'}</p>
            <p className="text-xs text-gray-400 mt-0.5">Submitted by: {caseData.staff_records?.full_name ?? 'Staff'} · Incident: {submitted.toLocaleDateString('en-KE')}</p>
          </div>
          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${caseData.status === 'submitted' ? 'bg-blue-100 text-blue-700' : caseData.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            {caseData.status}
          </span>
        </div>
      </div>

      {/* Two-column comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Case details */}
        <div className="space-y-3">
          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Allegations</p>
            <p className="text-sm text-gray-800 leading-relaxed">{caseData.allegations}</p>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Student Response</p>
            {caseData.student_response
              ? <p className="text-sm text-gray-800">{caseData.student_response}</p>
              : <p className="text-sm text-gray-400 italic">Not recorded</p>
            }
            {caseData.student_informed_date && (
              <p className="text-xs text-gray-500 mt-1">Informed: {new Date(caseData.student_informed_date).toLocaleDateString('en-KE')}</p>
            )}
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Draft Letter</p>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{caseData.draft_letter ?? 'No draft'}</pre>
          </div>
        </div>

        {/* Right: Evidence */}
        <div className="space-y-3">
          {/* Attendance */}
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">Evidence Panel</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Attendance (30 days)</span>
              {attPct !== null && attPct !== undefined
                ? <span className={`font-bold ${attPct < 75 ? 'text-red-600' : 'text-green-600'}`}>{attPct}%</span>
                : <span className="text-gray-400 text-sm">N/A</span>
              }
            </div>
            {evidence && (
              <p className="text-xs text-gray-500">{evidence.attendance_summary.present_days} / {evidence.attendance_summary.total_days} days present</p>
            )}
          </div>

          {/* Discipline history */}
          {evidence && evidence.corrective_history.length > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Discipline History ({evidence.corrective_history.length})</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {evidence.corrective_history.map((h, i) => (
                  <div key={i} className="text-xs border rounded p-2">
                    <span className="font-medium">{new Date(h.date).toLocaleDateString('en-KE')}</span>
                    {' '}<span className="text-red-600">[{h.severity}]</span>
                    {' '}{h.incident_type} → {h.action_taken}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TOD reports */}
          {evidence && evidence.tod_reports.length > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">TOD Reports (±7 days)</p>
              <div className="space-y-1">
                {evidence.tod_reports.map((t, i) => (
                  <div key={i} className="text-xs border rounded p-2">
                    <span className="font-medium">{new Date(t.duty_date).toLocaleDateString('en-KE')}</span>
                    {t.staff_records && <span className="text-gray-500"> · {t.staff_records.full_name}</span>}
                    <p className="text-gray-600 mt-0.5 line-clamp-3">{t.report}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action panel — only for submitted cases */}
      {caseData.status === 'submitted' && (
        <div className="bg-white rounded-xl p-4 shadow-sm border space-y-4">
          <p className="text-sm font-semibold text-gray-700">Principal Decision</p>

          <div className="flex gap-3">
            <button onClick={() => setAction('approve')}
              className={`flex-1 py-2 rounded-lg border font-medium text-sm ${action === 'approve' ? 'bg-green-600 text-white border-green-600' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
              Approve
            </button>
            <button onClick={() => setAction('decline')}
              className={`flex-1 py-2 rounded-lg border font-medium text-sm ${action === 'decline' ? 'bg-red-600 text-white border-red-600' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
              Decline
            </button>
          </div>

          {action === 'approve' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Suspension Start *</label>
                  <input type="date" value={approveForm.start_date}
                    onChange={e => setApproveForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Suspension End *</label>
                  <input type="date" value={approveForm.end_date}
                    onChange={e => setApproveForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Final Letter *</label>
                <textarea rows={10} value={approveForm.final_letter}
                  onChange={e => setApproveForm(f => ({ ...f, final_letter: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">
                Approving will: generate SHA-256 signed PDF, trigger student suspension in database, WhatsApp parent (SMS fallback), notify all teachers (privacy-preserving).
              </p>
            </div>
          )}

          {action === 'decline' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason for Decline</label>
              <textarea rows={3} value={declineReason} onChange={e => setDeclineReason(e.target.value)}
                placeholder="Reason (optional)..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" />
            </div>
          )}

          {msg && (
            <p className={`text-sm rounded p-2 ${msg.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{msg}</p>
          )}

          {action && (
            <button onClick={submit} disabled={saving || (action === 'approve' && (!approveForm.start_date || !approveForm.end_date || !approveForm.final_letter))}
              className={`w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 text-white ${action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
              {saving ? 'Processing…' : action === 'approve' ? 'Confirm Approval & Issue Suspension' : 'Confirm Decline'}
            </button>
          )}
        </div>
      )}

      {(caseData.status === 'approved' || caseData.status === 'declined') && (
        <div className={`rounded-xl p-4 border text-sm text-center ${caseData.status === 'approved' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          Case {caseData.status}
        </div>
      )}
    </div>
  )
}
