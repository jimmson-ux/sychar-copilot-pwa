'use client'

import { useState, useCallback } from 'react'

interface AtRiskStudent {
  student_id: string
  student_name: string
  admission_number: string
  class_name: string
  stream_name: string
  risk_level: 'medium' | 'high' | 'critical'
  subjects_dropped_count: number
  mean_delta: number
  gc_flag: boolean
  dropped_subjects: { subject_name: string; delta: number; current_score: number }[]
  intervention_count: number
}

interface ValueAddBucket {
  category: 'high_value_add' | 'moderate' | 'neutral' | 'regression'
  count: number
  percentage: number
  avg_delta: number
}

interface ValueAddResponse {
  buckets: ValueAddBucket[]
  total_students: number
  avg_value_add: number
  insight: string
}

const RISK_STYLES: Record<string, string> = {
  medium:   'bg-amber-100 text-amber-800 border border-amber-200',
  high:     'bg-orange-100 text-orange-800 border border-orange-200',
  critical: 'bg-red-100 text-red-700 border border-red-200',
}

const BUCKET_COLORS: Record<string, string> = {
  high_value_add: '#16A34A',
  moderate:       '#2563EB',
  neutral:        '#6B7280',
  regression:     '#DC2626',
}

const BUCKET_LABELS: Record<string, string> = {
  high_value_add: 'High Value-Add (>+15%)',
  moderate:       'Moderate (+5–15%)',
  neutral:        'Neutral (−5 to +5%)',
  regression:     'Regression (<−5%)',
}

type SortKey = 'risk_level' | 'subjects_dropped_count' | 'mean_delta'

const RISK_ORDER = { critical: 0, high: 1, medium: 2 }

export default function DeputyAcademicAnalyticsPage() {
  const [classFilter, setClassFilter]       = useState('')
  const [streamFilter, setStreamFilter]     = useState('')
  const [riskFilter, setRiskFilter]         = useState<'' | 'medium' | 'high' | 'critical'>('')
  const [sortKey, setSortKey]               = useState<SortKey>('risk_level')
  const [sortAsc, setSortAsc]               = useState(true)

  const [rosterData, setRosterData]         = useState<{ students: AtRiskStudent[]; summary: { total: number; critical: number; gc_count: number } } | null>(null)
  const [valueAddData, setValueAddData]     = useState<ValueAddResponse | null>(null)
  const [expandedRow, setExpandedRow]       = useState<string | null>(null)

  const [loading, setLoading]               = useState<Record<string, boolean>>({})
  const [assigningGC, setAssigningGC]       = useState<string | null>(null)

  function setLoad(key: string, val: boolean) {
    setLoading(prev => ({ ...prev, [key]: val }))
  }

  const loadRoster = useCallback(async () => {
    setLoad('roster', true)
    try {
      const params = new URLSearchParams()
      if (classFilter)  params.set('class_name',   classFilter)
      if (streamFilter) params.set('stream_name',  streamFilter)
      if (riskFilter)   params.set('risk_level',   riskFilter)
      const r = await fetch(`/api/analytics/deputy/at-risk-roster?${params}`)
      setRosterData(await r.json())
    } finally { setLoad('roster', false) }
  }, [classFilter, streamFilter, riskFilter])

  const loadValueAdd = useCallback(async () => {
    setLoad('valueadd', true)
    try {
      const params = new URLSearchParams()
      if (classFilter) params.set('class_name', classFilter)
      const r = await fetch(`/api/analytics/deputy/value-add-tracking?${params}`)
      setValueAddData(await r.json())
    } finally { setLoad('valueadd', false) }
  }, [classFilter])

  async function handleAssignGC(studentId: string) {
    setAssigningGC(studentId)
    try {
      await fetch('/api/welfare/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, type: 'counseling_referral', note: 'Auto-referred: academic at-risk flag' }),
      })
      // Refresh roster to show updated GC flag
      await loadRoster()
    } finally { setAssigningGC(null) }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  const filteredStudents = (rosterData?.students ?? []).slice().sort((a, b) => {
    let cmp = 0
    if (sortKey === 'risk_level')             cmp = RISK_ORDER[a.risk_level] - RISK_ORDER[b.risk_level]
    else if (sortKey === 'subjects_dropped_count') cmp = b.subjects_dropped_count - a.subjects_dropped_count
    else if (sortKey === 'mean_delta')        cmp = a.mean_delta - b.mean_delta
    return sortAsc ? cmp : -cmp
  })

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-[#09D1C7] ml-1">{sortAsc ? '↑' : '↓'}</span>
  }

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Deputy Academic — Analytics</h1>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Class</label>
          <input
            className="mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
            placeholder="Form 4" value={classFilter} onChange={e => setClassFilter(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Stream</label>
          <input
            className="mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
            placeholder="East" value={streamFilter} onChange={e => setStreamFilter(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Risk Level</label>
          <select
            className="mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
            value={riskFilter} onChange={e => setRiskFilter(e.target.value as typeof riskFilter)}>
            <option value="">All</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => { loadRoster(); loadValueAdd() }}
            className="bg-[#09D1C7] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors">
            Load Analytics
          </button>
          <button
            onClick={() => window.print()}
            className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Export PDF
          </button>
        </div>
      </div>

      {/* ── AT-RISK ROSTER ───────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">At-Risk Roster</h2>
          {rosterData && (
            <div className="flex gap-3 text-xs">
              <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                {rosterData.summary.total} at risk
              </span>
              <span className="bg-red-50 text-red-700 px-2 py-1 rounded-full">
                {rosterData.summary.critical} critical
              </span>
              <span className="bg-teal-50 text-teal-700 px-2 py-1 rounded-full">
                {rosterData.summary.gc_count} in G&amp;C
              </span>
            </div>
          )}
        </div>

        {loading.roster && <div className="animate-pulse bg-gray-100 rounded-xl h-40" />}

        {filteredStudents.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-medium text-gray-400 uppercase">
                  <th className="text-left py-2 pr-4">Student</th>
                  <th className="text-left py-2 pr-4">Class</th>
                  <th
                    className="text-center py-2 px-3 cursor-pointer select-none hover:text-gray-600"
                    onClick={() => handleSort('risk_level')}>
                    Risk <SortIcon k="risk_level" />
                  </th>
                  <th
                    className="text-right py-2 px-3 cursor-pointer select-none hover:text-gray-600"
                    onClick={() => handleSort('subjects_dropped_count')}>
                    Subj. Dropped <SortIcon k="subjects_dropped_count" />
                  </th>
                  <th
                    className="text-right py-2 px-3 cursor-pointer select-none hover:text-gray-600"
                    onClick={() => handleSort('mean_delta')}>
                    Mean Δ <SortIcon k="mean_delta" />
                  </th>
                  <th className="text-center py-2 px-3">G&amp;C</th>
                  <th className="text-right py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map(s => (
                  <>
                    <tr
                      key={s.student_id}
                      onClick={() => setExpandedRow(expandedRow === s.student_id ? null : s.student_id)}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 pr-4">
                        <span className="font-medium text-gray-800">{s.student_name}</span>
                        <p className="text-xs text-gray-400">{s.admission_number}</p>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600 text-xs">
                        {s.class_name} {s.stream_name}
                      </td>
                      <td className="text-center py-2.5 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_STYLES[s.risk_level]}`}>
                          {s.risk_level}
                        </span>
                      </td>
                      <td className="text-right py-2.5 px-3 text-gray-700">{s.subjects_dropped_count}</td>
                      <td className={`text-right py-2.5 px-3 font-semibold ${s.mean_delta < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {s.mean_delta >= 0 ? '+' : ''}{s.mean_delta.toFixed(1)}%
                      </td>
                      <td className="text-center py-2.5 px-3">
                        {s.gc_flag ? (
                          <span title="In G&C" className="text-[#09D1C7] text-base">⚑</span>
                        ) : (
                          <span className="text-gray-200 text-base">⚑</span>
                        )}
                      </td>
                      <td className="text-right py-2.5 px-3">
                        <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          <a
                            href={`/dashboard/students/${s.student_id}`}
                            className="text-xs text-[#09D1C7] hover:underline whitespace-nowrap">
                            Profile
                          </a>
                          {!s.gc_flag && (
                            <button
                              onClick={() => handleAssignGC(s.student_id)}
                              disabled={assigningGC === s.student_id}
                              className="text-xs text-gray-400 hover:text-teal-600 disabled:opacity-40 whitespace-nowrap ml-2">
                              {assigningGC === s.student_id ? '…' : 'G&C →'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expandedRow === s.student_id && (
                      <tr key={`${s.student_id}-exp`}>
                        <td colSpan={7} className="bg-gray-50 px-4 py-3">
                          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Dropped subjects</p>
                          <div className="flex flex-wrap gap-2">
                            {s.dropped_subjects.map(ds => (
                              <div key={ds.subject_name}
                                className="bg-white border border-red-100 rounded-lg px-3 py-1.5 text-xs">
                                <span className="font-medium text-gray-700">{ds.subject_name}</span>
                                <span className="text-red-600 ml-2">{ds.delta.toFixed(1)}%</span>
                                <span className="text-gray-400 ml-1">({ds.current_score.toFixed(0)} now)</span>
                              </div>
                            ))}
                          </div>
                          {s.intervention_count > 0 && (
                            <p className="text-xs text-teal-600 mt-2">{s.intervention_count} prior intervention{s.intervention_count !== 1 ? 's' : ''} on record</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading.roster && rosterData && filteredStudents.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No at-risk students found for selected filters.</p>
        )}
      </section>

      {/* ── VALUE-ADD CHART ──────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <h2 className="font-semibold text-gray-800">Value-Add Distribution</h2>

        {loading.valueadd && <div className="animate-pulse bg-gray-100 rounded-xl h-32" />}

        {valueAddData && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {valueAddData.buckets.map(b => (
                <div key={b.category} className="border border-gray-100 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold" style={{ color: BUCKET_COLORS[b.category] }}>
                    {b.count}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{BUCKET_LABELS[b.category]}</p>
                  <p className="text-xs text-gray-400">{b.percentage.toFixed(1)}%</p>
                </div>
              ))}
            </div>

            {/* Horizontal stacked bar */}
            <div>
              <p className="text-xs text-gray-400 mb-1">Distribution across {valueAddData.total_students} students</p>
              <div className="flex h-8 rounded-lg overflow-hidden w-full">
                {valueAddData.buckets.map(b => (
                  b.percentage > 0 && (
                    <div
                      key={b.category}
                      title={`${BUCKET_LABELS[b.category]}: ${b.count} students (${b.percentage.toFixed(1)}%)`}
                      style={{ width: `${b.percentage}%`, background: BUCKET_COLORS[b.category] }}
                      className="transition-all"
                    />
                  )
                ))}
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                {valueAddData.buckets.map(b => (
                  <div key={b.category} className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: BUCKET_COLORS[b.category] }} />
                    {BUCKET_LABELS[b.category]}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-sm text-gray-500 italic">{valueAddData.insight}</p>
              <span className={`text-sm font-semibold ${valueAddData.avg_value_add >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                Avg: {valueAddData.avg_value_add >= 0 ? '+' : ''}{valueAddData.avg_value_add.toFixed(1)}%
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
