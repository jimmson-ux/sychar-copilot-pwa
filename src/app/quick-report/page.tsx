'use client'

import { useState, useCallback } from 'react'

type Step = 'pin' | 'student' | 'offense' | 'done' | 'error'

interface Rule {
  id:        string
  category:  string
  rule_text: string
  severity:  number
}

interface Student {
  id:           string
  full_name:    string
  admission_no: string
  class_name:   string
}

const SEVERITY_LABELS: Record<number, string> = {
  1: 'Minor',
  2: 'Moderate',
  3: 'Critical',
}

export default function QuickReportPage() {
  const [step,        setStep]        = useState<Step>('pin')
  const [schoolCode,  setSchoolCode]  = useState('')
  const [pin,         setPin]         = useState('')
  const [pinError,    setPinError]    = useState('')
  const [verifying,   setVerifying]   = useState(false)
  const [schoolName,  setSchoolName]  = useState('')
  const [schoolId,    setSchoolId]    = useState('')
  const [rules,       setRules]       = useState<Rule[]>([])
  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState<Student[]>([])
  const [searching,   setSearching]   = useState(false)
  const [student,     setStudent]     = useState<Student | null>(null)
  const [ruleId,      setRuleId]      = useState('')
  const [description, setDescription] = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [errorMsg,    setErrorMsg]    = useState('')
  const [refId,       setRefId]       = useState('')

  // Derive category + severity from selected rule
  const selectedRule = rules.find(r => r.id === ruleId)

  async function verifyPin() {
    setPinError('')
    setVerifying(true)
    const res = await fetch(
      `/api/quick-report?code=${encodeURIComponent(schoolCode.trim())}&pin=${encodeURIComponent(pin.trim())}`
    )
    setVerifying(false)
    if (!res.ok) {
      const d = await res.json()
      setPinError(d.error ?? 'Invalid PIN or school code')
      return
    }
    const d = await res.json()
    setSchoolName(d.school_name)
    setSchoolId(d.school_id)
    setRules(d.rules ?? [])
    setStep('student')
  }

  const searchStudents = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    const res = await fetch(
      `/api/quick-report?code=${encodeURIComponent(schoolCode)}&pin=${encodeURIComponent(pin)}&q=${encodeURIComponent(q)}`
    )
    setSearching(false)
    if (res.ok) {
      const d = await res.json()
      setResults(d.students ?? [])
    }
  }, [schoolCode, pin])

  async function submit() {
    if (!student || !selectedRule) return
    setSubmitting(true)
    const res = await fetch('/api/quick-report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        school_code: schoolCode,
        pin,
        student_id:  student.id,
        school_id:   schoolId,
        category:    selectedRule.category,
        severity:    SEVERITY_LABELS[selectedRule.severity] ?? 'Minor',
        description: description.trim() || undefined,
      }),
    })
    setSubmitting(false)
    if (res.ok) {
      const d = await res.json()
      setRefId(d.record_id)
      setStep('done')
    } else {
      const d = await res.json()
      setErrorMsg(d.error ?? 'Submission failed. Please try again.')
      setStep('error')
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-6">
          <span className="text-xl font-extrabold tracking-tight text-white">
            Sychar<span className="text-[#09D1C7]">Copilot</span>
          </span>
          <p className="text-sm text-gray-400 mt-1">Quick Discipline Report</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">

          {/* ── STEP: PIN ──────────────────────────────────────────── */}
          {step === 'pin' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-white">Enter school code &amp; weekly PIN</h2>
              <p className="text-xs text-gray-500">The PIN changes every Monday. Check the staffroom noticeboard or your duty WhatsApp group.</p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">School Code (4 digits)</label>
                  <input
                    value={schoolCode}
                    onChange={e => setSchoolCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="1834"
                    inputMode="numeric"
                    maxLength={4}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-center font-mono text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Weekly PIN (6 digits)</label>
                  <input
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="——————"
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-center font-mono text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
                  />
                </div>
              </div>

              {pinError && (
                <p className="text-sm text-red-400 text-center">{pinError}</p>
              )}

              <button
                onClick={verifyPin}
                disabled={schoolCode.length !== 4 || pin.length !== 6 || verifying}
                className="w-full bg-[#09D1C7] text-gray-950 font-semibold py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-[#07b8af] transition-colors"
              >
                {verifying ? 'Verifying…' : 'Continue'}
              </button>
            </div>
          )}

          {/* ── STEP: STUDENT SEARCH ───────────────────────────────── */}
          {step === 'student' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-white">{schoolName}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Search student by name or admission number</p>
              </div>

              <input
                value={query}
                onChange={e => {
                  setQuery(e.target.value)
                  searchStudents(e.target.value)
                }}
                placeholder="Type name or admission no…"
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
              />

              {searching && (
                <p className="text-xs text-gray-500 text-center">Searching…</p>
              )}

              {results.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {results.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setStudent(s); setStep('offense') }}
                      className="w-full flex items-center justify-between bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-xl px-4 py-3 text-left transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-white">{s.full_name}</p>
                        <p className="text-xs text-gray-400">{s.class_name} · {s.admission_no}</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}

              {query.length >= 2 && results.length === 0 && !searching && (
                <p className="text-xs text-gray-500 text-center">No students found</p>
              )}
            </div>
          )}

          {/* ── STEP: OFFENSE ─────────────────────────────────────── */}
          {step === 'offense' && student && (
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-400">Student</p>
                <p className="text-sm font-semibold text-white">{student.full_name}</p>
                <p className="text-xs text-gray-400">{student.class_name} · {student.admission_no}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Category &amp; Severity</label>
                <select
                  value={ruleId}
                  onChange={e => setRuleId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
                >
                  <option value="">— Select category —</option>
                  {rules.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.category} ({SEVERITY_LABELS[r.severity] ?? r.severity})
                    </option>
                  ))}
                </select>
              </div>

              {selectedRule && (
                <div className={`rounded-xl px-4 py-3 border ${
                  selectedRule.severity === 3
                    ? 'bg-red-950 border-red-800 text-red-300'
                    : selectedRule.severity === 2
                    ? 'bg-yellow-950 border-yellow-800 text-yellow-300'
                    : 'bg-gray-800 border-gray-700 text-gray-300'
                }`}>
                  <p className="text-xs font-medium uppercase tracking-wide opacity-70 mb-0.5">
                    {SEVERITY_LABELS[selectedRule.severity]} offense
                  </p>
                  <p className="text-xs leading-relaxed">{selectedRule.rule_text}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Description (optional)</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Briefly describe what happened…"
                  maxLength={300}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7] resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('student')}
                  className="flex-1 bg-gray-800 text-gray-300 py-3 rounded-xl text-sm font-medium hover:bg-gray-700"
                >
                  ← Back
                </button>
                <button
                  onClick={submit}
                  disabled={!ruleId || submitting}
                  className="flex-1 bg-[#09D1C7] text-gray-950 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-[#07b8af] transition-colors"
                >
                  {submitting ? 'Submitting…' : 'Submit Report'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: DONE ────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="text-center space-y-4 py-4">
              <div className="w-14 h-14 rounded-full bg-[#09D1C7]/10 border border-[#09D1C7]/30 flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-[#09D1C7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-white">Report submitted</h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                The class teacher has been notified.
                {selectedRule?.severity === 3 && ' The principal has also been alerted (Critical offense).'}
              </p>
              {refId && (
                <p className="text-xs text-gray-500">
                  Ref: <span className="font-mono text-gray-400">{refId.slice(0, 8).toUpperCase()}</span>
                </p>
              )}
              <button
                onClick={() => {
                  setStep('student')
                  setStudent(null)
                  setQuery('')
                  setResults([])
                  setRuleId('')
                  setDescription('')
                }}
                className="text-sm text-[#09D1C7] hover:underline"
              >
                Submit another report
              </button>
            </div>
          )}

          {/* ── STEP: ERROR ───────────────────────────────────────── */}
          {step === 'error' && (
            <div className="text-center space-y-4 py-4">
              <p className="text-sm text-red-400">{errorMsg}</p>
              <button
                onClick={() => setStep('offense')}
                className="w-full bg-gray-800 text-gray-300 py-3 rounded-xl text-sm font-medium hover:bg-gray-700"
              >
                Try Again
              </button>
            </div>
          )}

        </div>

        <p className="text-center text-xs text-gray-600 mt-4">Sychar Copilot · Secure quick report</p>
      </div>
    </div>
  )
}
