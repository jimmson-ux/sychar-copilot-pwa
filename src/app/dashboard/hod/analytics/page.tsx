'use client'

import { useState, useCallback } from 'react'

interface StreamData {
  stream_name: string
  teacher_name: string
  teacher_id: string
  student_count: number
  class_average: number
  grade_distribution: Record<string, number>
  rank: number
}

interface TrajectoryPoint {
  term_id: string
  term_name: string
  academic_year: string
  school_average: number
  pass_rate: number
  student_count: number
}

interface TeacherRow {
  teacher_id: string
  teacher_name: string
  subjects_taught: string[]
  streams_taught: string[]
  student_outcomes: { average_score: number; vs_dept_average: number; pass_rate: number }
  syllabus_velocity: number
  lesson_compliance: number
  overall_index: number
  flag: 'star' | 'solid' | 'watch' | 'support_needed'
}

const FLAG_ICONS: Record<string, string> = {
  star:           '⭐',
  solid:          '✓',
  watch:          '👁',
  support_needed: '🆘',
}

const FLAG_COLORS: Record<string, string> = {
  star:           'text-yellow-600 bg-yellow-50',
  solid:          'text-green-700 bg-green-50',
  watch:          'text-orange-600 bg-orange-50',
  support_needed: 'text-red-700 bg-red-50',
}

const TREND_COLORS = { improving: '#16A34A', plateauing: '#D97706', declining: '#DC2626' }

function barColor(avg: number) {
  if (avg >= 60) return 'bg-green-500'
  if (avg >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function HodAnalyticsPage() {
  const [subjectId, setSubjectId] = useState('')
  const [classLevel, setClassLevel] = useState('')
  const [term, setTerm] = useState('')

  const [streamData, setStreamData]     = useState<{ streams: StreamData[]; variance_flag: boolean; variance_percentage: number; insight: string } | null>(null)
  const [trajectory, setTrajectory]     = useState<{ trajectory: TrajectoryPoint[]; trend: string; trend_percentage: number; insight: string } | null>(null)
  const [teachers, setTeachers]         = useState<TeacherRow[]>([])
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null)

  const [loading, setLoading] = useState<Record<string, boolean>>({})

  function setLoad(key: string, val: boolean) {
    setLoading(prev => ({ ...prev, [key]: val }))
  }

  const loadStreams = useCallback(async () => {
    if (!subjectId || !classLevel || !term) return
    setLoad('streams', true)
    try {
      const r = await fetch(`/api/analytics/hod/stream-comparison?subject_id=${subjectId}&class_level=${encodeURIComponent(classLevel)}&term=${encodeURIComponent(term)}`)
      setStreamData(await r.json())
    } finally { setLoad('streams', false) }
  }, [subjectId, classLevel, term])

  const loadTrajectory = useCallback(async () => {
    if (!subjectId) return
    setLoad('trajectory', true)
    try {
      const r = await fetch(`/api/analytics/hod/subject-trajectory?subject_id=${subjectId}`)
      setTrajectory(await r.json())
    } finally { setLoad('trajectory', false) }
  }, [subjectId])

  const loadTeachers = useCallback(async () => {
    setLoad('teachers', true)
    try {
      const r = await fetch(`/api/analytics/hod/teacher-performance${term ? `?term=${encodeURIComponent(term)}` : ''}`)
      const d = await r.json()
      setTeachers(d.teachers ?? [])
    } finally { setLoad('teachers', false) }
  }, [term])

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Department Analytics</h1>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Subject ID</label>
          <input className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
            placeholder="UUID" value={subjectId} onChange={e => setSubjectId(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Class Level</label>
          <input className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
            placeholder="e.g. Form 3" value={classLevel} onChange={e => setClassLevel(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Term</label>
          <select className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
            value={term} onChange={e => setTerm(e.target.value)}>
            <option value="">All terms</option>
            <option value="Term 1">Term 1</option>
            <option value="Term 2">Term 2</option>
            <option value="Term 3">Term 3</option>
          </select>
        </div>
      </div>

      {/* ── STREAM COMPARISON ─────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Stream Comparison</h2>
          <button onClick={loadStreams} disabled={loading.streams || !subjectId || !classLevel || !term}
            className="text-sm bg-[#09D1C7] text-white px-4 py-1.5 rounded-lg disabled:opacity-40 hover:bg-teal-600 transition-colors">
            {loading.streams ? 'Loading…' : 'Load'}
          </button>
        </div>

        {streamData?.variance_flag && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
            ⚠️ {streamData.variance_percentage.toFixed(1)}% variance detected between streams
          </div>
        )}

        {streamData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {streamData.streams.map(s => (
              <div key={s.stream_name} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">{s.stream_name}</span>
                  <span className="text-xs text-gray-400">#{s.rank}</span>
                </div>
                {/* Bar */}
                <div className="h-16 flex items-end">
                  <div
                    className={`w-full rounded-t-md transition-all ${barColor(s.class_average)}`}
                    style={{ height: `${Math.min(100, s.class_average)}%` }}
                  />
                </div>
                <div className="text-center">
                  <span className="text-lg font-bold text-gray-900">{s.class_average.toFixed(1)}%</span>
                </div>
                <p className="text-xs text-gray-400 text-center truncate">{s.teacher_name}</p>
              </div>
            ))}
          </div>
        )}

        {streamData?.insight && (
          <p className="text-sm text-gray-500 italic">{streamData.insight}</p>
        )}
      </section>

      {/* ── SUBJECT TRAJECTORY ────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Subject Trajectory</h2>
          <div className="flex items-center gap-2">
            {trajectory && (
              <span className={`text-xs font-semibold px-2 py-1 rounded-full`} style={{
                background: TREND_COLORS[trajectory.trend as keyof typeof TREND_COLORS] + '20',
                color:      TREND_COLORS[trajectory.trend as keyof typeof TREND_COLORS],
              }}>
                {trajectory.trend === 'improving' ? '↑' : trajectory.trend === 'declining' ? '↓' : '→'}{' '}
                {trajectory.trend} {trajectory.trend_percentage > 0 ? '+' : ''}{trajectory.trend_percentage.toFixed(1)}%
              </span>
            )}
            <button onClick={loadTrajectory} disabled={loading.trajectory || !subjectId}
              className="text-sm bg-[#09D1C7] text-white px-4 py-1.5 rounded-lg disabled:opacity-40 hover:bg-teal-600 transition-colors">
              {loading.trajectory ? 'Loading…' : 'Load'}
            </button>
          </div>
        </div>

        {loading.trajectory && <div className="animate-pulse bg-gray-100 rounded-xl h-40" />}

        {trajectory?.trajectory && trajectory.trajectory.length > 0 && (
          <div className="overflow-x-auto">
            <div className="flex items-end gap-2 min-w-max h-40 px-2">
              {trajectory.trajectory.map((point, i) => {
                const trend = trajectory.trend as keyof typeof TREND_COLORS
                const color = TREND_COLORS[trend] ?? '#6B7280'
                const h = `${Math.round(point.school_average)}%`
                return (
                  <div key={i} className="flex flex-col items-center gap-1" style={{ minWidth: 56 }}>
                    <span className="text-xs font-semibold" style={{ color }}>{point.school_average.toFixed(1)}</span>
                    <div className="w-10 rounded-t-md" style={{ height: h, background: color + 'CC' }} />
                    <span className="text-xs text-gray-400 text-center leading-tight">{point.term_name}</span>
                    <span className="text-xs text-gray-300">{point.academic_year}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {trajectory?.insight && (
          <p className="text-sm text-gray-500 italic">{trajectory.insight}</p>
        )}
      </section>

      {/* ── TEACHER PERFORMANCE ───────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Teacher Performance</h2>
          <button onClick={loadTeachers} disabled={loading.teachers}
            className="text-sm bg-[#09D1C7] text-white px-4 py-1.5 rounded-lg disabled:opacity-40 hover:bg-teal-600 transition-colors">
            {loading.teachers ? 'Loading…' : 'Load'}
          </button>
        </div>

        {loading.teachers && <div className="animate-pulse bg-gray-100 rounded-xl h-32" />}

        {teachers.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-medium text-gray-400 uppercase">
                  <th className="text-left py-2 pr-4">Teacher</th>
                  <th className="text-right py-2 px-3">Outcomes</th>
                  <th className="text-right py-2 px-3">Velocity</th>
                  <th className="text-right py-2 px-3">Compliance</th>
                  <th className="text-right py-2 px-3">Index</th>
                  <th className="text-center py-2 px-3">Flag</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map(t => (
                  <>
                    <tr
                      key={t.teacher_id}
                      onClick={() => setExpandedTeacher(expandedTeacher === t.teacher_id ? null : t.teacher_id)}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 pr-4">
                        <span className="font-medium text-gray-800">{t.teacher_name}</span>
                        <p className="text-xs text-gray-400 truncate max-w-[160px]">{t.subjects_taught.join(', ')}</p>
                      </td>
                      <td className="text-right py-2.5 px-3 text-gray-700">{t.student_outcomes.average_score.toFixed(1)}%</td>
                      <td className="text-right py-2.5 px-3 text-gray-700">{t.syllabus_velocity.toFixed(0)}%</td>
                      <td className="text-right py-2.5 px-3 text-gray-700">{t.lesson_compliance.toFixed(0)}%</td>
                      <td className="text-right py-2.5 px-3 font-semibold text-gray-900">{t.overall_index.toFixed(1)}</td>
                      <td className="text-center py-2.5 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FLAG_COLORS[t.flag]}`}>
                          {FLAG_ICONS[t.flag]} {t.flag.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                    {expandedTeacher === t.teacher_id && (
                      <tr key={`${t.teacher_id}-exp`}>
                        <td colSpan={6} className="bg-gray-50 px-4 py-3 text-xs text-gray-500">
                          <div className="flex gap-6">
                            <span>Pass rate: <strong>{t.student_outcomes.pass_rate.toFixed(1)}%</strong></span>
                            <span>Vs dept: <strong className={t.student_outcomes.vs_dept_average >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {t.student_outcomes.vs_dept_average >= 0 ? '+' : ''}{t.student_outcomes.vs_dept_average.toFixed(1)}%
                            </strong></span>
                            <span>Streams: <strong>{t.streams_taught.join(', ') || '—'}</strong></span>
                          </div>
                          <button className="mt-2 text-[#09D1C7] hover:underline font-medium">
                            Schedule observation →
                          </button>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
