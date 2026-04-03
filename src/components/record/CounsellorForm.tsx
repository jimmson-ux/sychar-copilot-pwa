'use client'

import { useState } from 'react'

interface Student {
  id: string
  full_name: string
  admission_number: string | null
}

interface Props {
  counsellorId: string
  schoolId: string
}

const WIS_LABELS = ['', 'Good', 'Mild concern', 'Moderate', 'High concern', 'Critical']
const WIS_COLORS = ['', '#22c55e', '#84cc16', '#f59e0b', '#ef4444', '#7f1d1d']

const KBI_OPTIONS = [
  'Withdrawal', 'Aggression', 'Anxiety', 'Grief', 'Academic decline',
  'Peer conflict', 'Home issues', 'Substance concern', 'Bullying',
  'Self-harm risk', 'Trauma', 'Identity', 'Other',
]

export default function CounsellorForm({ counsellorId, schoolId }: Props) {
  const [students, setStudents] = useState<Student[]>([])
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [searchingStudents, setSearchingStudents] = useState(false)

  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0])
  const [wisScore, setWisScore] = useState(1)
  const [kbiTags, setKbiTags] = useState<string[]>([])
  const [rawNotes, setRawNotes] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [isConfidential, setIsConfidential] = useState(true)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function searchStudents(q: string) {
    if (q.length < 2) { setStudents([]); return }
    setSearchingStudents(true)
    try {
      const res = await fetch(`/api/students/search?schoolId=${encodeURIComponent(schoolId)}&q=${encodeURIComponent(q)}`)
      const d = await res.json()
      setStudents(d.students ?? [])
    } catch { /* silent */ }
    finally { setSearchingStudents(false) }
  }

  function toggleTag(tag: string) {
    setKbiTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedStudent) { setError('Select a student'); return }
    setSaving(true); setError('')

    try {
      const res = await fetch('/api/welfare/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          sessionDate,
          wisScore,
          kbiTags,
          rawNotes: rawNotes.trim() || undefined,
          followUpDate: followUpDate || undefined,
          isConfidential,
        }),
      })

      const d = await res.json()
      if (!res.ok) setError(d.error ?? 'Failed to save')
      else {
        setSaved(true)
        setSelectedStudent(null); setStudentSearch('')
        setWisScore(1); setKbiTags([]); setRawNotes(''); setFollowUpDate('')
        setIsConfidential(true)
        setTimeout(() => setSaved(false), 4000)
      }
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Student *</label>
        <input
          type="text"
          value={studentSearch}
          onChange={e => { setStudentSearch(e.target.value); searchStudents(e.target.value) }}
          placeholder="Type student name..."
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        {students.length > 0 && !selectedStudent && (
          <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
            {students.map(s => (
              <button key={s.id} type="button"
                onClick={() => { setSelectedStudent(s); setStudents([]) }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 text-gray-700">
                {s.full_name}{s.admission_number ? ` (${s.admission_number})` : ''}
              </button>
            ))}
          </div>
        )}
        {selectedStudent && (
          <div className="mt-2 flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2">
            <span className="text-teal-600 text-sm font-medium">✓ {selectedStudent.full_name}</span>
            <button type="button" onClick={() => setSelectedStudent(null)} className="text-gray-400 hover:text-red-500 ml-auto text-xs">Change</button>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Session Date</label>
        <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
      </div>

      {/* WIS Score */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Welfare Intensity Score (WIS): {' '}
          <span style={{ color: WIS_COLORS[wisScore] }} className="font-bold">{wisScore} — {WIS_LABELS[wisScore]}</span>
        </label>
        <div className="flex gap-2">
          {[1,2,3,4,5].map(n => (
            <button key={n} type="button" onClick={() => setWisScore(n)}
              className="flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all"
              style={{
                borderColor: wisScore === n ? WIS_COLORS[n] : '#e5e7eb',
                background: wisScore === n ? WIS_COLORS[n] : '#fff',
                color: wisScore === n ? '#fff' : '#374151',
              }}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* KBI Tags */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Key Behaviour Indicators (KBI)</label>
        <div className="flex flex-wrap gap-2">
          {KBI_OPTIONS.map(tag => (
            <button key={tag} type="button" onClick={() => toggleTag(tag)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                kbiTags.includes(tag)
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'
              }`}>
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Raw notes — confidential */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Session Notes</label>
        <textarea value={rawNotes} onChange={e => setRawNotes(e.target.value)}
          rows={4} maxLength={3000}
          placeholder="Confidential session notes (not visible to anyone except you and the principal)..."
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Follow-up Date</label>
        <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={isConfidential} onChange={e => setIsConfidential(e.target.checked)}
          className="w-4 h-4 accent-teal-600" />
        <span className="text-sm text-gray-700">Mark as confidential (only visible to counsellor + principal)</span>
      </label>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {saved && <p className="text-teal-700 font-medium text-sm">Welfare log saved successfully.</p>}

      <button type="submit" disabled={saving}
        className="w-full py-3.5 rounded-xl text-white font-bold text-sm transition-all"
        style={{ background: saving ? '#94a3b8' : 'linear-gradient(135deg, #0C6478, #46DFB1)' }}>
        {saving ? 'Saving...' : 'Save Welfare Log'}
      </button>
    </form>
  )
}
