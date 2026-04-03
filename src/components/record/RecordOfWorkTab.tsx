'use client'

import { useState } from 'react'
import { CurriculumLabels } from '@/lib/curriculumConfig'

interface Props {
  token: string
  className: string
  subjectName: string
  labels: CurriculumLabels
}

const TERMS = ['Term 1', 'Term 2', 'Term 3'] as const
const STATUS_OPTIONS = ['Taught', 'Partially taught', 'Not taught', 'Carried forward'] as const

export default function RecordOfWorkTab({ token, className, subjectName, labels }: Props) {
  const [term, setTerm] = useState<string>('Term 1')
  const [week, setWeek] = useState('')
  const [topic, setTopic] = useState('')
  const [subTopic, setSubTopic] = useState('')
  const [objectives, setObjectives] = useState('')
  const [activities, setActivities] = useState('')
  const [resources, setResources] = useState('')
  const [assessment, setAssessment] = useState('')
  const [status, setStatus] = useState<string>('Taught')
  const [kcseReadiness, setKcseReadiness] = useState(50)
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim()) { setError('Topic is required'); return }
    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/record-of-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, className, subjectName, term,
          week: week ? parseInt(week) : undefined,
          topic: topic.trim(),
          subTopic: subTopic.trim() || undefined,
          objectives: objectives.trim() || undefined,
          activities: activities.trim() || undefined,
          resources: resources.trim() || undefined,
          assessment: assessment || undefined,
          status,
          kcseReadiness,
          remarks: remarks.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed to save')
      } else {
        setSaved(true)
        // Reset form
        setTopic(''); setSubTopic(''); setObjectives(''); setActivities('')
        setResources(''); setAssessment(''); setRemarks(''); setWeek('')
        setStatus('Taught'); setKcseReadiness(50)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Term + Week */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
          <select
            value={term}
            onChange={e => setTerm(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TERMS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Week</label>
          <input
            type="number" min={1} max={52} value={week}
            onChange={e => setWeek(e.target.value)}
            placeholder="e.g. 3"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Topic */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{labels.topic} *</label>
        <input
          type="text" value={topic} onChange={e => setTopic(e.target.value)}
          placeholder={`Enter ${labels.topic.toLowerCase()}...`}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={200}
        />
      </div>

      {/* Sub-topic */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{labels.subTopic}</label>
        <input
          type="text" value={subTopic} onChange={e => setSubTopic(e.target.value)}
          placeholder={`Enter ${labels.subTopic.toLowerCase()}...`}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={200}
        />
      </div>

      {/* Objectives */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{labels.objectives}</label>
        <textarea
          value={objectives} onChange={e => setObjectives(e.target.value)}
          rows={2}
          placeholder={`Enter ${labels.objectives.toLowerCase()}...`}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          maxLength={500}
        />
      </div>

      {/* Activities */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{labels.activities}</label>
        <textarea
          value={activities} onChange={e => setActivities(e.target.value)}
          rows={2}
          placeholder={`Describe ${labels.activities.toLowerCase()}...`}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          maxLength={500}
        />
      </div>

      {/* Resources */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Resources / Materials</label>
        <input
          type="text" value={resources} onChange={e => setResources(e.target.value)}
          placeholder="Textbook, chart, model..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={300}
        />
      </div>

      {/* Assessment type chips */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Assessment</label>
        <div className="flex flex-wrap gap-2">
          {labels.assessmentTypes.map(a => (
            <button
              key={a} type="button"
              onClick={() => setAssessment(assessment === a ? '' : a)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                assessment === a
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Status chips */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Lesson Status</label>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s} type="button"
              onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                status === s
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* KCSE/KJSEA Readiness slider */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {labels.readinessLabel}: {kcseReadiness}%
        </label>
        <input
          type="range" min={0} max={100} step={5}
          value={kcseReadiness}
          onChange={e => setKcseReadiness(parseInt(e.target.value))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0%</span><span>50%</span><span>100%</span>
        </div>
      </div>

      {/* Remarks */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
        <textarea
          value={remarks} onChange={e => setRemarks(e.target.value)}
          rows={2}
          placeholder="Any observations or notes..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          maxLength={300}
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {saved && <p className="text-green-600 text-sm font-medium">Record saved successfully!</p>}

      <button
        type="submit" disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl transition-colors"
      >
        {saving ? 'Saving...' : 'Save Record of Work'}
      </button>
    </form>
  )
}
