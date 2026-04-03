'use client'

import { useState } from 'react'
import { CurriculumLabels } from '@/lib/curriculumConfig'

interface WeekEntry {
  week: number
  topic: string
  subTopic: string
  objectives: string
  activities: string
  resources: string
  assessment: string
  remarks: string
}

interface Props {
  token: string
  className: string
  subjectName: string
  labels: CurriculumLabels
  curriculumType: '844' | 'CBC'
}

const TERMS = ['Term 1', 'Term 2', 'Term 3'] as const

function emptyEntry(week: number): WeekEntry {
  return { week, topic: '', subTopic: '', objectives: '', activities: '', resources: '', assessment: '', remarks: '' }
}

export default function SchemeOfWorkTab({ token, className, subjectName, labels, curriculumType }: Props) {
  const [term, setTerm] = useState<string>('Term 1')
  const [year, setYear] = useState(new Date().getFullYear())
  const [entries, setEntries] = useState<WeekEntry[]>(() =>
    Array.from({ length: 13 }, (_, i) => emptyEntry(i + 1))
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [expandedWeek, setExpandedWeek] = useState<number | null>(1)

  function updateEntry(week: number, field: keyof WeekEntry, value: string) {
    setEntries(prev => prev.map(e => e.week === week ? { ...e, [field]: value } : e))
  }

  function addWeek() {
    const maxWeek = entries.length > 0 ? Math.max(...entries.map(e => e.week)) : 0
    setEntries(prev => [...prev, emptyEntry(maxWeek + 1)])
    setExpandedWeek(maxWeek + 1)
  }

  function removeWeek(week: number) {
    setEntries(prev => prev.filter(e => e.week !== week))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const filledEntries = entries.filter(e => e.topic.trim())
    if (filledEntries.length === 0) { setError('Add at least one topic'); return }
    setSaving(true); setError('')

    try {
      const res = await fetch('/api/scheme-of-work/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, className, subjectName, term, year,
          curriculumType,
          entries: filledEntries.map(e => ({
            week: e.week,
            topic: e.topic.trim(),
            subTopic: e.subTopic.trim() || undefined,
            objectives: e.objectives.trim() || undefined,
            activities: e.activities.trim() || undefined,
            resources: e.resources.trim() || undefined,
            assessment: e.assessment.trim() || undefined,
            remarks: e.remarks.trim() || undefined,
          })),
        }),
      })

      const d = await res.json()
      if (!res.ok) setError(d.error ?? 'Failed to save')
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 4000)
      }
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Term + Year */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
          <select value={term} onChange={e => setTerm(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {TERMS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
          <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))}
            min={2020} max={2040}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Week entries (accordion) */}
      <div className="space-y-2">
        {entries.map(entry => (
          <div key={entry.week} className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Week header */}
            <button
              type="button"
              onClick={() => setExpandedWeek(expandedWeek === entry.week ? null : entry.week)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
            >
              <span className="text-sm font-medium text-gray-700">
                Week {entry.week}
                {entry.topic && <span className="text-gray-500 font-normal ml-2">— {entry.topic}</span>}
              </span>
              <span className="text-gray-400 text-lg">{expandedWeek === entry.week ? '▲' : '▼'}</span>
            </button>

            {expandedWeek === entry.week && (
              <div className="px-4 py-4 space-y-3 bg-white">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{labels.topic} *</label>
                    <input type="text" value={entry.topic}
                      onChange={e => updateEntry(entry.week, 'topic', e.target.value)}
                      placeholder={`Enter ${labels.topic.toLowerCase()}...`} maxLength={200}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{labels.subTopic}</label>
                    <input type="text" value={entry.subTopic}
                      onChange={e => updateEntry(entry.week, 'subTopic', e.target.value)}
                      placeholder={`${labels.subTopic}...`} maxLength={200}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{labels.objectives}</label>
                  <textarea value={entry.objectives}
                    onChange={e => updateEntry(entry.week, 'objectives', e.target.value)}
                    rows={2} maxLength={500} placeholder={`${labels.objectives}...`}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{labels.activities}</label>
                  <textarea value={entry.activities}
                    onChange={e => updateEntry(entry.week, 'activities', e.target.value)}
                    rows={2} maxLength={500} placeholder={`${labels.activities}...`}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Resources</label>
                    <input type="text" value={entry.resources}
                      onChange={e => updateEntry(entry.week, 'resources', e.target.value)}
                      placeholder="Textbook, chart..." maxLength={300}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Assessment</label>
                    <input type="text" value={entry.assessment}
                      onChange={e => updateEntry(entry.week, 'assessment', e.target.value)}
                      placeholder="CAT, observation..." maxLength={300}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
                  <input type="text" value={entry.remarks}
                    onChange={e => updateEntry(entry.week, 'remarks', e.target.value)}
                    placeholder="Any notes..." maxLength={300}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button type="button" onClick={() => removeWeek(entry.week)}
                  className="text-xs text-red-500 hover:text-red-700">Remove this week</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={addWeek}
        className="w-full border-2 border-dashed border-gray-300 hover:border-blue-400 text-gray-500 hover:text-blue-600 py-2 rounded-xl text-sm transition-colors">
        + Add Week
      </button>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {saved && <p className="text-green-600 text-sm font-medium">Scheme of work saved successfully!</p>}

      <button type="submit" disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl transition-colors">
        {saving ? 'Saving...' : 'Save Scheme of Work'}
      </button>
    </form>
  )
}
