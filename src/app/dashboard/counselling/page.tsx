'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'

interface WelfareLog {
  id: string
  student_id: string
  session_date: string
  wis_score: number
  kbi_tags: string[]
  follow_up_date: string | null
  is_confidential: boolean
  created_at: string
  students: { id: string; full_name: string; admission_number: string | null }
}

interface PrincipalFlag {
  id: string
  student_id: string
  flag_reason: string
  urgency: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'acknowledged' | 'meeting_scheduled' | 'resolved'
  counsellor_response: string | null
  meeting_date: string | null
  created_at: string
  students: { id: string; full_name: string; admission_number: string | null }
}

interface FlagModalState {
  open: boolean
  logId: string
  studentId: string
  studentName: string
}

interface ResponseModalState {
  open: boolean
  flag: PrincipalFlag | null
}

const URGENCY_STYLES: Record<string, string> = {
  low:      'bg-gray-100 text-gray-700',
  medium:   'bg-yellow-100 text-yellow-800',
  high:     'bg-orange-100 text-orange-800',
  critical: 'bg-red-600 text-white',
}

const WIS_COLORS = ['', '#22c55e', '#84cc16', '#f59e0b', '#ef4444', '#7f1d1d']
const WIS_LABELS = ['', 'Good', 'Mild', 'Moderate', 'High', 'Critical']

export default function CounsellingPage() {
  const [logs, setLogs] = useState<WelfareLog[]>([])
  const [flags, setFlags] = useState<PrincipalFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'logs' | 'flags'>('flags')
  const [flagModal, setFlagModal] = useState<FlagModalState>({ open: false, logId: '', studentId: '', studentName: '' })
  const [responseModal, setResponseModal] = useState<ResponseModalState>({ open: false, flag: null })
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/welfare/log').then(r => r.json()),
      fetch('/api/principal-flags').then(r => r.json()),
    ]).then(([logData, flagData]) => {
      setLogs(logData.logs ?? [])
      setFlags(flagData.flags ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const openFlags = flags.filter(f => f.status === 'open')
  const inProgressFlags = flags.filter(f => ['acknowledged', 'meeting_scheduled'].includes(f.status))
  const resolvedFlags = flags.filter(f => f.status === 'resolved')

  async function updateFlag(id: string, updates: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/principal-flags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const { flags: newFlags } = await fetch('/api/principal-flags').then(r => r.json())
        setFlags(newFlags ?? [])
      }
    } catch { setError('Failed to update flag') }
  }

  async function createFlag(reason: string, urgency: string) {
    if (!flagModal.studentId) return
    try {
      const res = await fetch('/api/principal-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: flagModal.studentId,
          flagReason: reason,
          urgency,
          welfareLogId: flagModal.logId || undefined,
        }),
      })
      if (res.ok) {
        const { flags: newFlags } = await fetch('/api/principal-flags').then(r => r.json())
        setFlags(newFlags ?? [])
        setFlagModal({ open: false, logId: '', studentId: '', studentName: '' })
      }
    } catch { setError('Failed to create flag') }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Guidance & Counselling</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Welfare logs are confidential. Principal flags require your attention.
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          <button onClick={() => setActiveTab('flags')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'flags' ? 'bg-red-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            🚩 Flags
            {openFlags.length > 0 && (
              <span className="bg-white text-red-600 rounded-full px-1.5 py-0.5 text-xs font-bold">{openFlags.length}</span>
            )}
          </button>
          <button onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === 'logs' ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            📋 Welfare Logs
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-teal-500 rounded-full animate-spin" />
          </div>
        ) : activeTab === 'flags' ? (
          <FlagsView
            openFlags={openFlags}
            inProgressFlags={inProgressFlags}
            resolvedFlags={resolvedFlags}
            onUpdateFlag={updateFlag}
            onOpenResponse={(flag) => setResponseModal({ open: true, flag })}
          />
        ) : (
          <LogsView
            logs={logs}
            onFlagForAttention={(logId, studentId, studentName) =>
              setFlagModal({ open: true, logId, studentId, studentName })
            }
          />
        )}
      </div>

      {/* Flag creation modal (principal view) */}
      {flagModal.open && (
        <FlagCreateModal
          studentName={flagModal.studentName}
          onSubmit={createFlag}
          onClose={() => setFlagModal({ open: false, logId: '', studentId: '', studentName: '' })}
        />
      )}

      {/* Counsellor response modal */}
      {responseModal.open && responseModal.flag && (
        <FlagResponseModal
          flag={responseModal.flag}
          onUpdate={updateFlag}
          onClose={() => setResponseModal({ open: false, flag: null })}
        />
      )}
    </div>
  )
}

// ─── Flags View ───────────────────────────────────────────────────────────────

function FlagsView({
  openFlags, inProgressFlags, resolvedFlags, onUpdateFlag, onOpenResponse,
}: {
  openFlags: PrincipalFlag[]
  inProgressFlags: PrincipalFlag[]
  resolvedFlags: PrincipalFlag[]
  onUpdateFlag: (id: string, u: Record<string, unknown>) => void
  onOpenResponse: (f: PrincipalFlag) => void
}) {
  return (
    <div className="space-y-6">
      {[
        { label: 'Open Flags', flags: openFlags, color: 'border-red-300' },
        { label: 'In Progress', flags: inProgressFlags, color: 'border-orange-300' },
        { label: 'Resolved This Month', flags: resolvedFlags.slice(0, 5), color: 'border-green-300' },
      ].map(({ label, flags, color }) => (
        <div key={label}>
          <h3 className="text-sm font-semibold text-gray-600 mb-2">{label} ({flags.length})</h3>
          {flags.length === 0 ? (
            <p className="text-sm text-gray-400 italic">None</p>
          ) : (
            <div className="space-y-3">
              {flags.map(flag => (
                <div key={flag.id} className={`bg-white rounded-2xl border-l-4 ${color} border border-gray-200 p-4`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{flag.students?.full_name}</p>
                      <p className="text-xs text-gray-500">{new Date(flag.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold capitalize ${URGENCY_STYLES[flag.urgency]}`}>
                      {flag.urgency}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">{flag.flag_reason}</p>
                  {flag.counsellor_response && (
                    <div className="bg-teal-50 border border-teal-200 rounded-lg p-2 mb-3">
                      <p className="text-xs text-teal-700 font-medium mb-0.5">Your response:</p>
                      <p className="text-xs text-teal-800">{flag.counsellor_response}</p>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {flag.status === 'open' && (
                      <button onClick={() => onUpdateFlag(flag.id, { status: 'acknowledged' })}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
                        Acknowledge
                      </button>
                    )}
                    {['open', 'acknowledged'].includes(flag.status) && (
                      <button onClick={() => onOpenResponse(flag)}
                        className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-800">
                        Schedule / Respond
                      </button>
                    )}
                    {flag.status !== 'resolved' && (
                      <button onClick={() => onUpdateFlag(flag.id, { status: 'resolved' })}
                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg font-medium hover:bg-green-700">
                        Mark Resolved
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Logs View ────────────────────────────────────────────────────────────────

function LogsView({ logs, onFlagForAttention }: {
  logs: WelfareLog[]
  onFlagForAttention: (logId: string, studentId: string, studentName: string) => void
}) {
  return (
    <div className="space-y-3">
      {logs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p>No welfare logs yet</p>
        </div>
      ) : logs.map(log => (
        <div key={log.id} className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="font-semibold text-gray-900 text-sm">{log.students?.full_name}</p>
              <p className="text-xs text-gray-500">{new Date(log.session_date).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                style={{ background: WIS_COLORS[log.wis_score] }}>
                WIS {log.wis_score} — {WIS_LABELS[log.wis_score]}
              </span>
              {log.is_confidential && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">🔒</span>
              )}
            </div>
          </div>
          {log.kbi_tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {log.kbi_tags.map(tag => (
                <span key={tag} className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{tag}</span>
              ))}
            </div>
          )}
          {log.follow_up_date && (
            <p className="text-xs text-orange-600 mb-2">Follow-up: {new Date(log.follow_up_date).toLocaleDateString()}</p>
          )}
          <button
            onClick={() => onFlagForAttention(log.id, log.student_id, log.students?.full_name ?? '')}
            className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
          >
            🚩 Flag for Principal Attention
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Flag Create Modal ────────────────────────────────────────────────────────

function FlagCreateModal({ studentName, onSubmit, onClose }: {
  studentName: string
  onSubmit: (reason: string, urgency: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [urgency, setUrgency] = useState('medium')

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
        <h3 className="font-bold text-gray-900 mb-1">Flag for Attention</h3>
        <p className="text-sm text-gray-500 mb-4">Student: <strong>{studentName}</strong></p>

        <label className="block text-sm font-medium text-gray-700 mb-1">Flag Reason *</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)}
          rows={3} maxLength={1000} placeholder="Why are you flagging this student?"
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-4 resize-none" />

        <label className="block text-sm font-medium text-gray-700 mb-2">Urgency</label>
        <div className="flex gap-2 mb-5">
          {(['low','medium','high','critical'] as const).map(u => (
            <button key={u} type="button" onClick={() => setUrgency(u)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize border transition-colors ${
                urgency === u ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300'
              }`}>{u}</button>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => { if (reason.trim()) onSubmit(reason.trim(), urgency) }}
            disabled={!reason.trim()}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-xl text-sm font-medium">
            Send Flag to Counsellor
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Flag Response Modal ──────────────────────────────────────────────────────

function FlagResponseModal({ flag, onUpdate, onClose }: {
  flag: PrincipalFlag
  onUpdate: (id: string, u: Record<string, unknown>) => void
  onClose: () => void
}) {
  const [response, setResponse] = useState(flag.counsellor_response ?? '')
  const [meetingDate, setMeetingDate] = useState(flag.meeting_date?.split('T')[0] ?? '')

  function handleSave() {
    const updates: Record<string, unknown> = {}
    if (response.trim()) updates.counsellorResponse = response.trim()
    if (meetingDate) {
      updates.meetingDate = new Date(meetingDate).toISOString()
      updates.status = 'meeting_scheduled'
    }
    onUpdate(flag.id, updates)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
        <h3 className="font-bold text-gray-900 mb-1">Respond to Flag</h3>
        <p className="text-sm text-gray-500 mb-4">Student: <strong>{flag.students?.full_name}</strong></p>

        <label className="block text-sm font-medium text-gray-700 mb-1">Schedule Meeting Date</label>
        <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-teal-400" />

        <label className="block text-sm font-medium text-gray-700 mb-1">Counsellor Response / Notes</label>
        <textarea value={response} onChange={e => setResponse(e.target.value)}
          rows={4} maxLength={2000} placeholder="Your response to the principal..."
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 mb-5 resize-none" />

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave}
            className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-medium">
            Save Response
          </button>
        </div>
      </div>
    </div>
  )
}
