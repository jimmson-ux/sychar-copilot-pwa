'use client'

import { useState } from 'react'

interface DropAlert {
  student_id: string
  virtual_qr_id: string
  current_score: number
  previous_score: number
  delta: number
  previous_exam_type: string
  previous_term: string
  severity: 'mild' | 'moderate' | 'severe'
  suggested_action: string
}

interface TopicAnalysis {
  topic_tag: string
  question_number: number
  marks_possible: number
  class_average_percentage: number
  failure_rate: number
  students_failed: number
  students_passed: number
  severity: 'critical' | 'needs_attention' | 'good'
  revision_priority: number
}

interface QuestionSetup {
  question_number: number
  topic_tag: string
  marks_possible: number
}

const SEVERITY_COLORS = {
  mild:     'bg-amber-100 text-amber-800 border-amber-300',
  moderate: 'bg-orange-100 text-orange-800 border-orange-300',
  severe:   'bg-red-100 text-red-800 border-red-300',
}

const TOPIC_COLORS = {
  critical:        { bar: 'bg-red-500',   badge: 'bg-red-100 text-red-700' },
  needs_attention: { bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  good:            { bar: 'bg-green-500', badge: 'bg-green-100 text-green-700' },
}

export default function TeacherAnalyticsPage() {
  const [subjectId, setSubjectId]   = useState('')
  const [classId, setClassId]       = useState('')
  const [term, setTerm]             = useState('')
  const [examType, setExamType]     = useState('')
  const [activeTab, setActiveTab]   = useState<'drops' | 'topics' | 'entry'>('drops')

  const [dropAlerts, setDropAlerts]     = useState<DropAlert[]>([])
  const [topicData, setTopicData]       = useState<TopicAnalysis[]>([])
  const [loadingDrops, setLoadingDrops] = useState(false)
  const [loadingTopics, setLoadingTopics] = useState(false)

  // Enhanced marks entry state
  const [questions, setQuestions]       = useState<QuestionSetup[]>([{ question_number: 1, topic_tag: '', marks_possible: 10 }])
  const [submitResult, setSubmitResult] = useState<{ marks_saved: number; drop_alerts_found: number; topic_gaps_detected: { topic_tag: string; failure_rate: number }[] } | null>(null)
  const [submitting, setSubmitting]     = useState(false)

  async function loadDropAlerts() {
    if (!subjectId || !classId || !term) return
    setLoadingDrops(true)
    try {
      const r = await fetch(`/api/analytics/teacher/drop-alerts?subject_id=${subjectId}&class_id=${classId}&term=${encodeURIComponent(term)}`)
      const d = await r.json()
      setDropAlerts(d.drop_alerts ?? [])
    } finally {
      setLoadingDrops(false)
    }
  }

  async function loadTopics() {
    if (!subjectId || !classId || !term) return
    setLoadingTopics(true)
    try {
      const r = await fetch(`/api/analytics/teacher/topic-failure-rates?subject_id=${subjectId}&class_id=${classId}&term=${encodeURIComponent(term)}&exam_type=${encodeURIComponent(examType)}`)
      const d = await r.json()
      setTopicData(d.topic_analysis ?? [])
    } finally {
      setLoadingTopics(false)
    }
  }

  async function submitMarks(e: React.FormEvent) {
    e.preventDefault()
    if (!subjectId || !classId || !term) return
    setSubmitting(true)
    try {
      const r = await fetch('/api/analytics/teacher/marks-with-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_id: subjectId,
          class_id: classId,
          term,
          exam_type: examType || 'CAT',
          curriculum_type: '844',
          question_setup: questions,
          student_marks: [],
        }),
      })
      const d = await r.json()
      setSubmitResult(d)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Performance Analytics</h1>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Subject ID</label>
          <input
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
            placeholder="subject UUID"
            value={subjectId}
            onChange={e => setSubjectId(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Class ID</label>
          <input
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
            placeholder="class UUID"
            value={classId}
            onChange={e => setClassId(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Term</label>
          <select
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
            value={term}
            onChange={e => setTerm(e.target.value)}
          >
            <option value="">Select term</option>
            <option value="Term 1">Term 1</option>
            <option value="Term 2">Term 2</option>
            <option value="Term 3">Term 3</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Exam Type</label>
          <select
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
            value={examType}
            onChange={e => setExamType(e.target.value)}
          >
            <option value="">All exams</option>
            <option value="CAT1">CAT 1</option>
            <option value="CAT2">CAT 2</option>
            <option value="MidTerm">Mid-Term</option>
            <option value="EndTerm">End-Term</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-xl overflow-hidden">
        {(['drops', 'topics', 'entry'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-[#09D1C7] text-[#09D1C7] bg-[#f0fdfa]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'drops' ? 'Drop Alerts' : tab === 'topics' ? 'Topic Failures' : 'Enter Marks'}
          </button>
        ))}
      </div>

      {/* DROP ALERTS TAB */}
      {activeTab === 'drops' && (
        <div className="space-y-3">
          <button
            onClick={loadDropAlerts}
            disabled={loadingDrops || !subjectId || !classId || !term}
            className="bg-[#09D1C7] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-teal-600 transition-colors"
          >
            {loadingDrops ? 'Loading…' : 'Load Drop Alerts'}
          </button>

          {dropAlerts.length === 0 && !loadingDrops && (
            <p className="text-gray-400 text-sm py-8 text-center">No drop alerts. Fill in the filters above and click Load.</p>
          )}

          {loadingDrops && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-24" />
              ))}
            </div>
          )}

          {dropAlerts.map(alert => (
            <div
              key={alert.student_id}
              className={`bg-white rounded-xl border-l-4 p-4 flex flex-col md:flex-row md:items-center gap-3 shadow-sm ${
                alert.severity === 'severe'   ? 'border-red-500' :
                alert.severity === 'moderate' ? 'border-orange-500' :
                                                'border-amber-400'
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-gray-400">{alert.virtual_qr_id}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SEVERITY_COLORS[alert.severity]}`}>
                    {alert.severity.toUpperCase()}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-sm">
                  <span className="text-gray-500">
                    {alert.previous_term} ({alert.previous_exam_type}): <strong>{alert.previous_score.toFixed(1)}%</strong>
                  </span>
                  <span className="text-gray-400">→</span>
                  <span>
                    Now: <strong>{alert.current_score.toFixed(1)}%</strong>
                  </span>
                  <span className="font-bold text-red-600">{alert.delta.toFixed(1)}%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{alert.suggested_action}</p>
              </div>
              <button className={`shrink-0 text-xs font-medium px-3 py-2 rounded-lg ${
                alert.severity === 'severe'
                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                  : alert.severity === 'moderate'
                  ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}>
                {alert.severity === 'severe'   ? 'Contact Parent + G&C' :
                 alert.severity === 'moderate' ? 'Schedule Check-in'    :
                                                 'Add to Watch List'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* TOPIC FAILURES TAB */}
      {activeTab === 'topics' && (
        <div className="space-y-3">
          <button
            onClick={loadTopics}
            disabled={loadingTopics || !subjectId || !classId || !term}
            className="bg-[#09D1C7] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-teal-600 transition-colors"
          >
            {loadingTopics ? 'Loading…' : 'Analyse Topics'}
          </button>

          {loadingTopics && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-16" />)}
            </div>
          )}

          {topicData.length === 0 && !loadingTopics && (
            <p className="text-gray-400 text-sm py-8 text-center">
              No topic data yet. Use the enhanced marks entry to tag questions by topic.
            </p>
          )}

          {topicData.map(topic => {
            const colors = TOPIC_COLORS[topic.severity]
            return (
              <div key={topic.topic_tag} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 text-sm">{topic.topic_tag}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                      {topic.severity === 'critical' ? 'Critical' :
                       topic.severity === 'needs_attention' ? 'Needs Attention' : 'Good'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">Q{topic.question_number} · /{topic.marks_possible} marks</span>
                </div>
                {/* Heatbar */}
                <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${colors.bar}`}
                    style={{ width: `${Math.min(100, topic.failure_rate)}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white mix-blend-difference">
                    {topic.failure_rate.toFixed(1)}% failed
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                  <span>Class avg: {topic.class_average_percentage.toFixed(1)}%</span>
                  <span>{topic.students_failed} failed · {topic.students_passed} passed</span>
                  {topic.severity === 'critical' && (
                    <button className="text-red-600 font-medium hover:underline">Plan revision</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ENHANCED MARKS ENTRY TAB */}
      {activeTab === 'entry' && (
        <form onSubmit={submitMarks} className="space-y-4 bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-800">Question Setup</h2>
          <p className="text-xs text-gray-400">Define each question, its topic, and max marks. Then submit to save.</p>

          <div className="space-y-2">
            {questions.map((q, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <span className="col-span-1 text-xs text-gray-400 text-center">Q{q.question_number}</span>
                <input
                  className="col-span-6 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
                  placeholder="Topic (e.g. Algebra)"
                  value={q.topic_tag}
                  onChange={e => {
                    const updated = [...questions]
                    updated[i] = { ...updated[i], topic_tag: e.target.value }
                    setQuestions(updated)
                  }}
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="col-span-3 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
                  placeholder="Marks"
                  value={q.marks_possible}
                  onChange={e => {
                    const updated = [...questions]
                    updated[i] = { ...updated[i], marks_possible: Number(e.target.value) }
                    setQuestions(updated)
                  }}
                />
                <button
                  type="button"
                  onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
                  className="col-span-2 text-red-400 hover:text-red-600 text-xs"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setQuestions([...questions, { question_number: questions.length + 1, topic_tag: '', marks_possible: 10 }])}
              className="text-sm text-[#09D1C7] hover:underline font-medium"
            >
              + Add question
            </button>
            <span className="text-gray-300">|</span>
            <span className="text-xs text-gray-400 self-center">
              Total marks: {questions.reduce((s, q) => s + q.marks_possible, 0)}
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting || !subjectId || !classId || !term}
            className="w-full bg-[#09D1C7] text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-teal-600 transition-colors"
          >
            {submitting ? 'Saving…' : 'Save Marks + Analyse'}
          </button>

          {submitResult && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
              <p className="text-sm font-medium text-green-800">
                {submitResult.marks_saved} mark(s) saved
              </p>
              {submitResult.drop_alerts_found > 0 && (
                <p className="text-sm text-red-700 font-medium">
                  {submitResult.drop_alerts_found} severe drop alert(s) detected
                </p>
              )}
              {submitResult.topic_gaps_detected?.map(g => (
                <p key={g.topic_tag} className="text-xs text-amber-700">
                  Topic gap: {g.topic_tag} — {g.failure_rate.toFixed(1)}% failure rate
                </p>
              ))}
            </div>
          )}
        </form>
      )}
    </div>
  )
}
