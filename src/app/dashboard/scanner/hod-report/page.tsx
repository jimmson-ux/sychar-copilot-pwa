'use client'

export const dynamic = 'force-dynamic'


import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ClipboardList, CheckCircle, AlertTriangle, Plus, Trash2 } from 'lucide-react'
import DocumentScanner, { type ScanResult } from '@/components/DocumentScanner'
import GeminiLoadingOverlay from '@/components/GeminiLoadingOverlay'
import { useOCRScanner } from '@/hooks/useOCRScanner'


const ALLOWED_ROLES = ['hod_subjects', 'hod_pathways', 'deputy_principal', 'principal', 'dean_of_studies', 'deputy_dean_of_studies']

interface IssueItem {
  issue: string
  raised_by: string
  status: string
}

interface ActionItem {
  action: string
  assigned_to: string
  deadline: string
  status: string
}

const inputCls = 'w-full bg-[#f9fafb] border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-[var(--role-primary,#0891b2)] transition-colors'
const selectCls = 'bg-[#f9fafb] border border-gray-200 rounded-lg px-2 py-1.5 text-gray-900 text-xs focus:outline-none focus:border-[var(--role-primary,#0891b2)] transition-colors'

export default function HodReportPage() {
  const router = useRouter()
  const { scan, isScanning } = useOCRScanner()
  const [phase, setPhase] = useState<'idle' | 'review' | 'saving' | 'done'>('idle')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [department, setDepartment] = useState('')
  const [hodName, setHodName] = useState('')
  const [reportDate, setReportDate] = useState('')
  const [issues, setIssues] = useState<IssueItem[]>([])
  const [actions, setActions] = useState<ActionItem[]>([])
  const [saveError, setSaveError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      createClient().from('staff_records').select('sub_role, full_name, department').eq('user_id', user.id).single()
        .then(({ data }) => {
          if (!data) return
          if (!ALLOWED_ROLES.includes(data.sub_role)) { router.replace('/dashboard/scanner'); return }
          if (data.full_name) setHodName(data.full_name)
          if (data.department) setDepartment(data.department)
        })
    })
  }, [router])

  async function handleScanComplete(result: ScanResult) {
    const ocr = await scan(result.base64, 'ocr_hod_report')
    if (!ocr) return
    const d = ocr.data
    setConfidence(ocr.confidence)
    if (d.department)   setDepartment(String(d.department))
    if (d.hod_name)     setHodName(String(d.hod_name))
    if (d.report_date)  setReportDate(String(d.report_date))

    const issuesRaw = Array.isArray(d.issues_raised)
      ? (d.issues_raised as Array<Record<string, unknown>>).map((i) => ({
          issue:     String(i.issue     ?? ''),
          raised_by: String(i.raised_by ?? ''),
          status:    String(i.status    ?? 'pending'),
        }))
      : []
    setIssues(issuesRaw)

    const actionsRaw = Array.isArray(d.action_items)
      ? (d.action_items as Array<Record<string, unknown>>).map((a) => ({
          action:      String(a.action      ?? ''),
          assigned_to: String(a.assigned_to ?? ''),
          deadline:    String(a.deadline    ?? ''),
          status:      String(a.status      ?? 'pending'),
        }))
      : []
    setActions(actionsRaw)
    setPhase('review')
  }

  async function handleSave() {
    setSaveError('')
    setPhase('saving')
    const res = await fetch('/api/scanner/hod-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportData: { department, hodName, reportDate },
        issuesRaised: issues,
        actionItems: actions,
        userId,
      }),
    })
    const data = await res.json()
    if (data.success) setPhase('done')
    else { setSaveError(data.error || 'Save failed'); setPhase('review') }
  }

  function updateIssue(i: number, field: keyof IssueItem, val: string) {
    setIssues(issues.map((item, idx) => idx === i ? { ...item, [field]: val } : item))
  }
  function updateAction(i: number, field: keyof ActionItem, val: string) {
    setActions(actions.map((item, idx) => idx === i ? { ...item, [field]: val } : item))
  }

  return (
    <div className="bg-[#f8fafc] min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-[#FF0A6C]/10 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-[#FF0A6C]" />
          </div>
          <div>
            <h1 className="text-gray-900 font-display text-xl font-semibold">Department Report Scanner</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Upload a printed department meeting report or minutes. Gemini will extract all action items.
            </p>
          </div>
        </div>

        {phase === 'done' && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 mt-6 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-gray-900 font-medium mb-1">Report Saved &amp; Staff Notified</p>
            <p className="text-gray-500 text-xs mb-4">{department} Department — {reportDate}</p>
            <p className="text-gray-500 text-xs mb-4">{actions.length} action items assigned</p>
            <div className="flex gap-3">
              <button onClick={() => setPhase('idle')}
                className="flex-1 bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] text-white rounded-2xl py-2.5 text-sm font-medium">
                Scan Another
              </button>
              <button onClick={() => router.push('/dashboard/scanner')}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-2xl py-2.5 text-sm transition-colors">
                Back
              </button>
            </div>
          </div>
        )}

        {phase === 'idle' && (
          <div className="relative mt-6">
            <DocumentScanner documentType="hod-report" title="HOD Report" onScanComplete={handleScanComplete} />
            <GeminiLoadingOverlay isVisible={isScanning} task="ocr_hod_report" />
          </div>
        )}

        {(phase === 'review' || phase === 'saving') && (
          <div className="mt-6 space-y-4">
            {confidence !== null && (
              <div className={`flex items-center gap-2 p-3 rounded-xl ${confidence > 0.8 ? 'bg-emerald-500/20 border border-emerald-500/30' : confidence >= 0.5 ? 'bg-orange-500/20 border border-orange-500/30' : 'bg-[#FF0A6C]/20 border border-[#FF0A6C]/30'}`}>
                <span className={`text-xs font-medium ${confidence > 0.8 ? 'text-emerald-400' : confidence >= 0.5 ? 'text-orange-400' : 'text-[#FF0A6C]'}`}>
                  {confidence > 0.8 ? 'High confidence read' : confidence >= 0.5 ? 'Please verify details' : 'Low confidence — check all fields carefully'}
                </span>
                <span className="text-gray-500 text-xs ml-auto">{Math.round(confidence * 100)}%</span>
              </div>
            )}

            {/* Report details */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6">
              <h2 className="text-gray-900 font-display font-semibold mb-4">Report Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-gray-500 text-xs mb-1 block">Department</label>
                  <input className={inputCls} value={department} onChange={(e) => setDepartment(e.target.value)} />
                </div>
                <div>
                  <label className="text-gray-500 text-xs mb-1 block">HOD Name</label>
                  <input className={inputCls} value={hodName} onChange={(e) => setHodName(e.target.value)} />
                </div>
                <div>
                  <label className="text-gray-500 text-xs mb-1 block">Report Date</label>
                  <input type="date" className={inputCls} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Issues raised */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-gray-900 font-display font-semibold">Issues Raised</h2>
                <button onClick={() => setIssues([...issues, { issue: '', raised_by: '', status: 'pending' }])}
                  className="flex items-center gap-1 text-[#2D27FF] hover:text-blue-400 text-xs transition-colors">
                  <Plus className="w-3 h-3" /> Add Issue
                </button>
              </div>
              <div className="space-y-3">
                {issues.length === 0 && (
                  <p className="text-gray-600 text-sm text-center py-4">No issues extracted. Add one manually.</p>
                )}
                {issues.map((item, i) => (
                  <div key={i} className="bg-[#f9fafb] rounded-xl p-3 flex gap-3">
                    <div className="flex-1 space-y-2">
                      <textarea className="w-full bg-transparent border-b border-gray-200 text-gray-600 text-sm focus:outline-none focus:border-[var(--role-primary,#0891b2)] resize-none pb-1 placeholder:text-gray-400"
                        rows={2} placeholder="Issue description..." value={item.issue}
                        onChange={(e) => updateIssue(i, 'issue', e.target.value)} />
                      <div className="flex gap-2">
                        <input className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-500 text-xs focus:outline-none focus:border-[var(--role-primary,#0891b2)]"
                          placeholder="Raised by..." value={item.raised_by}
                          onChange={(e) => updateIssue(i, 'raised_by', e.target.value)} />
                        <select className={selectCls} value={item.status}
                          onChange={(e) => updateIssue(i, 'status', e.target.value)}>
                          <option value="pending">Pending</option>
                          <option value="resolved">Resolved</option>
                          <option value="escalated">Escalated</option>
                        </select>
                      </div>
                    </div>
                    <button onClick={() => setIssues(issues.filter((_, idx) => idx !== i))}
                      className="text-gray-600 hover:text-[#FF0A6C] transition-colors self-start mt-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Action items */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-gray-900 font-display font-semibold">Action Items</h2>
                <button onClick={() => setActions([...actions, { action: '', assigned_to: '', deadline: '', status: 'pending' }])}
                  className="flex items-center gap-1 text-[#2D27FF] hover:text-blue-400 text-xs transition-colors">
                  <Plus className="w-3 h-3" /> Add Action
                </button>
              </div>
              <div className="space-y-3">
                {actions.length === 0 && (
                  <p className="text-gray-600 text-sm text-center py-4">No action items extracted. Add one manually.</p>
                )}
                {actions.map((item, i) => (
                  <div key={i} className="bg-[#f9fafb] rounded-xl p-3 flex gap-3">
                    <div className="flex-1 space-y-2">
                      <textarea className="w-full bg-transparent border-b border-gray-200 text-gray-600 text-sm focus:outline-none focus:border-[var(--role-primary,#0891b2)] resize-none pb-1 placeholder:text-gray-400"
                        rows={2} placeholder="Action description..." value={item.action}
                        onChange={(e) => updateAction(i, 'action', e.target.value)} />
                      <div className="grid grid-cols-3 gap-2">
                        <input className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-500 text-xs focus:outline-none focus:border-[var(--role-primary,#0891b2)]"
                          placeholder="Assigned to..." value={item.assigned_to}
                          onChange={(e) => updateAction(i, 'assigned_to', e.target.value)} />
                        <input type="date" className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-500 text-xs focus:outline-none focus:border-[var(--role-primary,#0891b2)]"
                          value={item.deadline}
                          onChange={(e) => updateAction(i, 'deadline', e.target.value)} />
                        <select className={selectCls} value={item.status}
                          onChange={(e) => updateAction(i, 'status', e.target.value)}>
                          <option value="pending">Pending</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                    </div>
                    <button onClick={() => setActions(actions.filter((_, idx) => idx !== i))}
                      className="text-gray-600 hover:text-[#FF0A6C] transition-colors self-start mt-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {saveError && (
              <div className="p-3 bg-[#FF0A6C]/10 border border-[#FF0A6C]/30 rounded-xl text-[#FF0A6C] text-xs flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {saveError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSave} disabled={phase === 'saving'}
                className="flex-1 bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] text-white rounded-2xl py-3 text-sm font-medium shadow-[0_0_15px_rgba(255,10,108,0.3)] disabled:opacity-50">
                {phase === 'saving' ? 'Saving...' : 'Save Report & Notify Staff'}
              </button>
              <button onClick={() => setPhase('idle')}
                className="border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-2xl px-6 py-3 text-sm transition-colors">
                Rescan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
