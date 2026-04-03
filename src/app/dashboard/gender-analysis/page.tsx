'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient, SCHOOL_ID } from '@/lib/supabase'
import { getGradeFromScore, SUBJECT_COLORS } from '@/lib/roles'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { SkeletonTable } from '@/components/ui/Skeleton'

interface FormStats {
  form: string
  boys: number
  girls: number
  boysAvg: number
  girlsAvg: number
  boysCount: number
  girlsCount: number
}

interface SubjectGap {
  subject: string
  boysAvg: number
  girlsAvg: number
  gap: number
  isStem: boolean
}

const STEM_SUBJECTS = ['mathematics', 'physics', 'chemistry', 'biology', 'computer']

export default function GenderAnalysisPage() {
  const [loading, setLoading] = useState(true)
  const [formStats, setFormStats] = useState<FormStats[]>([])
  const [subjectGaps, setSubjectGaps] = useState<SubjectGap[]>([])
  const [totalBoys, setTotalBoys] = useState(0)
  const [totalGirls, setTotalGirls] = useState(0)
  const [overallBoysAvg, setOverallBoysAvg] = useState(0)
  const [overallGirlsAvg, setOverallGirlsAvg] = useState(0)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()

    const { data: students } = await supabase
      .from('students')
      .select('id, class_name, gender')
      .eq('school_id', SCHOOL_ID)
      .eq('is_active', true)

    if (!students?.length) { setLoading(false); return }

    const studentIds = students.map(s => s.id)
    const genderMap: Record<string, { gender: string; form: string }> = {}
    for (const s of students) {
      const form = s.class_name?.match(/Form \d|Grade \d+/)?.[0] ?? 'Other'
      genderMap[s.id] = { gender: s.gender ?? 'unknown', form }
    }

    // Count boys/girls
    const boys = students.filter(s => s.gender === 'male')
    const girls = students.filter(s => s.gender === 'female')
    setTotalBoys(boys.length)
    setTotalGirls(girls.length)

    const { data: marks } = await supabase
      .from('marks')
      .select('student_id, score, subject')
      .in('student_id', studentIds)
      .not('score', 'is', null)

    if (!marks?.length) { setLoading(false); return }

    // Compute per-form stats
    const formMap: Record<string, { boysScores: number[]; girlsScores: number[] }> = {}
    const subjectMap: Record<string, { boysScores: number[]; girlsScores: number[] }> = {}

    for (const m of marks) {
      const info = genderMap[m.student_id]
      if (!info) continue
      const { gender, form } = info

      if (!formMap[form]) formMap[form] = { boysScores: [], girlsScores: [] }
      if (gender === 'male') formMap[form].boysScores.push(m.score)
      else if (gender === 'female') formMap[form].girlsScores.push(m.score)

      const subj = m.subject ?? 'Unknown'
      if (!subjectMap[subj]) subjectMap[subj] = { boysScores: [], girlsScores: [] }
      if (gender === 'male') subjectMap[subj].boysScores.push(m.score)
      else if (gender === 'female') subjectMap[subj].girlsScores.push(m.score)
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0

    const fStats: FormStats[] = Object.entries(formMap)
      .filter(([, v]) => v.boysScores.length > 0 || v.girlsScores.length > 0)
      .map(([form, v]) => ({
        form,
        boys: v.boysScores.length,
        girls: v.girlsScores.length,
        boysAvg: avg(v.boysScores),
        girlsAvg: avg(v.girlsScores),
        boysCount: v.boysScores.length,
        girlsCount: v.girlsScores.length,
      }))
      .sort((a, b) => a.form.localeCompare(b.form))

    setFormStats(fStats)

    // Compute subject gaps
    const sGaps: SubjectGap[] = Object.entries(subjectMap)
      .filter(([, v]) => v.boysScores.length >= 3 && v.girlsScores.length >= 3)
      .map(([subject, v]) => {
        const ba = avg(v.boysScores)
        const ga = avg(v.girlsScores)
        return {
          subject,
          boysAvg: ba,
          girlsAvg: ga,
          gap: Math.abs(ba - ga),
          isStem: STEM_SUBJECTS.some(s => subject.toLowerCase().includes(s)),
        }
      })
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 15)

    setSubjectGaps(sGaps)

    // Overall averages
    const allBoysScores = marks.filter(m => genderMap[m.student_id]?.gender === 'male').map(m => m.score)
    const allGirlsScores = marks.filter(m => genderMap[m.student_id]?.gender === 'female').map(m => m.score)
    setOverallBoysAvg(avg(allBoysScores))
    setOverallGirlsAvg(avg(allGirlsScores))
  }

  const gapAbs = Math.abs(overallBoysAvg - overallGirlsAvg)
  const totalStudents = totalBoys + totalGirls
  const significantStemGaps = subjectGaps.filter(s => s.isStem && s.gap > 8)

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          Gender Analysis
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Academic performance by gender across classes and subjects
        </p>
      </div>

      {loading ? <SkeletonTable rows={6} /> : (
        <>
          {/* STEM gap alert */}
          {significantStemGaps.length > 0 && (
            <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
              ⚠️ Significant STEM gender gap detected in {significantStemGaps.length} subject{significantStemGaps.length > 1 ? 's' : ''}:
              {' '}{significantStemGaps.map(s => `${s.subject} (${s.gap}% gap)`).join(', ')}
            </div>
          )}

          {/* Overview cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
            <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: 20, borderLeft: '4px solid #2176FF' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 12 }}>ENROLMENT RATIO</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: '#2176FF' }}>{totalBoys}</span>
                <span style={{ color: '#6b7280' }}>boys</span>
                <span style={{ fontSize: 20, color: '#6b7280' }}>vs</span>
                <span style={{ fontSize: 28, fontWeight: 800, color: '#dc586d' }}>{totalGirls}</span>
                <span style={{ color: '#6b7280' }}>girls</span>
              </div>
              {totalStudents > 0 && (
                <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(totalBoys / totalStudents) * 100}%`, background: '#2176FF', borderRadius: 4 }} />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 11, color: '#2176FF' }}>Boys {totalStudents > 0 ? Math.round((totalBoys / totalStudents) * 100) : 0}%</span>
                <span style={{ fontSize: 11, color: '#dc586d' }}>Girls {totalStudents > 0 ? Math.round((totalGirls / totalStudents) * 100) : 0}%</span>
              </div>
            </div>

            <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: 20, borderLeft: '4px solid #7c3aed' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 12 }}>PERFORMANCE GAP</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#2176FF' }}>{overallBoysAvg}%</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Boys avg</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: gapAbs > 5 ? '#dc2626' : '#16a34a' }}>
                    {gapAbs}% gap
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    {overallBoysAvg > overallGirlsAvg ? 'Boys lead' : 'Girls lead'}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#dc586d' }}>{overallGirlsAvg}%</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Girls avg</div>
                </div>
              </div>
            </div>
          </div>

          {/* By-form chart */}
          {formStats.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: 20, marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 16, fontFamily: 'Space Grotesk, sans-serif' }}>
                Performance by Form
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={formStats} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="form" tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <Tooltip formatter={(v, name) => [`${v}%`, name === 'boysAvg' ? 'Boys' : 'Girls']} />
                  <Legend formatter={v => v === 'boysAvg' ? 'Boys' : 'Girls'} />
                  <Bar dataKey="boysAvg" fill="#2176FF" name="boysAvg" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="girlsAvg" fill="#dc586d" name="girlsAvg" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Subject gender gap */}
          {subjectGaps.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 16, fontFamily: 'Space Grotesk, sans-serif' }}>
                Subject Gender Gap
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {subjectGaps.map(sg => {
                  const subjectColor = Object.entries(SUBJECT_COLORS).find(([k]) => sg.subject.toLowerCase().includes(k.toLowerCase()))?.[1] ?? '#6b7280'
                  const flagStem = sg.isStem && sg.gap > 8
                  return (
                    <div key={sg.subject} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 120, flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                          {sg.subject}
                          {flagStem && <span style={{ marginLeft: 4, fontSize: 10, color: '#dc2626' }}>⚠️STEM</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{sg.gap}% gap</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, width: 30, color: '#2176FF' }}>Boys</span>
                          <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${sg.boysAvg}%`, background: '#2176FF', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 10, width: 30, textAlign: 'right', color: '#2176FF' }}>{sg.boysAvg}%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 10, width: 30, color: '#dc586d' }}>Girls</span>
                          <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${sg.girlsAvg}%`, background: '#dc586d', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 10, width: 30, textAlign: 'right', color: '#dc586d' }}>{sg.girlsAvg}%</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
