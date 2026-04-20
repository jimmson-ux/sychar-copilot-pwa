'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useSchoolId } from '@/hooks/useSchoolId'
import { getGradeFromScore, getGradeColor, getGradePoints, STREAM_COLORS } from '@/lib/roles'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { SkeletonTable } from '@/components/ui/Skeleton'

interface StudentPrediction {
  id: string
  full_name: string
  admission_number: string | null
  stream_name: string
  avg: number
  predicted_grade: string
  points: number
  risk: 'low' | 'medium' | 'high'
  trend: string
}

const GRADE_ORDER = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E']
const GRADE_BG: Record<string, string> = {
  'A': '#16a34a', 'A-': '#22c55e', 'B+': '#2176FF', 'B': '#3b82f6',
  'B-': '#60a5fa', 'C+': '#d97706', 'C': '#f59e0b', 'C-': '#fbbf24',
  'D+': '#dc2626', 'D': '#ef4444', 'D-': '#f87171', 'E': '#7c3aed',
}

type FilterMode = 'all' | 'high_risk' | 'a_target'

export default function KcsePage() {
  const { schoolId } = useSchoolId()
  const [predictions, setPredictions] = useState<StudentPrediction[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [aiRec, setAiRec] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => { if (!schoolId) return; loadPredictions() }, [schoolId])

  async function loadPredictions() {
    setLoading(true)
    const supabase = createClient()

    const { data: students } = await supabase
      .from('students')
      .select('id, full_name, admission_number, class_name, stream_name, gender')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .ilike('class_name', 'Form 4%')

    if (!students?.length) { setLoading(false); return }

    const { data: marks } = await supabase
      .from('marks')
      .select('student_id, score, created_at')
      .in('student_id', students.map(s => s.id))
      .not('score', 'is', null)
      .order('created_at', { ascending: false })

    // Group marks by student, separate recent vs older for trend
    const marksByStudent: Record<string, number[]> = {}
    const recentByStudent: Record<string, number[]> = {}
    const olderByStudent: Record<string, number[]> = {}

    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 3)

    for (const m of marks ?? []) {
      if (!marksByStudent[m.student_id]) {
        marksByStudent[m.student_id] = []
        recentByStudent[m.student_id] = []
        olderByStudent[m.student_id] = []
      }
      marksByStudent[m.student_id].push(m.score)
      if (new Date(m.created_at) >= cutoff) {
        recentByStudent[m.student_id].push(m.score)
      } else {
        olderByStudent[m.student_id].push(m.score)
      }
    }

    const preds: StudentPrediction[] = students
      .filter(s => marksByStudent[s.id]?.length > 0)
      .map(s => {
        const scores = marksByStudent[s.id]
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        const grade = getGradeFromScore(avg)
        const points = getGradePoints(grade)

        const recentScores = recentByStudent[s.id]
        const olderScores = olderByStudent[s.id]
        const recentAvg = recentScores.length > 0 ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length : avg
        const olderAvg = olderScores.length > 0 ? olderScores.reduce((a, b) => a + b, 0) / olderScores.length : avg
        const trend = recentAvg > olderAvg + 3 ? '📈' : recentAvg < olderAvg - 3 ? '📉' : '➡️'

        const risk: 'low' | 'medium' | 'high' = avg < 40 ? 'high' : avg < 55 ? 'medium' : 'low'

        return {
          id: s.id,
          full_name: s.full_name,
          admission_number: s.admission_number,
          stream_name: s.stream_name,
          avg,
          predicted_grade: grade,
          points,
          risk,
          trend,
        }
      })
      .sort((a, b) => b.avg - a.avg)

    setPredictions(preds)
    setLoading(false)
  }

  async function analyseWithAI() {
    if (predictions.length === 0) return
    setAiLoading(true)
    setAiRec('')

    const gradeDistrib: Record<string, number> = {}
    predictions.forEach(p => {
      gradeDistrib[p.predicted_grade] = (gradeDistrib[p.predicted_grade] ?? 0) + 1
    })
    const highRisk = predictions.filter(p => p.risk === 'high').length
    const classAvg = Math.round(predictions.reduce((a, b) => a + b.avg, 0) / predictions.length)
    const meanGrade = predictions.length > 0
      ? GRADE_ORDER[Math.min(Math.round(predictions.reduce((a, b) => a + GRADE_ORDER.indexOf(b.predicted_grade), 0) / predictions.length), 11)]
      : 'C'

    const summary = `Form 4 Class of ${new Date().getFullYear()} — ${predictions.length} students.
Class average: ${classAvg}%. Predicted mean grade: ${meanGrade}.
Grade distribution: ${Object.entries(gradeDistrib).map(([g, n]) => `${g}: ${n}`).join(', ')}.
High-risk students (avg <40%): ${highRisk}.
Top student: ${predictions[0]?.full_name} at ${predictions[0]?.avg}% (${predictions[0]?.predicted_grade}).`

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Based on this Form 4 KCSE prediction summary, provide 5 specific, actionable interventions to improve the class mean grade. Focus on students at risk. Be concise and practical for a Kenyan secondary school context.\n\n${summary}`,
          }],
        }),
      })
      const json = await res.json()
      setAiRec(json.content || 'Unable to generate recommendations.')
    } catch {
      setAiRec('Error fetching recommendations.')
    }
    setAiLoading(false)
  }

  // Grade distribution chart data
  const gradeData = GRADE_ORDER.map(g => ({
    grade: g,
    count: predictions.filter(p => p.predicted_grade === g).length,
    color: GRADE_BG[g],
  })).filter(d => d.count > 0)

  const filtered = predictions.filter(p => {
    if (filter === 'high_risk') return p.risk === 'high' || p.risk === 'medium'
    if (filter === 'a_target') return p.avg >= 65
    return true
  })

  const highRiskCount = predictions.filter(p => p.risk === 'high').length
  const aTargetCount = predictions.filter(p => p.avg >= 65).length

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          KCSE Predictions
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Form 4 — predicted grades based on current marks
        </p>
      </div>

      {loading ? <SkeletonTable rows={8} /> : (
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total Candidates', value: predictions.length, icon: '🎓', color: '#0891b2' },
              { label: 'High Risk', value: highRiskCount, icon: '⚠️', color: '#dc2626' },
              { label: 'A Grade Target', value: aTargetCount, icon: '⭐', color: '#16a34a' },
            ].map(s => (
              <div key={s.label} style={{ background: 'white', border: `1px solid #f1f5f9`, borderRadius: 12, padding: '16px', borderLeft: `4px solid ${s.color}` }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: s.color, fontFamily: 'Space Grotesk, sans-serif' }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Grade distribution chart */}
          <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: 20, marginBottom: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 16, fontFamily: 'Space Grotesk, sans-serif' }}>
              Grade Distribution
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={gradeData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="grade" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                <Tooltip formatter={(v) => [`${v} students`, 'Count']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {gradeData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* AI Intervention */}
          <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: aiRec ? 16 : 0 }}>
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
                  AI Intervention Plan
                </h2>
                <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Get AI-powered recommendations to boost KCSE performance</p>
              </div>
              <button
                onClick={analyseWithAI}
                disabled={aiLoading}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #0891b2)', color: 'white',
                  border: 'none', borderRadius: 10, padding: '10px 18px',
                  fontSize: 13, fontWeight: 600, cursor: aiLoading ? 'not-allowed' : 'pointer',
                  opacity: aiLoading ? 0.7 : 1,
                }}
              >{aiLoading ? '🤖 Analysing...' : '🤖 Analyse Now'}</button>
            </div>
            {aiRec && (
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, fontSize: 13, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {aiRec}
              </div>
            )}
          </div>

          {/* Filter buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[
              { key: 'all', label: `All (${predictions.length})` },
              { key: 'high_risk', label: `⚠️ High Risk (${highRiskCount})` },
              { key: 'a_target', label: `⭐ A-Grade Target (${aTargetCount})` },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key as FilterMode)} style={{
                padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: filter === f.key ? 'none' : '1px solid #e5e7eb',
                background: filter === f.key ? 'var(--role-primary, #0891b2)' : 'white',
                color: filter === f.key ? 'white' : '#374151', cursor: 'pointer',
              }}>{f.label}</button>
            ))}
          </div>

          {/* Table */}
          <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Rank', 'Student', 'Stream', 'Average', 'Predicted Grade', 'Risk', 'Trend'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const streamColor = STREAM_COLORS[p.stream_name] ?? '#6b7280'
                  const gradeColor = getGradeColor(p.predicted_grade)
                  const riskColor = p.risk === 'high' ? '#dc2626' : p.risk === 'medium' ? '#d97706' : '#16a34a'
                  const riskBg = p.risk === 'high' ? '#fee2e2' : p.risk === 'medium' ? '#fef3c7' : '#dcfce7'
                  return (
                    <tr key={p.id}
                      style={{ borderBottom: '1px solid #f9fafb' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#6b7280' }}>#{i + 1}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{p.full_name}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{p.admission_number}</div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${streamColor}20`, color: streamColor }}>
                          {p.stream_name}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: gradeColor, fontSize: 15 }}>{p.avg}%</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: gradeColor }}>{p.predicted_grade}</span>
                        <span style={{ marginLeft: 6, fontSize: 11, color: '#6b7280' }}>{p.points} pts</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: riskBg, color: riskColor, textTransform: 'capitalize' }}>
                          {p.risk}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 18 }}>{p.trend}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
