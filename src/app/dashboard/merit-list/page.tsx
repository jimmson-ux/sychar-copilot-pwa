'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient, SCHOOL_ID } from '@/lib/supabase'
import { getGradeFromScore, getGradeColor, formatCurrency, STREAM_COLORS } from '@/lib/roles'
import { SkeletonTable } from '@/components/ui/Skeleton'

interface StudentResult {
  id: string
  full_name: string
  admission_number: string | null
  class_name: string
  stream_name: string
  gender: string | null
  avg: number
  grade: string
  subjectCount: number
  deviation: number
}

const FORMS = ['All', 'Form 3', 'Form 4', 'Grade 10']
const STREAMS = ['All', 'Champions', 'Achievers', 'Winners', 'Victors']
const EXAM_TYPES = ['All', 'opener', 'midterm', 'end_term', 'mock', 'kcse']

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function MeritListPage() {
  const [results, setResults] = useState<StudentResult[]>([])
  const [loading, setLoading] = useState(true)
  const [formFilter, setFormFilter] = useState('Form 4')
  const [streamFilter, setStreamFilter] = useState('All')
  const [examType, setExamType] = useState('All')

  useEffect(() => {
    loadResults()
  }, [formFilter, streamFilter, examType])

  async function loadResults() {
    setLoading(true)
    const supabase = createClient()

    // Fetch students
    let q = supabase
      .from('students')
      .select('id, full_name, admission_number, class_name, stream_name, gender')
      .eq('school_id', SCHOOL_ID)
      .eq('is_active', true)

    if (formFilter !== 'All') q = q.ilike('class_name', `${formFilter}%`)
    if (streamFilter !== 'All') q = q.eq('stream_name', streamFilter)

    const { data: students } = await q.order('full_name')
    if (!students || students.length === 0) { setResults([]); setLoading(false); return }

    const studentIds = students.map(s => s.id)

    // Fetch marks
    let mq = supabase
      .from('marks')
      .select('student_id, score')
      .in('student_id', studentIds)
      .not('score', 'is', null)

    if (examType !== 'All') mq = mq.eq('exam_type', examType)

    const { data: marks } = await mq

    // Aggregate per student
    const markMap: Record<string, number[]> = {}
    for (const m of marks ?? []) {
      if (!markMap[m.student_id]) markMap[m.student_id] = []
      markMap[m.student_id].push(m.score)
    }

    const allAvgs: number[] = []
    const resultList: StudentResult[] = students
      .filter(s => markMap[s.id]?.length > 0)
      .map(s => {
        const scores = markMap[s.id]
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        allAvgs.push(avg)
        return {
          id: s.id,
          full_name: s.full_name,
          admission_number: s.admission_number,
          class_name: s.class_name,
          stream_name: s.stream_name,
          gender: s.gender,
          avg,
          grade: getGradeFromScore(avg),
          subjectCount: scores.length,
          deviation: 0,
        }
      })
      .sort((a, b) => b.avg - a.avg)

    const classAvg = allAvgs.length > 0
      ? Math.round(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length)
      : 0

    resultList.forEach(r => { r.deviation = r.avg - classAvg })

    setResults(resultList)
    setLoading(false)
  }

  const classAvg = results.length > 0
    ? Math.round(results.reduce((a, b) => a + b.avg, 0) / results.length)
    : 0
  const boysAvg = (() => {
    const boys = results.filter(r => r.gender === 'male')
    return boys.length > 0 ? Math.round(boys.reduce((a, b) => a + b.avg, 0) / boys.length) : 0
  })()
  const girlsAvg = (() => {
    const girls = results.filter(r => r.gender === 'female')
    return girls.length > 0 ? Math.round(girls.reduce((a, b) => a + b.avg, 0) / girls.length) : 0
  })()

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          Merit List
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Student performance rankings
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Form filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          {FORMS.map(f => (
            <button key={f} onClick={() => setFormFilter(f)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: formFilter === f ? 'none' : '1px solid #e5e7eb',
              background: formFilter === f ? 'var(--role-primary, #0891b2)' : 'white',
              color: formFilter === f ? 'white' : '#374151', cursor: 'pointer',
            }}>{f}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {STREAMS.map(s => (
            <button key={s} onClick={() => setStreamFilter(s)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: streamFilter === s ? 'none' : '1px solid #e5e7eb',
              background: streamFilter === s ? 'var(--role-primary, #0891b2)' : 'white',
              color: streamFilter === s ? 'white' : '#374151', cursor: 'pointer',
            }}>{s}</button>
          ))}
        </div>
        <select
          value={examType}
          onChange={e => setExamType(e.target.value)}
          style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '6px 14px', fontSize: 13 }}
        >
          {EXAM_TYPES.map(t => <option key={t} value={t}>{t === 'All' ? 'All Exams' : t.replace('_', ' ')}</option>)}
        </select>
      </div>

      {loading ? <SkeletonTable rows={10} /> : results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>No results found</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Try changing the filters or checking if marks have been entered.</div>
        </div>
      ) : (
        <>
          {/* Podium — top 3 */}
          {results.length >= 3 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 16, marginBottom: 32, padding: '0 20px' }}>
              {[1, 0, 2].map(i => {
                const r = results[i]
                const heights = [100, 130, 80]
                const podiumH = heights[i === 0 ? 1 : i === 1 ? 0 : 2]
                const streamColor = STREAM_COLORS[r.stream_name] ?? '#6b7280'
                return (
                  <div key={r.id} style={{ textAlign: 'center', flex: 1, maxWidth: 180 }}>
                    <div style={{ fontSize: i === 1 ? 32 : 24, marginBottom: 8 }}>{MEDAL[i + 1]}</div>
                    <div style={{
                      background: 'white', border: `2px solid ${streamColor}`,
                      borderRadius: 12, padding: '12px 8px', marginBottom: 8,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{r.full_name.split(' ')[0]}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{r.class_name}</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: getGradeColor(r.grade), marginTop: 4 }}>{r.avg}%</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: getGradeColor(r.grade) }}>{r.grade}</div>
                    </div>
                    <div style={{
                      height: podiumH, background: streamColor,
                      borderRadius: '8px 8px 0 0', opacity: 0.85,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontWeight: 700, fontSize: 18,
                    }}>#{i + 1}</div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Students Ranked', value: results.length, icon: '👥' },
              { label: 'Class Average', value: `${classAvg}%`, icon: '📊' },
              { label: 'Boys Average', value: `${boysAvg}%`, icon: '👦' },
              { label: 'Girls Average', value: `${girlsAvg}%`, icon: '👧' },
            ].map(s => (
              <div key={s.label} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Ranked table */}
          <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Rank', 'Student', 'Stream', 'Subjects', 'Average', 'Grade', 'Deviation'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const streamColor = STREAM_COLORS[r.stream_name] ?? '#6b7280'
                  const rank = i + 1
                  return (
                    <tr key={r.id}
                      style={{ borderBottom: '1px solid #f9fafb' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {MEDAL[rank] ? (
                            <span style={{ fontSize: 18 }}>{MEDAL[rank]}</span>
                          ) : (
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', width: 24, textAlign: 'center' }}>#{rank}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{r.full_name}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{r.admission_number ?? ''} · {r.class_name}</div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: `${streamColor}20`, color: streamColor,
                        }}>{r.stream_name}</span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#6b7280' }}>{r.subjectCount}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: getGradeColor(r.grade) }}>{r.avg}%</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                          background: `${getGradeColor(r.grade)}15`, color: getGradeColor(r.grade),
                        }}>{r.grade}</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontWeight: 600, color: r.deviation >= 0 ? '#16a34a' : '#dc2626', fontSize: 13 }}>
                          {r.deviation >= 0 ? '+' : ''}{r.deviation}
                        </span>
                      </td>
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
