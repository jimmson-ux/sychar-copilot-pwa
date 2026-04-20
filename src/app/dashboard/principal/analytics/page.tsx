'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

/* ── Types ─────────────────────────────────────────── */
interface SchoolMeanData {
  school_average: number
  pass_rate: number
  total_students: number
  by_level: { level: string; average: number; student_count: number }[]
  by_subject: { subject_name: string; average: number; pass_rate: number }[]
  term: string
  academic_year: string
}

interface PercentileStudent {
  student_id: string
  student_name: string
  admission_number: string
  class_name: string
  mean_score: number
  rank: number
  fee_balance: number
  gc_support: boolean
  intervention_count: number
}

interface SentHomeSegment {
  segment: 'send_home_immediately' | 'handle_with_care' | 'installment_payers'
  students: {
    student_id: string
    student_name: string
    admission_number: string
    class_name: string
    fee_balance: number
    payment_count: number
    last_payment_date: string | null
    risk_note: string
  }[]
}

interface CashflowWeek {
  week_label: string
  week_start: string
  projected_amount: number
  actual_amount: number | null
  is_past: boolean
  confidence: number
}

interface ReportCardJob {
  job_id: string
  status: 'pending' | 'running' | 'done' | 'error'
  progress: number
  report_count: number
  cbc_count: number
  legacy_count: number
  download_url: string | null
}

/* ── Helpers ───────────────────────────────────────── */
const SEGMENT_LABELS: Record<string, string> = {
  send_home_immediately: 'Send Home',
  handle_with_care:      'Handle with Care',
  installment_payers:    'Installment Payers',
}

const SEGMENT_STYLES: Record<string, string> = {
  send_home_immediately: 'bg-red-50 text-red-700 border-red-200',
  handle_with_care:      'bg-orange-50 text-orange-700 border-orange-200',
  installment_payers:    'bg-blue-50 text-blue-700 border-blue-200',
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 1 }).format(n)
}

function fmtKES(n: number) {
  return 'KES ' + new Intl.NumberFormat('en-KE').format(Math.round(n))
}

function heatColor(confidence: number, isPast: boolean) {
  if (isPast) return '#1E3A5F'          // dark navy = actual
  const t = Math.max(0, Math.min(1, confidence))
  const r = Math.round(9 + (209 - 9) * t)
  const g = Math.round(209 + (169 - 209) * t)
  const b = Math.round(199 + (7 - 199) * t)
  return `rgb(${r},${g},${b})`
}

/* ── Component ─────────────────────────────────────── */
export default function PrincipalAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'percentiles' | 'fees' | 'cashflow' | 'reports'>('overview')

  /* overview */
  const [meanData, setMeanData]         = useState<SchoolMeanData | null>(null)
  const [meanLoading, setMeanLoading]   = useState(false)
  const meanTimerRef                    = useRef<ReturnType<typeof setInterval> | null>(null)

  /* percentiles */
  const [percLevel, setPercLevel]       = useState('')
  const [percTerm, setPercTerm]         = useState('')
  const [topStudents, setTopStudents]   = useState<PercentileStudent[]>([])
  const [bottomStudents, setBottomStudents] = useState<PercentileStudent[]>([])
  const [percLoading, setPercLoading]   = useState(false)

  /* sent-home */
  const [sentHomeData, setSentHomeData]     = useState<{ segments: SentHomeSegment[]; strategic_insight: string } | null>(null)
  const [sentHomeTab, setSentHomeTab]       = useState<'send_home_immediately' | 'handle_with_care' | 'installment_payers'>('send_home_immediately')
  const [sentHomeLoading, setSentHomeLoading] = useState(false)

  /* cashflow */
  const [cashflowData, setCashflowData]   = useState<{ weeks: CashflowWeek[]; peak_week: string; projected_total: number; insight: string } | null>(null)
  const [cashLoading, setCashLoading]     = useState(false)

  /* report cards */
  const [rcLevel, setRcLevel]           = useState('')
  const [rcTerm, setRcTerm]             = useState('')
  const [rcYear, setRcYear]             = useState('')
  const [rcJob, setRcJob]               = useState<ReportCardJob | null>(null)
  const [rcSubmitting, setRcSubmitting] = useState(false)
  const rcPollerRef                     = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ── Data loaders ── */
  const loadMean = useCallback(async () => {
    setMeanLoading(true)
    try {
      const r = await fetch('/api/analytics/principal/school-mean')
      setMeanData(await r.json())
    } finally { setMeanLoading(false) }
  }, [])

  // Auto-refresh school mean every 5 min while on overview tab
  useEffect(() => {
    if (activeTab === 'overview') {
      loadMean()
      meanTimerRef.current = setInterval(loadMean, 300_000)
    }
    return () => { if (meanTimerRef.current) clearInterval(meanTimerRef.current) }
  }, [activeTab, loadMean])

  const loadPercentiles = useCallback(async () => {
    if (!percLevel || !percTerm) return
    setPercLoading(true)
    try {
      const r = await fetch(`/api/analytics/principal/percentiles?level=${encodeURIComponent(percLevel)}&term=${encodeURIComponent(percTerm)}`)
      const d = await r.json()
      setTopStudents(d.top ?? [])
      setBottomStudents(d.bottom ?? [])
    } finally { setPercLoading(false) }
  }, [percLevel, percTerm])

  const loadSentHome = useCallback(async () => {
    setSentHomeLoading(true)
    try {
      const r = await fetch('/api/analytics/principal/smart-sent-home-list')
      setSentHomeData(await r.json())
    } finally { setSentHomeLoading(false) }
  }, [])

  const loadCashflow = useCallback(async () => {
    setCashLoading(true)
    try {
      const r = await fetch('/api/analytics/principal/cashflow-forecast')
      setCashflowData(await r.json())
    } finally { setCashLoading(false) }
  }, [])

  useEffect(() => {
    if (activeTab === 'fees')     loadSentHome()
    if (activeTab === 'cashflow') loadCashflow()
  }, [activeTab, loadSentHome, loadCashflow])

  // Poll report card job
  useEffect(() => {
    if (rcJob && (rcJob.status === 'pending' || rcJob.status === 'running')) {
      rcPollerRef.current = setInterval(async () => {
        const r = await fetch(`/api/analytics/principal/report-cards/${rcJob.job_id}`)
        const d: ReportCardJob = await r.json()
        setRcJob(d)
        if (d.status === 'done' || d.status === 'error') {
          if (rcPollerRef.current) clearInterval(rcPollerRef.current)
        }
      }, 2000)
    }
    return () => { if (rcPollerRef.current) clearInterval(rcPollerRef.current) }
  }, [rcJob?.job_id, rcJob?.status])

  async function handleGenerateReportCards() {
    if (!rcLevel || !rcTerm || !rcYear) return
    setRcSubmitting(true)
    try {
      const r = await fetch('/api/analytics/principal/generate-report-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_level: rcLevel, term: rcTerm, academic_year: rcYear }),
      })
      setRcJob(await r.json())
    } finally { setRcSubmitting(false) }
  }

  /* ── Sub-renderers ── */
  function StudentRow({ s, showFee }: { s: PercentileStudent; showFee?: boolean }) {
    return (
      <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
        <td className="py-2.5 pr-4">
          <span className="font-medium text-gray-800 text-sm">{s.student_name}</span>
          <p className="text-xs text-gray-400">{s.admission_number}</p>
        </td>
        <td className="text-xs text-gray-500 py-2.5 pr-4">{s.class_name}</td>
        <td className="text-right py-2.5 px-3 font-semibold text-gray-900">{fmt(s.mean_score)}%</td>
        <td className="text-right py-2.5 px-3 text-gray-400 text-xs">#{s.rank}</td>
        {showFee && (
          <td className={`text-right py-2.5 px-3 text-sm ${s.fee_balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {s.fee_balance > 0 ? fmtKES(s.fee_balance) : '—'}
          </td>
        )}
        <td className="text-center py-2.5 px-3">
          {s.gc_support && <span className="text-[#09D1C7] font-bold text-xs">G&amp;C</span>}
        </td>
      </tr>
    )
  }

  const TABS = [
    { key: 'overview',   label: 'School Mean' },
    { key: 'percentiles', label: 'Top / Bottom' },
    { key: 'fees',       label: 'Sent-Home List' },
    { key: 'cashflow',   label: 'Cash Flow' },
    { key: 'reports',    label: 'Report Cards' },
  ] as const

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Principal Analytics</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ──────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {meanLoading && !meanData && <div className="animate-pulse bg-gray-100 rounded-xl h-40" />}

          {meanData && (
            <>
              {/* Ticker cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className="text-3xl font-extrabold text-[#09D1C7]">{fmt(meanData.school_average)}%</div>
                  <p className="text-xs text-gray-400 mt-1">School Mean</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className="text-3xl font-extrabold text-green-600">{fmt(meanData.pass_rate)}%</div>
                  <p className="text-xs text-gray-400 mt-1">Pass Rate</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className="text-3xl font-extrabold text-gray-800">{meanData.total_students}</div>
                  <p className="text-xs text-gray-400 mt-1">Students Assessed</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className="text-lg font-bold text-gray-700">{meanData.term}</div>
                  <p className="text-xs text-gray-400 mt-1">{meanData.academic_year}</p>
                </div>
              </div>

              {/* By Level */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">By Class Level</h3>
                <div className="space-y-2">
                  {meanData.by_level.map(l => (
                    <div key={l.level} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-20 shrink-0">{l.level}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#09D1C7] transition-all"
                          style={{ width: `${Math.min(100, l.average)}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 w-12 text-right">{fmt(l.average)}%</span>
                      <span className="text-xs text-gray-400 w-20 text-right">{l.student_count} students</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* By Subject — top/bottom 8 */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">By Subject</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                        <th className="text-left py-1.5 pr-4">Subject</th>
                        <th className="text-right py-1.5 px-3">Average</th>
                        <th className="text-right py-1.5 px-3">Pass Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...meanData.by_subject]
                        .sort((a, b) => b.average - a.average)
                        .map(s => (
                          <tr key={s.subject_name} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 pr-4 text-gray-700">{s.subject_name}</td>
                            <td className="text-right py-2 px-3 font-semibold text-gray-900">{fmt(s.average)}%</td>
                            <td className={`text-right py-2 px-3 ${s.pass_rate < 50 ? 'text-red-600' : 'text-green-600'}`}>
                              {fmt(s.pass_rate)}%
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PERCENTILES ───────────────────────────────────── */}
      {activeTab === 'percentiles' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Class Level</label>
              <input
                className="mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
                placeholder="Form 4" value={percLevel} onChange={e => setPercLevel(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Term</label>
              <select
                className="mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
                value={percTerm} onChange={e => setPercTerm(e.target.value)}>
                <option value="">Select…</option>
                <option value="Term 1">Term 1</option>
                <option value="Term 2">Term 2</option>
                <option value="Term 3">Term 3</option>
              </select>
            </div>
            <button
              onClick={loadPercentiles}
              disabled={percLoading || !percLevel || !percTerm}
              className="bg-[#09D1C7] text-white px-4 py-2 rounded-lg text-sm disabled:opacity-40 hover:bg-teal-600 transition-colors">
              {percLoading ? 'Loading…' : 'Load'}
            </button>
          </div>

          {(topStudents.length > 0 || bottomStudents.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Top 10 */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1">
                  <span className="text-green-600">▲</span> Top 10
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left py-1 pr-3">Student</th>
                      <th className="text-left py-1 pr-3">Class</th>
                      <th className="text-right py-1 px-2">Mean</th>
                      <th className="text-right py-1 px-2">Fee Bal.</th>
                      <th className="text-center py-1">G&amp;C</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topStudents.map(s => <StudentRow key={s.student_id} s={s} showFee />)}
                  </tbody>
                </table>
              </div>

              {/* Bottom 10 */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1">
                  <span className="text-red-500">▼</span> Bottom 10
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left py-1 pr-3">Student</th>
                      <th className="text-left py-1 pr-3">Class</th>
                      <th className="text-right py-1 px-2">Mean</th>
                      <th className="text-right py-1 px-2">Fee Bal.</th>
                      <th className="text-center py-1">G&amp;C</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bottomStudents.map(s => <StudentRow key={s.student_id} s={s} showFee />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SENT-HOME LIST ────────────────────────────────── */}
      {activeTab === 'fees' && (
        <div className="space-y-4">
          {sentHomeLoading && <div className="animate-pulse bg-gray-100 rounded-xl h-48" />}

          {sentHomeData && (
            <>
              {sentHomeData.strategic_insight && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  {sentHomeData.strategic_insight}
                </div>
              )}

              {/* Segment tabs */}
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                {(['send_home_immediately', 'handle_with_care', 'installment_payers'] as const).map(seg => {
                  const bucket = sentHomeData.segments.find(s => s.segment === seg)
                  return (
                    <button
                      key={seg}
                      onClick={() => setSentHomeTab(seg)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        sentHomeTab === seg ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                      }`}>
                      {SEGMENT_LABELS[seg]}
                      {bucket && (
                        <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full border ${SEGMENT_STYLES[seg]}`}>
                          {bucket.students.length}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {sentHomeData.segments
                .filter(s => s.segment === sentHomeTab)
                .map(bucket => (
                  <div key={bucket.segment} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase border-b border-gray-100 bg-gray-50">
                          <th className="text-left py-2 px-4">Student</th>
                          <th className="text-left py-2 px-3">Class</th>
                          <th className="text-right py-2 px-3">Balance</th>
                          <th className="text-right py-2 px-3">Payments</th>
                          <th className="text-left py-2 px-3">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bucket.students.map(s => (
                          <tr key={s.student_id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2.5 px-4">
                              <span className="font-medium text-gray-800">{s.student_name}</span>
                              <p className="text-xs text-gray-400">{s.admission_number}</p>
                            </td>
                            <td className="py-2.5 px-3 text-xs text-gray-500">{s.class_name}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-red-600">
                              {fmtKES(s.fee_balance)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-gray-500 text-xs">
                              {s.payment_count}
                              {s.last_payment_date && (
                                <p className="text-gray-300">{new Date(s.last_payment_date).toLocaleDateString('en-KE')}</p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-gray-400 italic">{s.risk_note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {bucket.students.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-8">No students in this segment.</p>
                    )}
                  </div>
                ))}
            </>
          )}
        </div>
      )}

      {/* ── CASH FLOW HEATMAP ─────────────────────────────── */}
      {activeTab === 'cashflow' && (
        <div className="space-y-4">
          {cashLoading && <div className="animate-pulse bg-gray-100 rounded-xl h-48" />}

          {cashflowData && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-[#09D1C7]">{fmtKES(cashflowData.projected_total)}</div>
                  <p className="text-xs text-gray-400 mt-1">Projected 13-week collections</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                  <div className="text-lg font-bold text-gray-800">{cashflowData.peak_week}</div>
                  <p className="text-xs text-gray-400 mt-1">Peak collection week</p>
                </div>
              </div>

              {/* Heatmap grid */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">13-Week Collection Forecast</h3>
                <div className="flex gap-1 flex-wrap">
                  {cashflowData.weeks.map((w, i) => {
                    const amount = w.is_past ? (w.actual_amount ?? 0) : w.projected_amount
                    const color  = heatColor(w.confidence, w.is_past)
                    return (
                      <div
                        key={i}
                        title={`${w.week_label}\n${fmtKES(amount)}\n${w.is_past ? 'Actual' : `Projected (${Math.round(w.confidence * 100)}% conf.)`}`}
                        className="flex flex-col items-center gap-1 cursor-default"
                        style={{ minWidth: 48 }}>
                        <div
                          className="w-10 rounded-md"
                          style={{
                            height: 60,
                            background: color,
                            opacity: w.is_past ? 1 : 0.7 + 0.3 * w.confidence,
                          }} />
                        <span className="text-xs text-gray-400 text-center leading-tight" style={{ maxWidth: 48 }}>
                          {w.week_label}
                        </span>
                        <span className="text-xs font-medium text-gray-600">
                          {amount >= 1_000_000
                            ? (amount / 1_000_000).toFixed(1) + 'M'
                            : amount >= 1_000
                            ? (amount / 1_000).toFixed(0) + 'K'
                            : amount.toFixed(0)}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Legend */}
                <div className="flex gap-4 mt-3 text-xs text-gray-400">
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm" style={{ background: '#1E3A5F' }} />
                    Actual
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm" style={{ background: '#09D1C7' }} />
                    Projected (high conf.)
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm" style={{ background: '#D1A907', opacity: 0.7 }} />
                    Projected (low conf.)
                  </div>
                </div>
              </div>

              {cashflowData.insight && (
                <p className="text-sm text-gray-500 italic">{cashflowData.insight}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── REPORT CARDS ──────────────────────────────────── */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <h2 className="font-semibold text-gray-800">Generate Report Cards</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Class Level</label>
                <input
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
                  placeholder="Form 4" value={rcLevel} onChange={e => setRcLevel(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Term</label>
                <select
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
                  value={rcTerm} onChange={e => setRcTerm(e.target.value)}>
                  <option value="">Select…</option>
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Academic Year</label>
                <input
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#09D1C7]"
                  placeholder="2025/2026" value={rcYear} onChange={e => setRcYear(e.target.value)} />
              </div>
            </div>
            <button
              onClick={handleGenerateReportCards}
              disabled={rcSubmitting || !rcLevel || !rcTerm || !rcYear || !!(rcJob && (rcJob.status === 'pending' || rcJob.status === 'running'))}
              className="bg-[#09D1C7] text-white px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-teal-600 transition-colors">
              {rcSubmitting ? 'Submitting…' : 'Generate Report Cards'}
            </button>
          </div>

          {rcJob && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {rcJob.status === 'pending' && 'Queued…'}
                    {rcJob.status === 'running' && 'Generating…'}
                    {rcJob.status === 'done'    && 'Done'}
                    {rcJob.status === 'error'   && 'Error'}
                  </p>
                  <p className="text-xs text-gray-400">Job {rcJob.job_id.slice(0, 8)}</p>
                </div>
                {rcJob.status === 'done' && (
                  <div className="flex gap-2 text-xs text-gray-500">
                    <span>{rcJob.report_count} total</span>
                    <span>{rcJob.legacy_count} 8-4-4</span>
                    <span>{rcJob.cbc_count} CBC</span>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    rcJob.status === 'error' ? 'bg-red-500' : 'bg-[#09D1C7]'
                  }`}
                  style={{ width: `${rcJob.progress}%` }} />
              </div>
              <p className="text-xs text-gray-400">{rcJob.progress}% complete</p>

              {rcJob.status === 'done' && rcJob.download_url && (
                <a
                  href={rcJob.download_url}
                  className="inline-block bg-[#09D1C7] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors">
                  Download Report Cards
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
