'use client'

import { useState, useCallback } from 'react'

type DeptVelocity = { dept: string; velocity: number }
type BomData = {
  school:         { name: string; county: string }
  term:           string
  generated_at:   string
  total_staff:    number
  total_students: number
  narrative:      string
  integrity_hash: string
  academic: {
    syllabus_velocity: number
    dept_velocity:     DeptVelocity[]
    top_performers:    number
    at_risk:           number
  }
  attendance: {
    student_rate:  number
    total_records: number
  }
  discipline: {
    total_incidents: number
    suspensions:     number
    recidivists:     number
    by_dept:         Record<string, number>
  }
  staffing: {
    teaching_staff:      number
    avg_appraisal_score: number | null
    rating_distribution: Record<string, number>
  }
  financial: {
    fee_collections:   number
    store_spend:       number
    store_by_category: Record<string, number>
  }
  health: {
    sick_bay_admissions: number
    outpatient_visits:   number
    total_visits:        number
  }
  talent: {
    total_points:       number
    recognised_students: number
    by_category:        Record<string, number>
  }
}

const RATING_STYLES: Record<string, { bg: string; text: string }> = {
  Exceeds:  { bg: '#dcfce7', text: '#15803d' },
  Meeting:  { bg: '#dbeafe', text: '#1d4ed8' },
  Needs:    { bg: '#fef9c3', text: '#a16207' },
  Critical: { bg: '#fee2e2', text: '#dc2626' },
}

function ScoreBar({ value, max = 100, color = '#0891b2' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div style={{ background: '#f1f5f9', borderRadius: 4, height: 8, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
    </div>
  )
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-black" style={{ color: color ?? '#111827' }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function printReport(data: BomData) {
  const html = `<!DOCTYPE html><html lang="en">
<head>
  <meta charset="utf-8" />
  <title>BOM Report — ${data.school.name} — ${data.term}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a202c; margin: 0; }
    h1 { font-size: 20px; font-weight: 900; color: #1e3a8a; margin: 0 0 2px; text-transform: uppercase; letter-spacing: 0.05em; }
    h2 { font-size: 13px; font-weight: 700; color: #374151; border-bottom: 2px solid #1e3a8a; padding-bottom: 4px; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 0.08em; }
    h3 { font-size: 11px; font-weight: 700; color: #4b5563; margin: 8px 0 4px; }
    .header { border-bottom: 3px double #1e3a8a; padding-bottom: 10px; margin-bottom: 14px; }
    .meta { font-size: 9px; color: #6b7280; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
    .kv { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dotted #f3f4f6; }
    .kv:last-child { border: none; }
    .narrative { background: #f8faff; border-left: 3px solid #1e3a8a; padding: 10px 14px; font-size: 11px; line-height: 1.7; color: #374151; margin: 8px 0 14px; }
    .bar-row { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
    .bar-track { flex: 1; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 3px; background: #1e3a8a; }
    .footer { position: fixed; bottom: 12mm; left: 16mm; right: 16mm; font-size: 8px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 5px; display: flex; justify-content: space-between; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 9px; font-weight: 600; margin: 1px; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${data.school.name}</h1>
    <p class="meta">${data.school.county} · Board of Management Report · ${data.term}</p>
    <p class="meta">Generated: ${new Date(data.generated_at).toLocaleString('en-KE')} &nbsp;|&nbsp; Students: ${data.total_students} &nbsp;|&nbsp; Staff: ${data.total_staff}</p>
  </div>

  <h2>Executive Summary</h2>
  <div class="narrative">${data.narrative.replace(/\n\n/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>')}</div>

  <div class="grid2">
    <div>
      <h2>Academic Performance</h2>
      <div class="card">
        <div class="kv"><span>Syllabus Velocity</span><strong>${data.academic.syllabus_velocity}%</strong></div>
        <div class="kv"><span>Top Performers (≥75%)</span><strong>${data.academic.top_performers}</strong></div>
        <div class="kv"><span>At-Risk Students (&lt;40%)</span><strong style="color:#dc2626">${data.academic.at_risk}</strong></div>
        <h3>By Department</h3>
        ${data.academic.dept_velocity.map(d => `
          <div class="bar-row">
            <span style="min-width:100px;font-size:9px">${d.dept}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${d.velocity}%"></div></div>
            <span style="font-size:9px;font-weight:700">${d.velocity}%</span>
          </div>`).join('')}
      </div>

      <h2>Attendance</h2>
      <div class="card">
        <div class="kv"><span>Student Attendance Rate</span><strong>${data.attendance.student_rate}%</strong></div>
        <div class="kv"><span>Total Records</span><strong>${data.attendance.total_records.toLocaleString()}</strong></div>
      </div>

      <h2>Discipline</h2>
      <div class="card">
        <div class="kv"><span>Total Incidents</span><strong>${data.discipline.total_incidents}</strong></div>
        <div class="kv"><span>Suspensions</span><strong>${data.discipline.suspensions}</strong></div>
        <div class="kv"><span>Recidivists</span><strong style="color:#dc2626">${data.discipline.recidivists}</strong></div>
        <h3>By Department</h3>
        ${Object.entries(data.discipline.by_dept).map(([dept, count]) => `
          <div class="kv"><span>${dept}</span><strong>${count}</strong></div>`).join('')}
      </div>
    </div>

    <div>
      <h2>Staffing</h2>
      <div class="card">
        <div class="kv"><span>Teaching Staff</span><strong>${data.staffing.teaching_staff}</strong></div>
        <div class="kv"><span>Avg Appraisal Score</span><strong>${data.staffing.avg_appraisal_score ?? 'N/A'}%</strong></div>
        <h3>Appraisal Distribution</h3>
        ${Object.entries(data.staffing.rating_distribution).map(([rating, count]) => `
          <div class="kv"><span>${rating}</span><strong>${count}</strong></div>`).join('')}
      </div>

      <h2>Financial</h2>
      <div class="card">
        <div class="kv"><span>Fee Collections</span><strong>KES ${data.financial.fee_collections.toLocaleString()}</strong></div>
        <div class="kv"><span>Store Spend</span><strong>KES ${data.financial.store_spend.toLocaleString()}</strong></div>
        <h3>Store by Category</h3>
        ${Object.entries(data.financial.store_by_category).map(([cat, amt]) => `
          <div class="kv"><span>${cat}</span><strong>KES ${amt.toLocaleString()}</strong></div>`).join('')}
      </div>

      <h2>Health</h2>
      <div class="card">
        <div class="kv"><span>Total Visits</span><strong>${data.health.total_visits}</strong></div>
        <div class="kv"><span>Sick Bay Admissions</span><strong>${data.health.sick_bay_admissions}</strong></div>
        <div class="kv"><span>Outpatient Visits</span><strong>${data.health.outpatient_visits}</strong></div>
      </div>

      <h2>Talent & Recognition</h2>
      <div class="card">
        <div class="kv"><span>Total Points Awarded</span><strong>${data.talent.total_points}</strong></div>
        <div class="kv"><span>Students Recognised</span><strong>${data.talent.recognised_students}</strong></div>
        <h3>By Category</h3>
        ${Object.entries(data.talent.by_category).map(([cat, pts]) => `
          <div class="kv"><span>${cat}</span><strong>${pts} pts</strong></div>`).join('')}
      </div>
    </div>
  </div>

  <div class="footer">
    <span>${data.school.name} · ${data.term} · Powered by Sychar</span>
    <span>SHA-256: ${data.integrity_hash.slice(0, 20)}…</span>
    <span>Page <span class="pageNumber"></span></span>
  </div>
</body></html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 600)
}

export default function BomReportPage() {
  const [data,       setData]       = useState<BomData | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  const generate = useCallback(async () => {
    setLoading(true); setError('')
    // Get school_id from session cookie (cached)
    const schoolId = document.cookie.match(/sychar_school_id=([^;]+)/)?.[1] ?? ''
    if (!schoolId) { setError('School ID not found — reload the page'); setLoading(false); return }
    const r = await fetch(`/api/principal/bom-report?school_id=${encodeURIComponent(schoolId)}`)
    if (r.ok) {
      const d = await r.json()
      setData(d)
    } else {
      const d = await r.json()
      setError(d.error ?? 'Failed to generate report')
    }
    setLoading(false)
  }, [])

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">BOM Report</h1>
          <p className="text-xs text-gray-500">Board of Management · Current term summary</p>
        </div>
        <div className="flex gap-2">
          {data && (
            <button onClick={() => printReport(data)}
              className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900">
              Download PDF
            </button>
          )}
          <button onClick={generate} disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-blue-700">
            {loading ? 'Generating…' : data ? 'Regenerate' : 'Generate BOM Report'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
      )}

      {loading && (
        <div className="bg-white rounded-xl border p-8 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Compiling all modules and generating AI narrative…</p>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-5">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white rounded-xl p-5">
            <p className="text-blue-200 text-xs uppercase tracking-widest mb-1">Board of Management Report</p>
            <h2 className="text-xl font-black">{data.school.name}</h2>
            <p className="text-blue-200 text-sm">{data.term} · {data.school.county}</p>
            <div className="flex gap-4 mt-3 text-sm">
              <span><strong>{data.total_students}</strong> students</span>
              <span><strong>{data.total_staff}</strong> staff</span>
              <span className="text-blue-300 text-xs ml-auto">
                Generated {new Date(data.generated_at).toLocaleString('en-KE')}
              </span>
            </div>
          </div>

          {/* AI Narrative */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-3">AI Executive Summary</p>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2 whitespace-pre-line">{data.narrative}</div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Syllabus Velocity" value={`${data.academic.syllabus_velocity}%`}
              color={data.academic.syllabus_velocity >= 70 ? '#15803d' : data.academic.syllabus_velocity >= 50 ? '#a16207' : '#dc2626'} />
            <SummaryCard label="Student Attendance" value={`${data.attendance.student_rate}%`}
              color={data.attendance.student_rate >= 80 ? '#15803d' : '#a16207'} />
            <SummaryCard label="Discipline Incidents" value={data.discipline.total_incidents}
              sub={`${data.discipline.suspensions} suspensions`} />
            <SummaryCard label="Students Recognised" value={data.talent.recognised_students}
              sub={`${data.talent.total_points} total points`} color="#7c3aed" />
          </div>

          {/* Academic */}
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-bold text-gray-900 mb-3">Academic — Syllabus by Department</h3>
            <div className="space-y-2">
              {data.academic.dept_velocity.map(d => (
                <div key={d.dept} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-32 shrink-0">{d.dept}</span>
                  <div className="flex-1">
                    <ScoreBar value={d.velocity}
                      color={d.velocity >= 70 ? '#15803d' : d.velocity >= 50 ? '#f59e0b' : '#dc2626'} />
                  </div>
                  <span className="text-xs font-bold w-10 text-right">{d.velocity}%</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-3 pt-3 border-t text-xs text-gray-600">
              <span><strong className="text-green-700">{data.academic.top_performers}</strong> top performers (≥75%)</span>
              <span><strong className="text-red-600">{data.academic.at_risk}</strong> at-risk (&lt;40%)</span>
            </div>
          </div>

          {/* Staffing appraisal distribution */}
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-bold text-gray-900 mb-3">
              Staffing Appraisals
              {data.staffing.avg_appraisal_score !== null && (
                <span className="text-sm font-normal text-gray-500 ml-2">avg {data.staffing.avg_appraisal_score}%</span>
              )}
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.staffing.rating_distribution).map(([rating, count]) => (
                <div key={rating} className="rounded-lg px-3 py-2 text-center min-w-20"
                  style={{ background: RATING_STYLES[rating]?.bg, color: RATING_STYLES[rating]?.text }}>
                  <p className="text-xl font-black">{count}</p>
                  <p className="text-xs font-semibold">{rating}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Financial */}
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-bold text-gray-900 mb-3">Financial</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Fee Collections</p>
                <p className="text-lg font-black text-green-700">KES {data.financial.fee_collections.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Store Spend</p>
                <p className="text-lg font-black text-gray-900">KES {data.financial.store_spend.toLocaleString()}</p>
              </div>
            </div>
            {Object.keys(data.financial.store_by_category).length > 0 && (
              <div className="mt-3 space-y-1">
                {Object.entries(data.financial.store_by_category).map(([cat, amt]) => (
                  <div key={cat} className="flex justify-between text-xs text-gray-600">
                    <span>{cat}</span><span className="font-semibold">KES {amt.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Health + Talent side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-bold text-gray-900 mb-3">Health</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Total visits</span><strong>{data.health.total_visits}</strong></div>
                <div className="flex justify-between"><span className="text-gray-500">Sick bay</span><strong>{data.health.sick_bay_admissions}</strong></div>
                <div className="flex justify-between"><span className="text-gray-500">Outpatient</span><strong>{data.health.outpatient_visits}</strong></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-bold text-gray-900 mb-3">Talent & Recognition</h3>
              <div className="space-y-1 text-xs">
                {Object.entries(data.talent.by_category).map(([cat, pts]) => (
                  <div key={cat} className="flex justify-between">
                    <span className="text-gray-600">{cat}</span>
                    <span className="font-bold text-purple-700">{pts} pts</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Integrity hash */}
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-400 font-mono">
            SHA-256: {data.integrity_hash}
          </div>
        </div>
      )}

      {!data && !loading && !error && (
        <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
          <p className="text-4xl mb-4">📋</p>
          <p className="text-sm font-medium text-gray-600">Click <strong>Generate BOM Report</strong> to compile the full term summary</p>
          <p className="text-xs mt-1">Pulls from all 8 modules + AI narrative · ~10 seconds</p>
        </div>
      )}
    </div>
  )
}
