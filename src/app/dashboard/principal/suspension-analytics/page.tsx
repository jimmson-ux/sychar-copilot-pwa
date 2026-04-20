'use client'

import { useState, useEffect, useCallback } from 'react'

type Analytics = {
  summary: {
    total_cases: number; approved: number; pending: number;
    avg_duration_days: number | null; recidivist_count: number; since: string;
  };
  class_ranking: { class_name: string; count: number }[];
  allegation_heatmap: { type: string; count: number }[];
  recidivists: { student_id: string; suspension_count: number; full_name: string; class_name: string }[];
  monthly_trend: { month: string; count: number }[];
  insights: { severity: 'high' | 'medium' | 'low'; message: string }[];
}

const SEVERITY_STYLES: Record<string, string> = {
  high:   'bg-red-50 border-l-4 border-l-red-500 text-red-800',
  medium: 'bg-yellow-50 border-l-4 border-l-yellow-500 text-yellow-800',
  low:    'bg-green-50 border-l-4 border-l-green-500 text-green-800',
}

export default function SuspensionAnalyticsPage() {
  const [data, setData]     = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [since, setSince]   = useState('')

  const load = useCallback(async (sinceDate?: string) => {
    setLoading(true)
    const q = sinceDate ? `?since=${sinceDate}` : ''
    const r = await fetch(`/api/principal/suspension-analytics${q}`)
    if (r.ok) { const d = await r.json(); setData(d) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">Loading analytics…</div>
  if (!data)   return <div className="p-8 text-center text-red-500 text-sm">Failed to load</div>

  const maxCount = Math.max(...data.monthly_trend.map(t => t.count), 1)

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Suspension Analytics</h1>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Since:</label>
          <input type="date" value={since} onChange={e => setSince(e.target.value)}
            className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={() => load(since || undefined)}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
            Filter
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Cases', value: data.summary.total_cases, color: 'text-gray-900' },
          { label: 'Approved',    value: data.summary.approved,    color: 'text-green-600' },
          { label: 'Pending',     value: data.summary.pending,     color: 'text-blue-600' },
          { label: 'Recidivists', value: data.summary.recidivist_count, color: 'text-red-600' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl p-4 shadow-sm border text-center">
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {data.summary.avg_duration_days !== null && (
        <p className="text-sm text-gray-600 text-center">
          Average suspension duration: <span className="font-semibold">{data.summary.avg_duration_days} days</span>
        </p>
      )}

      {/* AI Insights */}
      {data.insights.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Insights</p>
          {data.insights.map((ins, i) => (
            <div key={i} className={`rounded-lg p-3 text-sm ${SEVERITY_STYLES[ins.severity]}`}>
              {ins.message}
            </div>
          ))}
        </div>
      )}

      {/* Monthly trend */}
      {data.monthly_trend.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Monthly Trend</p>
          <div className="flex items-end gap-2 h-24">
            {data.monthly_trend.map(m => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-600 font-medium">{m.count}</span>
                <div className="w-full bg-blue-500 rounded-t"
                  style={{ height: `${Math.round((m.count / maxCount) * 72)}px`, minHeight: m.count > 0 ? '4px' : '0' }} />
                <span className="text-xs text-gray-400">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Class ranking */}
        {data.class_ranking.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">By Class</p>
            <div className="space-y-2">
              {data.class_ranking.slice(0, 8).map(c => (
                <div key={c.class_name} className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 w-16 truncate">{c.class_name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-orange-500 h-2 rounded-full"
                      style={{ width: `${Math.round((c.count / data.class_ranking[0].count) * 100)}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-4 text-right">{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Allegation heatmap */}
        {data.allegation_heatmap.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top Allegation Types</p>
            <div className="space-y-2">
              {data.allegation_heatmap.map(a => (
                <div key={a.type} className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 capitalize w-24 truncate">{a.type}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-red-500 h-2 rounded-full"
                      style={{ width: `${Math.round((a.count / data.allegation_heatmap[0].count) * 100)}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-4 text-right">{a.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recidivists */}
      {data.recidivists.length > 0 && (
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Recidivists ({data.recidivists.length})
          </p>
          <div className="space-y-2">
            {data.recidivists.map(r => (
              <div key={r.student_id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.full_name}</p>
                  <p className="text-xs text-gray-500">{r.class_name}</p>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-bold ${r.suspension_count >= 3 ? 'text-red-600' : 'text-orange-500'}`}>
                    {r.suspension_count}x
                  </span>
                  {r.suspension_count >= 3 && (
                    <p className="text-xs text-red-500">G&C required</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
