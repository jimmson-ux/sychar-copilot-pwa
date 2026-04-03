'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Overview {
  total: number
  female_count: number
  male_count: number
  female_avg_kcpe: number | null
  male_avg_kcpe: number | null
  female_with_kcpe: number
  male_with_kcpe: number
  female_grade_dist: Record<string, number>
  male_grade_dist: Record<string, number>
  kcpe_gap: number | null
}

interface StreamRow {
  stream_id: string
  stream_name: string
  colour_hex: string
  female_count: number
  male_count: number
  total: number
  female_pct: number
  female_avg_kcpe: number | null
  male_avg_kcpe: number | null
  female_cbe: number
  male_cbe: number
}

interface PathwayRow {
  pathway: string
  label: string
  female_count: number
  male_count: number
  total: number
  female_pct: number
  male_pct: number
}

interface GradeBand {
  band: string
  female_count: number
  male_count: number
}

interface MarksByCategory {
  category: string
  gender: string
  count: number
  avg_pct: number | null
}

interface SubjectMark {
  subject_id: string
  name: string
  dept: string
  female_avg: number | null
  male_avg: number | null
  female_count: number
  male_count: number
  gap: number | null
}

interface DashData {
  overview: Overview
  streams: StreamRow[]
  pathway_inclination: PathwayRow[]
  grade_bands: GradeBand[]
  marks_by_category: MarksByCategory[]
  subject_marks: SubjectMark[]
  has_marks: boolean
  subjects_by_category: Record<string, { id: string; name: string; dept: string }[]>
}

// ── Colour constants ──────────────────────────────────────────────────────────
const F_COLOR  = '#ec4899'  // pink-500
const M_COLOR  = '#3b82f6'  // blue-500
const F_LIGHT  = '#fdf2f8'
const M_LIGHT  = '#eff6ff'
const F_BORDER = '#f9a8d4'
const M_BORDER = '#93c5fd'

const PATHWAY_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  STEM:            { bg: '#f0fdf4', border: '#86efac', text: '#166534', icon: '🔬' },
  Social_Sciences: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', icon: '🌍' },
  Arts_Sports:     { bg: '#fdf4ff', border: '#d8b4fe', text: '#6b21a8', icon: '🎨' },
  CBE:             { bg: '#f0f9ff', border: '#7dd3fc', text: '#0c4a6e', icon: '📘' },
}

const GRADE_COLORS: Record<string, string> = {
  'A (400+)':    '#15803d',
  'B (320–399)': '#16a34a',
  'C (260–319)': '#ca8a04',
  'D (200–259)': '#ea580c',
  'E (<200)':    '#dc2626',
  'CBE / No KCPE': '#6b7280',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Stream Breakdown', 'Pathway Inclination', 'STEM Subjects'] as const
type Tab = (typeof TABS)[number]

function pctBar(value: number, color: string, height = 8) {
  return (
    <div style={{ height }} className="w-full rounded-full bg-gray-100 overflow-hidden">
      <div
        style={{ width: `${Math.min(100, value)}%`, backgroundColor: color, height: '100%' }}
        className="rounded-full transition-all duration-500"
      />
    </div>
  )
}

function GenderPill({ gender }: { gender: 'female' | 'male' }) {
  return gender === 'female'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-pink-50 text-pink-700 border border-pink-200">♀ Female</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">♂ Male</span>
}

// Dual bar – female left, male right, centred on zero
function DualBar({ femalePct, malePct, max = 100 }: { femalePct: number; malePct: number; max?: number }) {
  const fW = (femalePct / max) * 100
  const mW = (malePct  / max) * 100
  return (
    <div className="flex items-center gap-1">
      <div className="flex-1 flex justify-end">
        <div
          style={{ width: `${fW}%`, backgroundColor: F_COLOR, height: 10 }}
          className="rounded-full min-w-0.5 transition-all"
        />
      </div>
      <div className="w-px h-3 bg-gray-300 flex-shrink-0" />
      <div className="flex-1">
        <div
          style={{ width: `${mW}%`, backgroundColor: M_COLOR, height: 10 }}
          className="rounded-full min-w-0.5 transition-all"
        />
      </div>
    </div>
  )
}

// Mini horizontal bar chart for two values side by side
function CompareBar({
  femaleVal, maleVal, label, max,
}: { femaleVal: number | null; maleVal: number | null; label: string; max: number }) {
  const fW = femaleVal !== null ? Math.round((femaleVal / max) * 100) : 0
  const mW = maleVal   !== null ? Math.round((maleVal   / max) * 100) : 0
  const gap = femaleVal !== null && maleVal !== null ? femaleVal - maleVal : null

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="font-medium text-gray-700 truncate max-w-40">{label}</span>
        {gap !== null && (
          <span className={`text-xs font-semibold flex-shrink-0 ml-2 ${gap > 0 ? 'text-pink-600' : gap < 0 ? 'text-blue-600' : 'text-gray-400'}`}>
            {gap > 0 ? `♀ +${gap.toFixed(1)}` : gap < 0 ? `♂ +${Math.abs(gap).toFixed(1)}` : '='}
          </span>
        )}
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="w-3 text-xs text-pink-500">♀</span>
          {pctBar(fW, F_COLOR, 7)}
          <span className="text-xs text-gray-600 w-10 text-right">
            {femaleVal !== null ? femaleVal.toFixed(1) : '—'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 text-xs text-blue-500">♂</span>
          {pctBar(mW, M_COLOR, 7)}
          <span className="text-xs text-gray-600 w-10 text-right">
            {maleVal !== null ? maleVal.toFixed(1) : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

// SVG grouped bar chart (no library) for grade band distribution
function GradeBandChart({ bands, femaleTotal, maleTotal }: {
  bands: GradeBand[]
  femaleTotal: number
  maleTotal: number
}) {
  const W = 520, H = 200, PAD_L = 48, PAD_B = 52, PAD_T = 16, PAD_R = 16
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const n = bands.length
  const groupW = innerW / n
  const barW = (groupW - 8) / 2

  const maxCount = Math.max(...bands.flatMap(b => [
    femaleTotal > 0 ? b.female_count : 0,
    maleTotal   > 0 ? b.male_count   : 0,
  ]), 1)

  const yH = (v: number) => (v / maxCount) * innerH
  const xGroup = (i: number) => PAD_L + i * groupW + 4
  const [hovered, setHovered] = useState<{ band: string; gender: string; count: number; pct: number } | null>(null)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* Y-axis gridlines */}
        {[0, 25, 50, 75, 100].map(v => {
          const yy = PAD_T + innerH - (v / 100) * innerH
          return (
            <g key={v}>
              <line x1={PAD_L} y1={yy} x2={W - PAD_R} y2={yy} stroke="#f3f4f6" strokeWidth="1" />
            </g>
          )
        })}

        {/* Bars */}
        {bands.map((b, i) => {
          const xG   = xGroup(i)
          const fH   = yH(b.female_count)
          const mH   = yH(b.male_count)
          const fPct = femaleTotal > 0 ? Math.round((b.female_count / femaleTotal) * 100) : 0
          const mPct = maleTotal   > 0 ? Math.round((b.male_count   / maleTotal)   * 100) : 0
          const baseY = PAD_T + innerH

          return (
            <g key={b.band}>
              {/* Female bar */}
              <rect
                x={xG} y={baseY - fH} width={barW} height={fH}
                fill={F_COLOR} rx="2" opacity="0.85"
                className="cursor-pointer"
                onMouseEnter={() => setHovered({ band: b.band, gender: 'female', count: b.female_count, pct: fPct })}
                onMouseLeave={() => setHovered(null)}
              />
              {/* Male bar */}
              <rect
                x={xG + barW + 2} y={baseY - mH} width={barW} height={mH}
                fill={M_COLOR} rx="2" opacity="0.85"
                className="cursor-pointer"
                onMouseEnter={() => setHovered({ band: b.band, gender: 'male', count: b.male_count, pct: mPct })}
                onMouseLeave={() => setHovered(null)}
              />
              {/* X label */}
              <text
                x={xG + barW + 1} y={baseY + 14}
                fontSize="7.5" fill="#9ca3af" textAnchor="middle"
                transform={`rotate(-30, ${xG + barW + 1}, ${baseY + 14})`}
              >
                {b.band.replace(' (', '\n(')}
              </text>
            </g>
          )
        })}

        {/* Axes */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + innerH} stroke="#e5e7eb" strokeWidth="1.5" />
        <line x1={PAD_L} y1={PAD_T + innerH} x2={W - PAD_R} y2={PAD_T + innerH} stroke="#e5e7eb" strokeWidth="1.5" />
      </svg>

      {hovered && (
        <div className="absolute top-0 right-0 bg-white border border-gray-200 rounded-lg shadow p-2 text-xs pointer-events-none">
          <div className="font-semibold text-gray-800">{hovered.band}</div>
          <div className={hovered.gender === 'female' ? 'text-pink-600' : 'text-blue-600'}>
            {hovered.gender === 'female' ? '♀ Female' : '♂ Male'}: {hovered.count} ({hovered.pct}%)
          </div>
        </div>
      )}

      <div className="flex gap-4 mt-1 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block" style={{ backgroundColor: F_COLOR }} /> Female</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block" style={{ backgroundColor: M_COLOR }} /> Male</span>
      </div>
    </div>
  )
}

// Stat card
function StatCard({ label, value, sub, style }: {
  label: string; value: string | number; sub?: string
  style?: React.CSSProperties
}) {
  return (
    <div className="rounded-xl border p-4" style={style}>
      <div className="text-xs font-medium opacity-60 mb-0.5">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs opacity-50 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Empty marks state ─────────────────────────────────────────────────────────
function EmptyMarksState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
      <div className="text-2xl mb-2">📊</div>
      <div className="text-sm font-medium text-gray-600 mb-1">{label}</div>
      <p className="text-xs text-gray-400 max-w-xs mx-auto">
        Marks data hasn&apos;t been entered yet. Once teachers record scores,
        this chart will show gender performance gaps across subjects in real time.
      </p>
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function PathwaysDashboard() {
  const [tab,     setTab]     = useState<Tab>('Overview')
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [data,    setData]    = useState<DashData | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/pathways')
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

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sm text-gray-400 animate-pulse">Loading pathways dashboard…</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="font-semibold text-red-700 mb-1">Failed to load</div>
          <div className="text-sm text-red-600">{error}</div>
          <button onClick={fetchData} className="mt-2 text-sm text-red-700 underline">Retry</button>
        </div>
      </div>
    )
  }
  if (!data) return null

  const { overview: ov, streams, pathway_inclination, grade_bands, subject_marks, has_marks } = data

  const kcpeMax = Math.max(ov.female_avg_kcpe ?? 0, ov.male_avg_kcpe ?? 0, 500)
  const leaderGender = ov.kcpe_gap !== null
    ? ov.kcpe_gap > 0 ? 'female' : ov.kcpe_gap < 0 ? 'male' : 'tied'
    : null

  // Which pathway inclination is most dominant per gender
  const topFemPath = [...pathway_inclination].sort((a, b) => b.female_count - a.female_count)[0]
  const topMalPath = [...pathway_inclination].sort((a, b) => b.male_count   - a.male_count  )[0]

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Gender & STEM Pathways Analysis</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Boys vs girls across subjects, streams, and CBC pathway inclinations
        </p>
      </div>

      {/* ── Top stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Total Students"
          value={ov.total.toLocaleString()}
          sub={`${ov.female_count}F · ${ov.male_count}M`}
          style={{ background: 'linear-gradient(135deg,#fdf2f8,#eff6ff)', borderColor: '#e9d5ff' }}
        />
        <StatCard
          label="Female avg KCPE"
          value={ov.female_avg_kcpe !== null ? ov.female_avg_kcpe.toFixed(1) : '—'}
          sub={`n = ${ov.female_with_kcpe}`}
          style={{ background: F_LIGHT, borderColor: F_BORDER, color: '#9d174d' }}
        />
        <StatCard
          label="Male avg KCPE"
          value={ov.male_avg_kcpe !== null ? ov.male_avg_kcpe.toFixed(1) : '—'}
          sub={`n = ${ov.male_with_kcpe}`}
          style={{ background: M_LIGHT, borderColor: M_BORDER, color: '#1e3a8a' }}
        />
        <StatCard
          label={leaderGender === 'female' ? '♀ Girls lead by' : leaderGender === 'male' ? '♂ Boys lead by' : 'KCPE gap'}
          value={ov.kcpe_gap !== null ? `${Math.abs(ov.kcpe_gap)} pts` : '—'}
          sub="KCPE entry score gap"
          style={{
            background: leaderGender === 'female' ? F_LIGHT : leaderGender === 'male' ? M_LIGHT : '#f9fafb',
            borderColor: leaderGender === 'female' ? F_BORDER : leaderGender === 'male' ? M_BORDER : '#e5e7eb',
            color: leaderGender === 'female' ? '#9d174d' : leaderGender === 'male' ? '#1e3a8a' : '#374151',
          }}
        />
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-violet-600 text-violet-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════ OVERVIEW ══════════ */}
      {tab === 'Overview' && (
        <div className="space-y-6">
          {/* Gender ratio per stream */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Gender ratio per stream</h2>
            <div className="space-y-4">
              {streams.map(s => (
                <div key={s.stream_id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{s.stream_name}</span>
                    <span className="text-xs text-gray-400">{s.total} students</span>
                  </div>
                  <DualBar femalePct={s.female_pct} malePct={100 - s.female_pct} />
                  <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                    <span className="text-pink-600">♀ {s.female_count} ({s.female_pct}%)</span>
                    <span className="text-blue-600">♂ {s.male_count} ({(100 - s.female_pct).toFixed(1)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* KCPE entry performance comparison */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">KCPE entry performance by stream</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {streams.map(s => (
                <div key={s.stream_id} className="border border-gray-100 rounded-lg p-3">
                  <div className="text-xs font-semibold text-gray-600 mb-2">{s.stream_name}</div>
                  <CompareBar
                    label="Avg KCPE score"
                    femaleVal={s.female_avg_kcpe}
                    maleVal={s.male_avg_kcpe}
                    max={500}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              KCPE is out of 500 (5 subjects × 100). CBE/Grade 10 students do not have KCPE scores.
            </p>
          </div>

          {/* KCPE Grade distribution chart */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">KCPE grade distribution by gender</h2>
            <GradeBandChart
              bands={grade_bands}
              femaleTotal={ov.female_with_kcpe}
              maleTotal={ov.male_with_kcpe}
            />
          </div>
        </div>
      )}

      {/* ══════════ STREAM BREAKDOWN ══════════ */}
      {tab === 'Stream Breakdown' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {streams.map(s => {
              const kcpeGap = s.female_avg_kcpe !== null && s.male_avg_kcpe !== null
                ? s.female_avg_kcpe - s.male_avg_kcpe
                : null
              const genderLeader = kcpeGap === null ? null : kcpeGap > 0 ? 'female' : kcpeGap < 0 ? 'male' : null

              return (
                <div
                  key={s.stream_id}
                  className="bg-white rounded-xl border border-gray-200 p-5"
                >
                  {/* Stream header */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-semibold text-gray-800">{s.stream_name}</h3>
                      <p className="text-xs text-gray-400">{s.total} students enrolled</p>
                    </div>
                    {kcpeGap !== null && Math.abs(kcpeGap) > 0 && (
                      <span
                        className="text-xs font-semibold px-2 py-1 rounded-full"
                        style={{
                          background: genderLeader === 'female' ? F_LIGHT : M_LIGHT,
                          color: genderLeader === 'female' ? '#9d174d' : '#1e3a8a',
                          border: `1px solid ${genderLeader === 'female' ? F_BORDER : M_BORDER}`,
                        }}
                      >
                        {genderLeader === 'female' ? '♀' : '♂'} +{Math.abs(kcpeGap).toFixed(1)} pts
                      </span>
                    )}
                  </div>

                  {/* Count comparison */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div
                      className="rounded-lg p-3 text-center"
                      style={{ background: F_LIGHT, border: `1px solid ${F_BORDER}` }}
                    >
                      <div className="text-xl font-bold" style={{ color: F_COLOR }}>{s.female_count}</div>
                      <div className="text-xs text-gray-500">Girls ({s.female_pct}%)</div>
                    </div>
                    <div
                      className="rounded-lg p-3 text-center"
                      style={{ background: M_LIGHT, border: `1px solid ${M_BORDER}` }}
                    >
                      <div className="text-xl font-bold" style={{ color: M_COLOR }}>{s.male_count}</div>
                      <div className="text-xs text-gray-500">Boys ({(100 - s.female_pct).toFixed(1)}%)</div>
                    </div>
                  </div>

                  {/* KCPE comparison */}
                  <CompareBar
                    label="Avg KCPE score (out of 500)"
                    femaleVal={s.female_avg_kcpe}
                    maleVal={s.male_avg_kcpe}
                    max={500}
                  />

                  {/* CBE note */}
                  {(s.female_cbe + s.male_cbe) > 0 && (
                    <div className="mt-2 text-xs text-gray-400">
                      +{s.female_cbe + s.male_cbe} Grade 10 students (no KCPE score)
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* All-streams summary table */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Summary table</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-medium">Stream</th>
                  <th className="text-right py-2 pr-4 font-medium">Total</th>
                  <th className="text-right py-2 pr-4 font-medium" style={{ color: F_COLOR }}>♀ Girls</th>
                  <th className="text-right py-2 pr-4 font-medium" style={{ color: M_COLOR }}>♂ Boys</th>
                  <th className="text-right py-2 pr-4 font-medium" style={{ color: F_COLOR }}>♀ Avg KCPE</th>
                  <th className="text-right py-2 pr-4 font-medium" style={{ color: M_COLOR }}>♂ Avg KCPE</th>
                  <th className="text-right py-2 font-medium">Gap</th>
                </tr>
              </thead>
              <tbody>
                {streams.map(s => {
                  const gap = s.female_avg_kcpe !== null && s.male_avg_kcpe !== null
                    ? s.female_avg_kcpe - s.male_avg_kcpe : null
                  return (
                    <tr key={s.stream_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium text-gray-800">{s.stream_name}</td>
                      <td className="py-2 pr-4 text-right text-gray-600">{s.total}</td>
                      <td className="py-2 pr-4 text-right font-medium" style={{ color: F_COLOR }}>{s.female_count}</td>
                      <td className="py-2 pr-4 text-right font-medium" style={{ color: M_COLOR }}>{s.male_count}</td>
                      <td className="py-2 pr-4 text-right">{s.female_avg_kcpe?.toFixed(1) ?? '—'}</td>
                      <td className="py-2 pr-4 text-right">{s.male_avg_kcpe?.toFixed(1) ?? '—'}</td>
                      <td className="py-2 text-right">
                        {gap !== null ? (
                          <span className={`font-semibold text-xs ${gap > 0 ? 'text-pink-600' : gap < 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                            {gap > 0 ? `♀ +${gap.toFixed(1)}` : gap < 0 ? `♂ +${Math.abs(gap).toFixed(1)}` : '='}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
                {/* Totals row */}
                <tr className="border-t-2 border-gray-200 font-semibold text-gray-700">
                  <td className="py-2 pr-4">All streams</td>
                  <td className="py-2 pr-4 text-right">{ov.total}</td>
                  <td className="py-2 pr-4 text-right" style={{ color: F_COLOR }}>{ov.female_count}</td>
                  <td className="py-2 pr-4 text-right" style={{ color: M_COLOR }}>{ov.male_count}</td>
                  <td className="py-2 pr-4 text-right">{ov.female_avg_kcpe?.toFixed(1) ?? '—'}</td>
                  <td className="py-2 pr-4 text-right">{ov.male_avg_kcpe?.toFixed(1) ?? '—'}</td>
                  <td className="py-2 text-right">
                    {ov.kcpe_gap !== null && (
                      <span className={`font-semibold text-xs ${ov.kcpe_gap > 0 ? 'text-pink-600' : ov.kcpe_gap < 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                        {ov.kcpe_gap > 0 ? `♀ +${ov.kcpe_gap.toFixed(1)}` : ov.kcpe_gap < 0 ? `♂ +${Math.abs(ov.kcpe_gap).toFixed(1)}` : '='}
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════ PATHWAY INCLINATION ══════════ */}
      {tab === 'Pathway Inclination' && (
        <div className="space-y-6">
          {/* Methodology note */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <span className="font-semibold">How pathway inclination is calculated: </span>
            Based on KCPE entry scores — students scoring ≥ 310 are classified as <b>STEM-ready</b>,
            230–309 as <b>Social Sciences</b>, and below 230 as <b>Arts & Sports</b>.
            Grade 10 / CBE students (no KCPE) are shown separately as <b>CBE</b>.
            These are <em>preliminary inclinations</em> that should be validated with actual subject marks.
          </div>

          {/* Pathway cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {pathway_inclination.map(p => {
              const c = PATHWAY_COLORS[p.pathway] ?? PATHWAY_COLORS.CBE
              const femTotal = ov.female_count
              const malTotal = ov.male_count
              const fPct = femTotal > 0 ? Math.round((p.female_count / femTotal) * 100) : 0
              const mPct = malTotal > 0 ? Math.round((p.male_count   / malTotal) * 100) : 0
              return (
                <div key={p.pathway} className="rounded-xl border p-4" style={{ background: c.bg, borderColor: c.border }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">{c.icon}</span>
                    <div>
                      <div className="font-semibold text-sm" style={{ color: c.text }}>{p.label}</div>
                      <div className="text-xs" style={{ color: c.text, opacity: 0.7 }}>{p.total} students</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-xs mb-0.5" style={{ color: c.text }}>
                        <span>♀ Girls</span><span>{p.female_count} ({fPct}%)</span>
                      </div>
                      {pctBar(fPct, F_COLOR, 6)}
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-0.5" style={{ color: c.text }}>
                        <span>♂ Boys</span><span>{p.male_count} ({mPct}%)</span>
                      </div>
                      {pctBar(mPct, M_COLOR, 6)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Dominant pathway insight */}
          {topFemPath && topMalPath && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border p-4" style={{ background: F_LIGHT, borderColor: F_BORDER }}>
                <div className="text-xs font-semibold mb-1" style={{ color: F_COLOR }}>♀ Girls — top pathway inclination</div>
                <div className="text-lg font-bold text-gray-800">
                  {PATHWAY_COLORS[topFemPath.pathway]?.icon} {topFemPath.label}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {topFemPath.female_count} girls ({Math.round((topFemPath.female_count / ov.female_count) * 100)}% of all girls)
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {topFemPath.pathway === 'STEM'
                    ? 'Strong STEM aptitude at entry — invest in Science and Math mentorship.'
                    : topFemPath.pathway === 'Social_Sciences'
                    ? 'Social Sciences is the largest group — consider enriching Business, Geography, and Languages.'
                    : topFemPath.pathway === 'Arts_Sports'
                    ? 'Many girls may benefit from additional academic support alongside creative programmes.'
                    : 'CBE Grade 10 students — pathway formal selection starts in Grade 11.'}
                </p>
              </div>
              <div className="rounded-xl border p-4" style={{ background: M_LIGHT, borderColor: M_BORDER }}>
                <div className="text-xs font-semibold mb-1" style={{ color: M_COLOR }}>♂ Boys — top pathway inclination</div>
                <div className="text-lg font-bold text-gray-800">
                  {PATHWAY_COLORS[topMalPath.pathway]?.icon} {topMalPath.label}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {topMalPath.male_count} boys ({Math.round((topMalPath.male_count / ov.male_count) * 100)}% of all boys)
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {topMalPath.pathway === 'STEM'
                    ? 'Strong STEM entry scores — ensure access to Physics, Chemistry, and Tech subjects.'
                    : topMalPath.pathway === 'Social_Sciences'
                    ? 'Social Sciences pathway fits most boys — explore History, Business, and Geography options.'
                    : topMalPath.pathway === 'Arts_Sports'
                    ? 'Many boys may need targeted literacy and numeracy support.'
                    : 'CBE Grade 10 students — pathway selection is formal from Grade 11 onwards.'}
                </p>
              </div>
            </div>
          )}

          {/* Pathway × Gender comparative table */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Pathway distribution — detailed breakdown
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-medium">Pathway</th>
                  <th className="text-right py-2 pr-4 font-medium" style={{ color: F_COLOR }}>♀ Girls</th>
                  <th className="text-right py-2 pr-4 font-medium" style={{ color: F_COLOR }}>% of girls</th>
                  <th className="text-right py-2 pr-4 font-medium" style={{ color: M_COLOR }}>♂ Boys</th>
                  <th className="text-right py-2 pr-4 font-medium" style={{ color: M_COLOR }}>% of boys</th>
                  <th className="text-right py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {pathway_inclination.map(p => {
                  const fPct = ov.female_count > 0 ? ((p.female_count / ov.female_count) * 100).toFixed(1) : '0'
                  const mPct = ov.male_count   > 0 ? ((p.male_count   / ov.male_count)   * 100).toFixed(1) : '0'
                  const c = PATHWAY_COLORS[p.pathway] ?? PATHWAY_COLORS.CBE
                  return (
                    <tr key={p.pathway} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-4">
                        <span className="flex items-center gap-2">
                          <span className="text-base">{c.icon}</span>
                          <span className="font-medium text-gray-800">{p.label}</span>
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right font-semibold" style={{ color: F_COLOR }}>{p.female_count}</td>
                      <td className="py-2 pr-4 text-right text-gray-500">{fPct}%</td>
                      <td className="py-2 pr-4 text-right font-semibold" style={{ color: M_COLOR }}>{p.male_count}</td>
                      <td className="py-2 pr-4 text-right text-gray-500">{mPct}%</td>
                      <td className="py-2 text-right text-gray-600 font-medium">{p.total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════ STEM SUBJECTS ══════════ */}
      {tab === 'STEM Subjects' && (
        <div className="space-y-6">
          {!has_marks ? (
            <>
              <EmptyMarksState label="Subject-level gender performance — awaiting marks data" />
              {/* Still show the STEM subject catalogue */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">
                  STEM subject catalogue
                  <span className="ml-2 text-xs text-gray-400 font-normal">(27 active STEM subjects)</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(data.subjects_by_category?.stem ?? []).map((s: { id: string; name: string; dept: string }) => (
                    <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-100 text-sm">
                      <span className="text-green-600 text-xs">⬡</span>
                      <div>
                        <div className="font-medium text-gray-700 text-xs">{s.name}</div>
                        <div className="text-xs text-gray-400">{s.dept}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Gender gap summary */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Female-led subjects', value: subject_marks.filter(s => (s.gap ?? 0) > 0).length, color: F_COLOR },
                  { label: 'Male-led subjects',   value: subject_marks.filter(s => (s.gap ?? 0) < 0).length, color: M_COLOR },
                  { label: 'Parity (gap < 2pt)',  value: subject_marks.filter(s => Math.abs(s.gap ?? 99) < 2).length, color: '#6b7280' },
                ].map(c => (
                  <div key={c.label} className="rounded-xl border border-gray-200 p-4">
                    <div className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
                  </div>
                ))}
              </div>

              {/* Subject-by-subject comparison */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">STEM subject performance by gender</h2>
                <div className="space-y-4">
                  {subject_marks
                    .sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0))
                    .map(s => (
                      <div key={s.subject_id}>
                        <CompareBar
                          label={s.name}
                          femaleVal={s.female_avg}
                          maleVal={s.male_avg}
                          max={100}
                        />
                      </div>
                    ))}
                </div>
              </div>

              {/* Detail table */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left py-2 pr-4 font-medium">Subject</th>
                      <th className="text-left py-2 pr-4 font-medium">Dept</th>
                      <th className="text-right py-2 pr-4 font-medium" style={{ color: F_COLOR }}>♀ Avg %</th>
                      <th className="text-right py-2 pr-4 font-medium" style={{ color: F_COLOR }}>♀ n</th>
                      <th className="text-right py-2 pr-4 font-medium" style={{ color: M_COLOR }}>♂ Avg %</th>
                      <th className="text-right py-2 pr-4 font-medium" style={{ color: M_COLOR }}>♂ n</th>
                      <th className="text-right py-2 font-medium">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subject_marks.map(s => (
                      <tr key={s.subject_id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 pr-4 font-medium text-gray-800">{s.name}</td>
                        <td className="py-2 pr-4 text-xs text-gray-400">{s.dept}</td>
                        <td className="py-2 pr-4 text-right" style={{ color: F_COLOR }}>
                          {s.female_avg !== null ? s.female_avg.toFixed(1) : '—'}
                        </td>
                        <td className="py-2 pr-4 text-right text-gray-400 text-xs">{s.female_count}</td>
                        <td className="py-2 pr-4 text-right" style={{ color: M_COLOR }}>
                          {s.male_avg !== null ? s.male_avg.toFixed(1) : '—'}
                        </td>
                        <td className="py-2 pr-4 text-right text-gray-400 text-xs">{s.male_count}</td>
                        <td className="py-2 text-right">
                          {s.gap !== null ? (
                            <span className={`text-xs font-semibold ${s.gap > 0 ? 'text-pink-600' : s.gap < 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                              {s.gap > 0 ? `♀ +${s.gap.toFixed(1)}` : s.gap < 0 ? `♂ +${Math.abs(s.gap).toFixed(1)}` : '='}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Gender equity insight box */}
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
            <div className="font-semibold mb-1">📌 Pathway inclination insight</div>
            <p>
              Girls at this school enter with a <strong>{ov.kcpe_gap !== null && ov.kcpe_gap > 0 ? `${ov.kcpe_gap}-point KCPE advantage` : 'comparable KCPE profile'}</strong> over boys.
              Monitoring subject-level marks once entered will show whether this entry advantage translates
              into higher STEM performance — or whether girls face drop-off in
              Physics, Chemistry, or Technical subjects, which is a common pattern nationally.
              Early intervention in Form 2–3 can prevent STEM dropout.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
