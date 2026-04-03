'use client'

import { useState } from 'react'

interface Student {
  id: string
  full_name: string
  admission_number: string | null
}

interface ScoreRow {
  studentId: string | null
  studentName: string
  admissionNo: string | null
  score: number | ''
}

interface AiGuide {
  situation_summary?: string
  bridge_learning_plan?: Array<{
    topic: string
    root_cause: string
    strategies: string[]
    creative_activity: string
    lessons_needed: number
  }>
  aptitude_appreciation?: {
    what_worked: string
    extend_high_performers: string
    peer_tutoring: string
  }
  individual_attention?: {
    critical_below_40: string[]
    small_group_40_50: string[]
    enrichment_above_80: string[]
  }
  next_exam_prediction?: {
    predicted_average: number
    confidence: string
    rationale: string
  }
}

interface Props {
  token: string
  className: string
  subjectName: string
  students: Student[]
}

const TERMS = ['Term 1', 'Term 2', 'Term 3'] as const
const EXAM_TYPES = ['Opener', 'CAT 1', 'CAT 2', 'Mid-term', 'End-term', 'Mock', 'Trial', 'KCSE'] as const

export default function ExamPerformanceTab({ token, className, subjectName, students }: Props) {
  const [term, setTerm] = useState<string>('Term 1')
  const [examType, setExamType] = useState<string>('Opener')
  const [failedTopics, setFailedTopics] = useState('')
  const [passedTopics, setPassedTopics] = useState('')

  // Score rows — pre-populate from student list or manual entry
  const [rows, setRows] = useState<ScoreRow[]>(() =>
    students.length > 0
      ? students.map(s => ({ studentId: s.id, studentName: s.full_name, admissionNo: s.admission_number, score: '' }))
      : [{ studentId: null, studentName: '', admissionNo: null, score: '' }]
  )

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [generatingGuide, setGeneratingGuide] = useState(false)
  const [guide, setGuide] = useState<AiGuide | null>(null)
  const [shareWithHod, setShareWithHod] = useState(false)
  const [error, setError] = useState('')

  function setScore(idx: number, val: string) {
    const n = parseFloat(val)
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, score: isNaN(n) ? '' : Math.min(100, Math.max(0, n)) } : r))
  }

  function setStudentName(idx: number, val: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, studentName: val } : r))
  }

  function addRow() {
    setRows(prev => [...prev, { studentId: null, studentName: '', admissionNo: null, score: '' }])
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  const validScores = rows.filter(r => r.studentName.trim() && r.score !== '')
  const nums = validScores.map(r => r.score as number)
  const avg = nums.length > 0 ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0
  const atRisk = nums.filter(n => n < 50).length
  const excelling = nums.filter(n => n >= 75).length

  async function handleSaveScores() {
    if (validScores.length === 0) { setError('Enter at least one score'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/exam/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, className, subjectName, examType, term,
          scores: validScores.map(r => ({
            studentId: r.studentId,
            studentName: r.studentName,
            admissionNo: r.admissionNo,
            score: r.score,
          })),
        }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed'); }
      else setSaved(true)
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function handleGenerateGuide() {
    if (validScores.length === 0) { setError('Save scores first'); return }
    setGeneratingGuide(true); setError('')
    try {
      const res = await fetch('/api/exam/ai-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, className, subjectName, examType, term,
          avg, atRiskCount: atRisk, excellingCount: excelling,
          failedTopics: failedTopics.split(',').map(t => t.trim()).filter(Boolean),
          passedTopics: passedTopics.split(',').map(t => t.trim()).filter(Boolean),
          scores: validScores.map(r => ({ studentName: r.studentName, score: r.score as number })),
          shareWithHod,
        }),
      })
      const d = await res.json()
      if (!res.ok) setError(d.error ?? 'Failed to generate guide')
      else setGuide(d.guide)
    } catch { setError('Network error') }
    finally { setGeneratingGuide(false) }
  }

  return (
    <div className="space-y-5">
      {/* Exam metadata */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
          <select value={term} onChange={e => setTerm(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {TERMS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Exam Type</label>
          <div className="flex flex-wrap gap-1">
            {EXAM_TYPES.map(e => (
              <button key={e} type="button" onClick={() => setExamType(e)}
                className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors ${
                  examType === e ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'
                }`}>{e}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Topics */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Topics Students Struggled With</label>
          <input type="text" value={failedTopics} onChange={e => setFailedTopics(e.target.value)}
            placeholder="Comma-separated topics..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Topics Students Did Well</label>
          <input type="text" value={passedTopics} onChange={e => setPassedTopics(e.target.value)}
            placeholder="Comma-separated topics..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Score table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">Scores</label>
          {nums.length > 0 && (
            <span className="text-xs text-gray-500">
              Avg: <strong>{avg}%</strong> · At-risk: <strong>{atRisk}</strong> · Top: <strong>{excelling}</strong>
            </span>
          )}
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {rows.map((r, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                type="text" value={r.studentName}
                onChange={e => setStudentName(idx, e.target.value)}
                placeholder="Student name"
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                readOnly={!!r.studentId}
              />
              <input
                type="number" min={0} max={100} step={0.5}
                value={r.score === '' ? '' : r.score}
                onChange={e => setScore(idx, e.target.value)}
                placeholder="%"
                className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {!r.studentId && (
                <button type="button" onClick={() => removeRow(idx)}
                  className="text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
              )}
            </div>
          ))}
        </div>
        {students.length === 0 && (
          <button type="button" onClick={addRow}
            className="mt-2 text-sm text-blue-600 hover:underline">+ Add student</button>
        )}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {saved && !guide && <p className="text-green-600 text-sm font-medium">Scores saved! Generate AI guide below.</p>}

      {/* Actions */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <button
          type="button" onClick={handleSaveScores} disabled={saving}
          className="flex-1 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-400 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
        >
          {saving ? 'Saving...' : 'Save Scores'}
        </button>
        <button
          type="button" onClick={handleGenerateGuide} disabled={generatingGuide || validScores.length === 0}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
        >
          {generatingGuide ? 'Generating AI Guide...' : 'Generate AI Teaching Guide'}
        </button>
      </div>

      {/* Share with HOD toggle */}
      {saved && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={shareWithHod} onChange={e => setShareWithHod(e.target.checked)}
            className="w-4 h-4 accent-blue-600" />
          <span className="text-sm text-gray-700">Share guide with HOD when generated</span>
        </label>
      )}

      {/* AI Guide display */}
      {guide && (
        <div className="space-y-4 mt-2">
          <h3 className="font-semibold text-gray-800">AI Teaching Guide</h3>

          {guide.situation_summary && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800">{guide.situation_summary}</p>
            </div>
          )}

          {guide.bridge_learning_plan && guide.bridge_learning_plan.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Bridge Learning Plan</h4>
              <div className="space-y-3">
                {guide.bridge_learning_plan.map((item, i) => (
                  <div key={i} className="border border-gray-200 rounded-xl p-3 bg-white">
                    <p className="font-medium text-sm text-gray-800">{item.topic}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.root_cause}</p>
                    <ul className="mt-2 space-y-0.5">
                      {item.strategies.map((s, j) => (
                        <li key={j} className="text-xs text-gray-700 before:content-['•'] before:mr-1">{s}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-indigo-700 mt-2 italic">Activity: {item.creative_activity}</p>
                    <p className="text-xs text-gray-500 mt-1">Lessons needed: {item.lessons_needed}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {guide.aptitude_appreciation && (
            <div className="border border-green-200 rounded-xl p-4 bg-green-50 space-y-2">
              <h4 className="text-sm font-semibold text-green-800">What Worked</h4>
              <p className="text-xs text-green-700">{guide.aptitude_appreciation.what_worked}</p>
              <p className="text-xs text-green-700"><strong>Enrichment:</strong> {guide.aptitude_appreciation.extend_high_performers}</p>
              <p className="text-xs text-green-700"><strong>Peer tutoring:</strong> {guide.aptitude_appreciation.peer_tutoring}</p>
            </div>
          )}

          {guide.next_exam_prediction && (
            <div className="border border-purple-200 rounded-xl p-4 bg-purple-50">
              <h4 className="text-sm font-semibold text-purple-800 mb-1">Next Exam Prediction</h4>
              <p className="text-sm text-purple-700">
                Predicted avg: <strong>{guide.next_exam_prediction.predicted_average}%</strong>{' '}
                <span className="text-xs">({guide.next_exam_prediction.confidence} confidence)</span>
              </p>
              <p className="text-xs text-purple-600 mt-1">{guide.next_exam_prediction.rationale}</p>
            </div>
          )}

          {guide.individual_attention && (
            <div className="border border-orange-200 rounded-xl p-4 bg-orange-50">
              <h4 className="text-sm font-semibold text-orange-800 mb-2">Individual Attention</h4>
              {guide.individual_attention.critical_below_40.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-red-700 mb-1">Critical (&lt;40%)</p>
                  {guide.individual_attention.critical_below_40.map((s, i) => (
                    <p key={i} className="text-xs text-gray-700">{s}</p>
                  ))}
                </div>
              )}
              {guide.individual_attention.small_group_40_50.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-orange-700 mb-1">Small Group (40–50%)</p>
                  {guide.individual_attention.small_group_40_50.map((s, i) => (
                    <p key={i} className="text-xs text-gray-700">{s}</p>
                  ))}
                </div>
              )}
              {guide.individual_attention.enrichment_above_80.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-700 mb-1">Enrichment (&gt;80%)</p>
                  {guide.individual_attention.enrichment_above_80.map((s, i) => (
                    <p key={i} className="text-xs text-gray-700">{s}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
