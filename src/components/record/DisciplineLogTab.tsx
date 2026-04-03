'use client'

import { useState, useEffect } from 'react'

interface Student {
  id: string
  full_name: string
  admission_number: string | null
  gender: string | null
}

interface Props {
  token: string
  className: string
}

const OFFENCES = ['Late', 'Uniform', 'Disruption', 'Absenteeism', 'Insubordination', 'Fighting', 'Cheating', 'Disrespect', 'Other'] as const
const SEVERITIES = ['Minor', 'Moderate', 'Serious', 'Critical'] as const

const SEVERITY_COLORS: Record<string, string> = {
  Minor:    'bg-yellow-100 text-yellow-800 border-yellow-300',
  Moderate: 'bg-orange-100 text-orange-800 border-orange-300',
  Serious:  'bg-red-100 text-red-800 border-red-300',
  Critical: 'bg-red-600 text-white border-red-700',
}

export default function DisciplineLogTab({ token, className }: Props) {
  const [students, setStudents] = useState<Student[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [offence, setOffence] = useState<string>('Late')
  const [severity, setSeverity] = useState<string>('Minor')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ patternAlert: boolean; recentCount: number; parentAlerted: boolean } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!className) return
    setLoadingStudents(true)
    fetch(`/api/teacher/students?token=${encodeURIComponent(token)}&className=${encodeURIComponent(className)}`)
      .then(r => r.json())
      .then(d => {
        setStudents(d.students ?? [])
        setLoadingStudents(false)
      })
      .catch(() => setLoadingStudents(false))
  }, [token, className])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedStudentId) { setError('Please select a student'); return }
    setSaving(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/discipline/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, studentId: selectedStudentId,
          className, offenceType: offence, severity,
          notes: notes.trim() || undefined, date,
        }),
      })

      const d = await res.json()
      if (!res.ok) {
        setError(d.error ?? 'Failed to save')
      } else {
        setResult(d)
        setSelectedStudentId('')
        setOffence('Late')
        setSeverity('Minor')
        setNotes('')
        setDate(new Date().toISOString().split('T')[0])
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Student selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Student *</label>
        {loadingStudents ? (
          <p className="text-sm text-gray-500">Loading students...</p>
        ) : (
          <select
            value={selectedStudentId}
            onChange={e => setSelectedStudentId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Select student —</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>
                {s.full_name}{s.admission_number ? ` (${s.admission_number})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Offence chips */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Offence Type</label>
        <div className="flex flex-wrap gap-2">
          {OFFENCES.map(o => (
            <button
              key={o} type="button"
              onClick={() => setOffence(o)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                offence === o
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* Severity chips */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Severity</label>
        <div className="flex flex-wrap gap-2">
          {SEVERITIES.map(s => (
            <button
              key={s} type="button"
              onClick={() => setSeverity(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                severity === s
                  ? SEVERITY_COLORS[s]
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {(severity === 'Serious' || severity === 'Critical') && (
          <p className="mt-2 text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-2">
            Parent will be notified via WhatsApp automatically.
          </p>
        )}
      </div>

      {/* Date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Incident Date</label>
        <input
          type="date" value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          rows={3} maxLength={300}
          placeholder="Describe what happened..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {result && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-1">
          <p className="text-green-800 font-medium text-sm">Record saved!</p>
          {result.patternAlert && (
            <p className="text-orange-700 text-sm font-medium">
              ⚠️ Pattern alert: this student has {result.recentCount} incidents this week.
            </p>
          )}
          {result.parentAlerted && (
            <p className="text-blue-700 text-sm">Parent notified via WhatsApp.</p>
          )}
        </div>
      )}

      <button
        type="submit" disabled={saving}
        className="w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition-colors"
      >
        {saving ? 'Saving...' : 'Log Incident'}
      </button>
    </form>
  )
}
