'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface Bucket {
  punctuality_status: string
  count: number
}

interface Props {
  schoolId: string
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  on_time:       { label: 'On Time',      color: '#16a34a' },
  slightly_late: { label: 'Slightly Late', color: '#d97706' },
  late:          { label: 'Late',          color: '#ea580c' },
  very_late:     { label: 'Very Late',     color: '#dc2626' },
  no_show:       { label: 'No-Show',       color: '#7f1d1d' },
}

export default function SchoolPunctualityOverview({ schoolId }: Props) {
  const [data,    setData]    = useState<Bucket[]>([])
  const [summary, setSummary] = useState<{ thisWeekPct: number; lastWeekPct: number; worstPeriod: string | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!schoolId) return
    fetch('/api/compliance/punctuality-overview')
      .then(r => r.json())
      .then((j: unknown) => {
        const data = j as { buckets?: Bucket[]; summary?: { thisWeekPct: number; lastWeekPct: number; worstPeriod: string | null } }
        setData(data.buckets ?? [])
        setSummary(data.summary ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [schoolId])

  const chartData = Object.entries(STATUS_MAP).map(([key, cfg]) => ({
    name:  cfg.label,
    count: data.find(d => d.punctuality_status === key)?.count ?? 0,
    color: cfg.color,
  }))

  const total    = chartData.reduce((s, d) => s + d.count, 0)
  const onTimeN  = chartData.find(d => d.name === 'On Time')?.count ?? 0
  const onTimePct = total ? Math.round(onTimeN * 100 / total) : 0

  if (loading) return <div style={{ color: '#9ca3af', fontSize: 13, padding: 20 }}>Loading punctuality data...</div>

  return (
    <div style={{ background: 'white', borderRadius: 14, padding: '20px', border: '1px solid #f1f5f9' }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 4, fontFamily: 'Space Grotesk, sans-serif' }}>
        School-Wide Punctuality — This Week
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>Lesson sessions by start-time status</div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip formatter={(v) => [`${v} sessions`, 'Count']} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {summary && (
        <div style={{ marginTop: 14, padding: '12px 14px', background: '#f8fafc', borderRadius: 10, fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
          <div>
            This week: <strong>{summary.thisWeekPct ?? onTimePct}%</strong> of lessons started on time
          </div>
          {summary.lastWeekPct !== undefined && (
            <div>
              Last week: {summary.lastWeekPct}%{' '}
              <span style={{ color: summary.thisWeekPct >= summary.lastWeekPct ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                {summary.thisWeekPct >= summary.lastWeekPct ? '— improving ↑' : '— declining ↓'}
              </span>
            </div>
          )}
          {summary.worstPeriod && (
            <div style={{ color: '#d97706' }}>
              Worst period: <strong>{summary.worstPeriod}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
