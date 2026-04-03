'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stream {
  id: string
  name: string
  colour_hex: string
  sort_order: number
}

interface Subject {
  id: string
  name: string
  department: string
  code: string
}

interface PerfRow {
  stream_id: string
  stream_name: string
  subject_id: string
  subject_name: string
  department: string
  count: number
  avg_pct: number
  fail_rate: number
  pass_rate: number
  grade_dist: Record<string, number>
  coverage_pct: number | null
  topics_total: number
  topics_done: number
}

interface CoverageRow {
  stream_id: string
  stream_name: string
  subject_id: string
  subject_name: string
  department: string
  topics_total: number
  topics_done: number
  coverage_pct: number
  lessons_planned: number
  lessons_done: number
}

interface Insight {
  id: string
  insight_type: string
  severity: 'info' | 'warning' | 'critical'
  summary: string
  recommendation: string
  subject_id: string | null
  class_id: string | null
  generated_at: string
  is_actioned: boolean
}

interface DashData {
  streams: Stream[]
  subjects: Subject[]
  performance: PerfRow[]
  coverage: CoverageRow[]
  correlation: PerfRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Failing Streams', 'Syllabus Coverage', 'AI Insights'] as const
type Tab = (typeof TABS)[number]

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-50 border-red-200 text-red-800',
  warning:  'bg-amber-50 border-amber-200 text-amber-800',
  info:     'bg-blue-50 border-blue-200 text-blue-800',
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning:  'bg-amber-400',
  info:     'bg-blue-400',
}

const INSIGHT_ICON: Record<string, string> = {
  performance_gap: '📉',
  syllabus_lag:    '📚',
  at_risk_stream:  '⚠️',
  positive_trend:  '📈',
  setup_guidance:  '🚀',
  general:         '💡',
}

function pctColor(pct: number | null): string {
  if (pct === null) return 'text-gray-300'
  if (pct >= 70) return 'text-green-700'
  if (pct >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function pctBg(pct: number | null): string {
  if (pct === null) return 'bg-gray-50 text-gray-400'
  if (pct >= 70) return 'bg-green-50 text-green-800'
  if (pct >= 50) return 'bg-amber-50 text-amber-800'
  return 'bg-red-50 text-red-800'
}

function covBg(pct: number): string {
  if (pct >= 80) return 'bg-green-100 text-green-800'
  if (pct >= 50) return 'bg-amber-100 text-amber-800'
  if (pct > 0)   return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-500'
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ── Scatter chart (pure SVG, no library) ──────────────────────────────────────

function ScatterPlot({ data }: { data: PerfRow[] }) {
  const pts = data.filter(d => d.coverage_pct !== null && d.count > 0)

  if (pts.length === 0) {
    return (
      <div className="flex items-center justify-center h-56 rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
        No correlated data yet — add marks and syllabus progress to see the scatter.
      </div>
    )
  }

  const W = 480, H = 280, PAD = 44
  const innerW = W - PAD * 2
  const innerH = H - PAD * 2

  const xPos = (cov: number) => PAD + (cov / 100) * innerW
  const yPos = (pct: number) => H - PAD - (pct / 100) * innerH

  const [hover, setHover] = useState<PerfRow | null>(null)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* Grid */}
        {[0, 25, 50, 75, 100].map(v => (
          <g key={v}>
            <line x1={PAD} y1={yPos(v)} x2={W - PAD} y2={yPos(v)} stroke="#f0f0f0" strokeWidth="1" />
            <text x={PAD - 6} y={yPos(v) + 4} fontSize="9" fill="#aaa" textAnchor="end">{v}</text>
            <line x1={xPos(v)} y1={PAD} x2={xPos(v)} y2={H - PAD} stroke="#f0f0f0" strokeWidth="1" />
            <text x={xPos(v)} y={H - PAD + 12} fontSize="9" fill="#aaa" textAnchor="middle">{v}</text>
          </g>
        ))}

        {/* Axes */}
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#e5e7eb" strokeWidth="1.5" />
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#e5e7eb" strokeWidth="1.5" />

        {/* Axis labels */}
        <text x={W / 2} y={H - 4} fontSize="10" fill="#9ca3af" textAnchor="middle">Syllabus Coverage %</text>
        <text x={10} y={H / 2} fontSize="10" fill="#9ca3af" textAnchor="middle"
          transform={`rotate(-90 10 ${H / 2})`}>Avg Score %</text>

        {/* Failing quadrant highlight */}
        <rect
          x={PAD} y={yPos(50)}
          width={xPos(60) - PAD} height={yPos(0) - yPos(50)}
          fill="#fef2f2" opacity="0.5"
        />
        <text x={PAD + 6} y={yPos(10)} fontSize="8" fill="#fca5a5">Risk zone</text>

        {/* Points */}
        {pts.map((d, i) => (
          <circle
            key={i}
            cx={xPos(d.coverage_pct!)}
            cy={yPos(d.avg_pct)}
            r={Math.min(7, Math.max(3, Math.sqrt(d.count) * 1.5))}
            fill={d.avg_pct >= 50 ? '#22c55e' : '#ef4444'}
            opacity="0.75"
            className="cursor-pointer"
            onMouseEnter={() => setHover(d)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {/* Tooltip */}
      {hover && (
        <div className="absolute top-2 right-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs max-w-44 pointer-events-none">
          <div className="font-semibold text-gray-800 truncate">{hover.subject_name}</div>
          <div className="text-gray-500">{hover.stream_name}</div>
          <div className="mt-1 space-y-0.5">
            <div>Avg score: <span className={`font-medium ${pctColor(hover.avg_pct)}`}>{hover.avg_pct}%</span></div>
            <div>Coverage: <span className="font-medium">{hover.coverage_pct}%</span></div>
            <div>Fail rate: <span className="font-medium text-red-600">{hover.fail_rate}%</span></div>
            <div>Students: {hover.count}</div>
          </div>
        </div>
      )}

      <div className="flex gap-4 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Passing (≥50%)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Failing (&lt;50%)</span>
        <span className="text-gray-400">Dot size ∝ student count</span>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color,
}: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="text-xs font-medium opacity-70 mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HodDashboard() {
  const [tab, setTab] = useState<Tab>('Overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<DashData>({
    streams: [], subjects: [], performance: [], coverage: [], correlation: [],
  })
  const [insights, setInsights] = useState<Insight[]>([])
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  // Filters
  const [filterDept, setFilterDept] = useState('')
  const [filterStream, setFilterStream] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/hod')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true)
    try {
      const res = await fetch('/api/hod/insights')
      const json = await res.json()
      setInsights(json.insights ?? [])
    } catch {
      // non-fatal
    } finally {
      setInsightsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    fetchInsights()
  }, [fetchData, fetchInsights])

  const generateInsights = async () => {
    setGenerating(true)
    setGenError('')
    try {
      const res = await fetch('/api/hod/insights', { method: 'POST' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setInsights(prev => [...(json.insights ?? []), ...prev])
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const markActioned = async (id: string) => {
    await fetch(`/api/hod/insights?id=${id}`, { method: 'PATCH' })
    setInsights(prev => prev.map(i => i.id === id ? { ...i, is_actioned: true } : i))
  }

  // Derived data
  const departments = [...new Set(data.subjects.map(s => s.department).filter(Boolean))].sort()
  const perf = data.correlation.filter(
    p => (!filterDept || p.department === filterDept)
      && (!filterStream || p.stream_id === filterStream)
  )
  const failingPerf = perf.filter(p => p.avg_pct < 50 || p.fail_rate > 40).sort((a, b) => a.avg_pct - b.avg_pct)
  const covRows = data.coverage.filter(
    c => (!filterDept || c.department === filterDept)
      && (!filterStream || c.stream_id === filterStream)
  ).sort((a, b) => a.coverage_pct - b.coverage_pct)

  const totalStudents = data.performance.reduce((s, p) => s + p.count, 0)
  const failingCount = data.performance.filter(p => p.avg_pct < 50).length
  const avgCoverage = data.coverage.length
    ? Math.round(data.coverage.reduce((s, c) => s + c.coverage_pct, 0) / data.coverage.length)
    : 0
  const criticalInsights = insights.filter(i => i.severity === 'critical' && !i.is_actioned).length

  // Unique subjects in failing list, top 20
  const topFailSubjects = [...new Set(failingPerf.map(p => p.subject_id))].slice(0, 20)

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sm text-gray-400 animate-pulse">Loading HOD dashboard…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="font-semibold text-red-700 mb-1">Failed to load dashboard</div>
          <div className="text-sm text-red-600">{error}</div>
          <button onClick={fetchData} className="mt-3 text-sm text-red-700 underline">Retry</button>
        </div>
      </div>
    )
  }

  const hasData = data.performance.length > 0 || data.coverage.length > 0

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">HOD Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Stream performance, syllabus coverage, and AI-generated insights
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Streams" value={data.streams.length} color="bg-indigo-50 border-indigo-100 text-indigo-900" />
        <StatCard
          label="Failing combinations"
          value={failingCount}
          sub="avg score < 50%"
          color={failingCount > 0 ? 'bg-red-50 border-red-200 text-red-900' : 'bg-green-50 border-green-100 text-green-900'}
        />
        <StatCard
          label="Avg syllabus coverage"
          value={`${avgCoverage}%`}
          sub={data.coverage.length > 0 ? `${data.coverage.length} topic groups` : 'No data yet'}
          color={avgCoverage < 50 ? 'bg-amber-50 border-amber-100 text-amber-900' : 'bg-green-50 border-green-100 text-green-900'}
        />
        <StatCard
          label="Critical AI insights"
          value={criticalInsights}
          sub="unactioned"
          color={criticalInsights > 0 ? 'bg-red-50 border-red-200 text-red-900' : 'bg-gray-50 border-gray-100 text-gray-700'}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={filterStream}
          onChange={e => setFilterStream(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">All streams</option>
          {data.streams.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={filterDept}
          onChange={e => setFilterDept(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">All departments</option>
          {departments.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {(filterStream || filterDept) && (
          <button
            onClick={() => { setFilterStream(''); setFilterDept('') }}
            className="text-sm text-gray-400 hover:text-gray-600 px-2"
          >
            Clear filters ✕
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
              {t === 'AI Insights' && criticalInsights > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {criticalInsights}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'Overview' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Performance vs Syllabus Coverage Correlation
            </h2>
            <ScatterPlot data={data.correlation} />
          </div>

          {!hasData && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
              <div className="font-semibold mb-1">No data to display yet</div>
              <p className="text-amber-700">
                The marks and syllabus progress tables are currently empty.
                Once teachers start entering marks and tracking topic completion,
                this dashboard will show real correlations and stream comparisons.
              </p>
            </div>
          )}

          {/* Stream × Subject mini table */}
          {data.performance.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                Performance by Stream (top 15 subject–stream combos by student count)
              </h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-100">
                    <th className="text-left py-2 pr-3 font-medium">Subject</th>
                    <th className="text-left py-2 pr-3 font-medium">Stream</th>
                    <th className="text-right py-2 pr-3 font-medium">Students</th>
                    <th className="text-right py-2 pr-3 font-medium">Avg %</th>
                    <th className="text-right py-2 pr-3 font-medium">Fail rate</th>
                    <th className="text-right py-2 font-medium">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.correlation]
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 15)
                    .map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 pr-3 font-medium text-gray-800 truncate max-w-40">{row.subject_name}</td>
                        <td className="py-2 pr-3 text-gray-500">{row.stream_name}</td>
                        <td className="py-2 pr-3 text-right text-gray-600">{row.count}</td>
                        <td className={`py-2 pr-3 text-right font-semibold ${pctColor(row.avg_pct)}`}>{row.avg_pct}%</td>
                        <td className={`py-2 pr-3 text-right ${row.fail_rate > 40 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {row.fail_rate}%
                        </td>
                        <td className="py-2 text-right">
                          {row.coverage_pct !== null
                            ? <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${covBg(row.coverage_pct)}`}>{row.coverage_pct}%</span>
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── FAILING STREAMS ── */}
      {tab === 'Failing Streams' && (
        <div className="space-y-4">
          {failingPerf.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <div className="text-2xl mb-2">🎉</div>
              <div className="font-semibold text-green-800">
                {hasData ? 'No failing stream–subject combinations!' : 'No marks data yet'}
              </div>
              <div className="text-sm text-green-600 mt-1">
                {hasData
                  ? 'All stream–subject combinations currently have an average above 50%.'
                  : 'Add marks to see which streams are failing by subject.'}
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm text-gray-500 mb-2">
                Showing {failingPerf.length} stream–subject combination{failingPerf.length !== 1 ? 's' : ''} with
                avg score &lt; 50% or fail rate &gt; 40%, sorted by worst first.
              </div>

              {/* Heat grid: streams as columns, subjects as rows */}
              {topFailSubjects.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
                  <h2 className="text-sm font-semibold text-gray-700 mb-3">Failure heat map</h2>
                  <table className="text-xs">
                    <thead>
                      <tr>
                        <th className="text-left py-2 pr-4 font-medium text-gray-400 min-w-36">Subject</th>
                        {data.streams.map(s => (
                          <th key={s.id} className="text-center py-2 px-2 font-medium text-gray-500 min-w-20">
                            {s.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topFailSubjects.map(subId => {
                        const subName = data.subjects.find(s => s.id === subId)?.name ?? subId
                        return (
                          <tr key={subId} className="border-t border-gray-50">
                            <td className="py-2 pr-4 font-medium text-gray-700 truncate max-w-36">{subName}</td>
                            {data.streams.map(stream => {
                              const cell = failingPerf.find(
                                p => p.stream_id === stream.id && p.subject_id === subId
                              )
                              return (
                                <td key={stream.id} className="py-1.5 px-2 text-center">
                                  {cell ? (
                                    <span className={`inline-block px-2 py-0.5 rounded font-medium ${pctBg(cell.avg_pct)}`}>
                                      {cell.avg_pct}%
                                    </span>
                                  ) : (
                                    <span className="text-gray-200">—</span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Detail cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {failingPerf.slice(0, 30).map((row, i) => (
                  <div key={i} className="bg-white border border-red-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="text-sm font-semibold text-gray-800 truncate">{row.subject_name}</div>
                        <div className="text-xs text-gray-400">{row.stream_name} · {row.department}</div>
                      </div>
                      <span className={`text-sm font-bold flex-shrink-0 ${pctColor(row.avg_pct)}`}>
                        {row.avg_pct}%
                      </span>
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>Fail rate: <b className="text-red-600">{row.fail_rate}%</b></span>
                      <span>Students: <b className="text-gray-700">{row.count}</b></span>
                      {row.coverage_pct !== null && (
                        <span>Coverage: <b className={pctColor(row.coverage_pct)}>{row.coverage_pct}%</b></span>
                      )}
                    </div>
                    {/* Grade distribution mini bar */}
                    {Object.keys(row.grade_dist).length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {Object.entries(row.grade_dist)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([grade, cnt]) => (
                            <div key={grade} className="flex flex-col items-center">
                              <div className="text-xs text-gray-400">{grade}</div>
                              <div className="text-xs font-medium text-gray-700">{cnt}</div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── SYLLABUS COVERAGE ── */}
      {tab === 'Syllabus Coverage' && (
        <div className="space-y-4">
          {covRows.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
              No syllabus progress data yet.
              <br />
              Teachers need to log topic completion in syllabus_progress to see coverage here.
            </div>
          ) : (
            <>
              {/* Coverage summary bar */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Coverage by stream × subject</h2>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left py-2 pr-3 font-medium">Subject</th>
                      <th className="text-left py-2 pr-3 font-medium">Stream</th>
                      <th className="text-right py-2 pr-3 font-medium">Topics</th>
                      <th className="text-right py-2 pr-3 font-medium">Done</th>
                      <th className="text-right py-2 pr-3 font-medium">Coverage</th>
                      <th className="py-2 w-32 font-medium">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {covRows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 pr-3 font-medium text-gray-800 truncate max-w-40">{row.subject_name}</td>
                        <td className="py-2 pr-3 text-gray-500">{row.stream_name}</td>
                        <td className="py-2 pr-3 text-right text-gray-600">{row.topics_total}</td>
                        <td className="py-2 pr-3 text-right text-gray-600">{row.topics_done}</td>
                        <td className="py-2 pr-3 text-right">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${covBg(row.coverage_pct)}`}>
                            {row.coverage_pct}%
                          </span>
                        </td>
                        <td className="py-2">
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                row.coverage_pct >= 80 ? 'bg-green-500'
                                : row.coverage_pct >= 50 ? 'bg-amber-400'
                                : 'bg-red-400'
                              }`}
                              style={{ width: `${row.coverage_pct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Correlation callout */}
              {data.correlation.filter(c => c.coverage_pct !== null && c.coverage_pct < 50 && c.avg_pct < 50).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
                  <span className="font-semibold">⚠ Correlation alert: </span>
                  {data.correlation.filter(c => c.coverage_pct !== null && c.coverage_pct < 50 && c.avg_pct < 50).length} stream–subject
                  combination{data.correlation.filter(c => c.coverage_pct !== null && c.coverage_pct < 50 && c.avg_pct < 50).length !== 1 ? 's have' : ' has'} both
                  low syllabus coverage (&lt;50%) and low average scores (&lt;50%).
                  Generate AI insights to get targeted recommendations.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── AI INSIGHTS ── */}
      {tab === 'AI Insights' && (
        <div className="space-y-4">
          {/* Generate button */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {insights.length > 0
                ? `${insights.length} insight${insights.length !== 1 ? 's' : ''} stored`
                : 'No insights yet'}
            </div>
            <button
              onClick={generateInsights}
              disabled={generating}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              {generating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                '✦ Generate AI insights'
              )}
            </button>
          </div>

          {genError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {genError}
            </div>
          )}

          {insightsLoading ? (
            <div className="text-sm text-gray-400 animate-pulse py-8 text-center">Loading insights…</div>
          ) : insights.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-8 text-center">
              <div className="text-3xl mb-3">✦</div>
              <div className="font-semibold text-gray-700 mb-1">No AI insights yet</div>
              <div className="text-sm text-gray-400 mb-4">
                Click &ldquo;Generate AI insights&rdquo; to analyse stream performance and syllabus coverage
                and get targeted recommendations from Claude.
              </div>
              <button
                onClick={generateInsights}
                disabled={generating}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
              >
                {generating ? 'Generating…' : 'Generate now'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Unactioned first */}
              {[...insights].sort((a, b) => {
                if (a.is_actioned !== b.is_actioned) return a.is_actioned ? 1 : -1
                const sev = { critical: 0, warning: 1, info: 2 }
                return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3)
              }).map(ins => (
                <div
                  key={ins.id}
                  className={`rounded-xl border p-4 transition-opacity ${
                    ins.is_actioned ? 'opacity-50' : ''
                  } ${SEVERITY_STYLE[ins.severity] ?? SEVERITY_STYLE.info}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl flex-shrink-0 mt-0.5">
                      {INSIGHT_ICON[ins.insight_type] ?? '💡'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[ins.severity] ?? SEVERITY_DOT.info}`} />
                        <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
                          {ins.severity} · {ins.insight_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs opacity-50 ml-auto">{fmtDate(ins.generated_at)}</span>
                      </div>
                      <div className="text-sm font-medium mb-1.5">{ins.summary}</div>
                      <div className="text-sm opacity-80">
                        <span className="font-semibold">Recommendation: </span>
                        {ins.recommendation}
                      </div>
                    </div>
                    {!ins.is_actioned && (
                      <button
                        onClick={() => markActioned(ins.id)}
                        title="Mark as actioned"
                        className="flex-shrink-0 text-xs underline opacity-60 hover:opacity-100 transition-opacity"
                      >
                        Done
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
