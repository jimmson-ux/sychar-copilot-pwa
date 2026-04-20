'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useSchoolId } from '@/hooks/useSchoolId'
import { SkeletonTable } from '@/components/ui/Skeleton'

interface ComplianceRow {
  teacher_id: string
  teacher_name: string
  subject: string | null
  department: string | null
  has_scheme: boolean
  lesson_plans_count: number
  row_count: number
  score: number
}

function scoreColor(score: number) {
  if (score >= 80) return { text: '#16a34a', bg: '#dcfce7' }
  if (score >= 50) return { text: '#d97706', bg: '#fef3c7' }
  return { text: '#dc2626', bg: '#fee2e2' }
}

export default function DocumentCompliancePage() {
  const { schoolId } = useSchoolId()
  const [rows, setRows] = useState<ComplianceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { if (!schoolId) return; loadCompliance() }, [schoolId])

  async function loadCompliance() {
    setLoading(true)
    const supabase = createClient()

    // Try document_compliance table first
    const { data: compliance } = await supabase
      .from('document_compliance')
      .select('teacher_id, has_scheme, lesson_plans_count, row_count, compliance_score')
      .eq('school_id', schoolId)

    // Get all active teaching staff
    const { data: staff } = await supabase
      .from('staff_records')
      .select('id, full_name, subject_name, department')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .in('sub_role', ['class_teacher', 'bom_teacher', 'hod_subjects', 'hod_pathways'])
      .order('full_name')

    const staffList = staff ?? []

    if (compliance && compliance.length > 0) {
      const compMap: Record<string, typeof compliance[0]> = {}
      for (const c of compliance) compMap[c.teacher_id] = c

      setRows(staffList.map(s => {
        const c = compMap[s.id]
        return {
          teacher_id: s.id,
          teacher_name: s.full_name,
          subject: s.subject_name ?? null,
          department: s.department ?? null,
          has_scheme: c?.has_scheme ?? false,
          lesson_plans_count: c?.lesson_plans_count ?? 0,
          row_count: c?.row_count ?? 0,
          score: c?.compliance_score ?? 0,
        }
      }))
    } else {
      // Fall back to deriving from schemes_of_work and records_of_work
      const { data: schemes } = await supabase
        .from('schemes_of_work')
        .select('teacher_id')
        .eq('school_id', schoolId)

      const { data: rows_of_work } = await supabase
        .from('records_of_work')
        .select('teacher_id')
        .eq('school_id', schoolId)

      const schemeTeachers = new Set((schemes ?? []).map(s => s.teacher_id))
      const rowCounts: Record<string, number> = {}
      for (const r of rows_of_work ?? []) {
        rowCounts[r.teacher_id] = (rowCounts[r.teacher_id] ?? 0) + 1
      }

      setRows(staffList.map(s => {
        const hasScheme = schemeTeachers.has(s.id)
        const rowCount = rowCounts[s.id] ?? 0
        const score = Math.round((hasScheme ? 40 : 0) + Math.min(rowCount * 5, 60))
        return {
          teacher_id: s.id,
          teacher_name: s.full_name,
          subject: s.subject_name ?? null,
          department: s.department ?? null,
          has_scheme: hasScheme,
          lesson_plans_count: 0,
          row_count: rowCount,
          score,
        }
      }))
    }

    setLoading(false)
  }

  const filtered = rows.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.teacher_name.toLowerCase().includes(q) ||
      (r.subject ?? '').toLowerCase().includes(q) ||
      (r.department ?? '').toLowerCase().includes(q)
  })

  const fullyCompliant = rows.filter(r => r.score >= 80).length
  const nonCompliant = rows.filter(r => r.score < 50).length
  const avgScore = rows.length > 0
    ? Math.round(rows.reduce((a, b) => a + b.score, 0) / rows.length)
    : 0

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          Document Compliance
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Teacher compliance with schemes, lesson plans, and records of work
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Fully Compliant', value: fullyCompliant, icon: '✅', color: '#16a34a', bg: '#dcfce7' },
          { label: 'Average Score', value: `${avgScore}%`, icon: '📊', color: '#2176FF', bg: '#eff6ff' },
          { label: 'Non-Compliant', value: nonCompliant, icon: '❌', color: '#dc2626', bg: '#fee2e2' },
        ].map(s => (
          <div key={s.label} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 14, padding: '18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: 'Space Grotesk, sans-serif' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Non-compliant alert */}
      {nonCompliant > 0 && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#b91c1c' }}>
          ⚠️ <strong>{nonCompliant} teacher{nonCompliant > 1 ? 's' : ''}</strong> are non-compliant (score &lt; 50%). Immediate action required.
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search teacher, subject, department..."
          style={{
            width: '100%', maxWidth: 340, border: '1px solid #e5e7eb',
            borderRadius: 10, padding: '9px 14px', fontSize: 13, outline: 'none',
          }}
        />
      </div>

      {loading ? <SkeletonTable rows={8} /> : (
        <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Teacher', 'Scheme of Work', 'Lesson Plans', 'Records of Work', 'Compliance Score'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
                    No records found.
                  </td>
                </tr>
              ) : filtered.map(r => {
                const { text, bg } = scoreColor(r.score)
                return (
                  <tr key={r.teacher_id}
                    style={{ borderBottom: '1px solid #f9fafb' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{r.teacher_name}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                        {r.subject ?? ''}{r.subject && r.department ? ' · ' : ''}{r.department ?? ''}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 18 }}>{r.has_scheme ? '✅' : '❌'}</span>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#374151' }}>
                      {r.lesson_plans_count > 0 ? `${r.lesson_plans_count} plans` : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#374151' }}>
                      {r.row_count > 0 ? `${r.row_count} entries` : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', minWidth: 80 }}>
                          <div style={{ height: '100%', width: `${r.score}%`, background: text, borderRadius: 3, transition: 'width 0.6s ease' }} />
                        </div>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: bg, color: text, minWidth: 44, textAlign: 'center' }}>
                          {r.score}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
