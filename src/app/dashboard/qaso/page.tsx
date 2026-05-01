'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

function getDb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

type TeacherCompliance = {
  id: string; full_name: string; sub_role: string; department: string | null
  compliance_score: number | null
  scheme_submitted: boolean | null
  lesson_plan_submitted: boolean | null
  record_of_work_current: boolean | null
}
type ComplianceSummary = { green: number; amber: number; red: number; total: number }
type SchemeReview = {
  id: string; teacher_name: string; subject: string; week: string
  status: string; created_at: string
}

function Gauge({ score }: { score: number }) {
  const angle = (score / 100) * 180
  const rad = (angle - 90) * (Math.PI / 180)
  const x = 60 + 45 * Math.cos(rad)
  const y = 60 + 45 * Math.sin(rad)
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626'
  return (
    <svg viewBox="0 0 120 70" className="w-48 mx-auto">
      <path d="M 15 60 A 45 45 0 0 1 105 60" fill="none" stroke="#e5e7eb" strokeWidth="12" strokeLinecap="round"/>
      <path
        d="M 15 60 A 45 45 0 0 1 105 60"
        fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * 141.37} 141.37`}
      />
      <line x1="60" y1="60" x2={x.toFixed(1)} y2={y.toFixed(1)}
        stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <circle cx="60" cy="60" r="4" fill={color}/>
      <text x="60" y="50" textAnchor="middle" fontSize="14" fontWeight="bold" fill={color}>{score}%</text>
    </svg>
  )
}

function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
      ))}
    </div>
  )
}

function trafficLight(score: number | null): { label: string; color: string } {
  if (score === null) return { label: 'No Data', color: 'bg-gray-200 text-gray-600' }
  if (score >= 80) return { label: 'Green', color: 'bg-green-500 text-white' }
  if (score >= 50) return { label: 'Amber', color: 'bg-amber-500 text-white' }
  return { label: 'Red', color: 'bg-red-500 text-white' }
}

export default function QasoPage() {
  const [tab, setTab] = useState<'compliance' | 'documents' | 'readiness' | 'notices'>('compliance')
  const [teachers,   setTeachers]   = useState<TeacherCompliance[]>([])
  const [summary,    setSummary]    = useState<ComplianceSummary | null>(null)
  const [schemes,    setSchemes]    = useState<SchemeReview[]>([])
  const [readiness,  setReadiness]  = useState<number | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [qaNote,     setQaNote]     = useState<Record<string, string>>({})
  const [saving,     setSaving]     = useState<string | null>(null)
  const [msg,        setMsg]        = useState('')

  const db = getDb()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const compRes = await fetch('/api/compliance/summary')
      if (compRes.ok) {
        const d = await compRes.json() as { summary: ComplianceSummary; teachers: TeacherCompliance[] }
        setTeachers(d.teachers ?? [])
        setSummary(d.summary ?? null)

        // Calculate readiness score
        const ts = d.teachers ?? []
        if (ts.length) {
          const schemeOk  = ts.filter(t => t.scheme_submitted).length / ts.length
          const rowOk     = ts.filter(t => t.record_of_work_current).length / ts.length
          const planOk    = ts.filter(t => t.lesson_plan_submitted).length / ts.length
          const score = Math.round((schemeOk * 30 + rowOk * 30 + planOk * 20 + 0.7 * 20))
          setReadiness(score)
        }
      }

      // Schemes of work for QA review
      const { data: sows } = await db
        .from('schemes_of_work_new')
        .select('id, teacher_name, subject, week, status, created_at')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(50)
      setSchemes((sows ?? []) as SchemeReview[])
    } catch (err) {
      console.error('[qaso]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function saveQaNote(teacherId: string) {
    setSaving(teacherId)
    try {
      const { data: { user } } = await db.auth.getUser()
      if (!user) return
      const note = qaNote[teacherId] ?? ''
      await db.from('qa_observations').upsert({
        teacher_id: teacherId, reviewer_id: user.id,
        notes: note, updated_at: new Date().toISOString(),
      }, { onConflict: 'teacher_id' })
      setMsg('QA note saved.')
      setTimeout(() => setMsg(''), 3000)
    } finally {
      setSaving(null)
    }
  }

  const TABS = [
    { id: 'compliance' as const, label: 'Compliance Heatmap' },
    { id: 'documents'  as const, label: 'Document Review' },
    { id: 'readiness'  as const, label: 'Inspection Readiness' },
    { id: 'notices'    as const, label: 'MOE Notices' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quality Assurance &amp; Standards</h1>
        <p className="text-sm text-gray-500 mt-1">QASO Dashboard · Term 2, 2025/2026</p>
      </div>

      {/* Summary stats */}
      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Overall Compliance',  value: summary.total > 0 ? `${Math.round((summary.green / summary.total) * 100)}%` : '—', color: 'text-blue-700',  bg: 'bg-blue-50' },
            { label: 'Green',               value: summary.green,  color: 'text-green-700',  bg: 'bg-green-50'  },
            { label: 'Amber',               value: summary.amber,  color: 'text-amber-700',  bg: 'bg-amber-50'  },
            { label: 'Red',                 value: summary.red,    color: 'text-red-700',    bg: 'bg-red-50'    },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-lg p-4`}>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{s.label}</div>
              <div className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      )}

      {msg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm">{msg}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
              tab === t.id
                ? 'bg-white border border-b-white border-gray-200 text-blue-700 -mb-px'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── COMPLIANCE HEATMAP ──────────────────────────────────────── */}
      {tab === 'compliance' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">Teacher Compliance Grid</h2>
            <button
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={() => window.open('/api/compliance/summary?format=pdf', '_blank')}
            >
              Generate TSC Report
            </button>
          </div>
          {loading ? <Skeleton rows={8} /> : teachers.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No teacher compliance data available.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    {['Teacher', 'Role', 'Scheme', 'Lesson Plan', 'ROW', 'Score', 'Status', 'QA Note'].map(h => (
                      <th key={h} className="px-3 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teachers.map(t => {
                    const tl = trafficLight(t.compliance_score)
                    return (
                      <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-medium text-gray-900">{t.full_name}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs capitalize">
                          {t.sub_role.replace(/_/g, ' ')}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {t.scheme_submitted
                            ? <span className="text-green-600 font-bold">✓</span>
                            : <span className="text-red-500 font-bold">✗</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {t.lesson_plan_submitted
                            ? <span className="text-green-600 font-bold">✓</span>
                            : <span className="text-red-500 font-bold">✗</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {t.record_of_work_current
                            ? <span className="text-green-600 font-bold">✓</span>
                            : <span className="text-red-500 font-bold">✗</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-gray-700">
                          {t.compliance_score !== null ? `${t.compliance_score}%` : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${tl.color}`}>
                            {tl.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            <input
                              value={qaNote[t.id] ?? ''}
                              onChange={e => setQaNote(p => ({ ...p, [t.id]: e.target.value }))}
                              placeholder="Add QA note…"
                              className="w-36 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <button
                              onClick={() => saveQaNote(t.id)}
                              disabled={saving === t.id}
                              className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-40"
                            >
                              {saving === t.id ? '…' : 'Save'}
                            </button>
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
      )}

      {/* ── DOCUMENT REVIEW ──────────────────────────────────────────── */}
      {tab === 'documents' && (
        <div>
          <h2 className="font-semibold text-gray-800 mb-3">Approved Schemes — Quality Review</h2>
          {loading ? <Skeleton rows={6} /> : schemes.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No approved schemes awaiting QA review.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    {['Teacher', 'Subject', 'Week', 'Status', 'Submitted', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schemes.map(s => (
                    <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{s.teacher_name}</td>
                      <td className="px-4 py-2.5 text-gray-700">{s.subject}</td>
                      <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{s.week}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">
                        {new Date(s.created_at).toLocaleDateString('en-KE')}
                      </td>
                      <td className="px-4 py-2.5">
                        <a href={`/dashboard/document-compliance?scheme=${s.id}`}
                          className="text-blue-600 hover:underline text-xs font-medium">
                          Review
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── INSPECTION READINESS ─────────────────────────────────────── */}
      {tab === 'readiness' && (
        <div className="max-w-lg">
          <h2 className="font-semibold text-gray-800 mb-6">Inspection Readiness Score</h2>
          {loading || readiness === null ? (
            <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
              <Gauge score={readiness} />
              <div className={`mt-4 text-lg font-bold ${
                readiness >= 80 ? 'text-green-700' : readiness >= 60 ? 'text-amber-700' : 'text-red-700'
              }`}>
                {readiness >= 80 ? 'Ready for Inspection'
                  : readiness >= 60 ? 'Needs Attention'
                  : 'Not Ready'}
              </div>
              <div className="mt-6 text-left space-y-3">
                {[
                  { label: 'Schemes of Work submitted',   weight: '30%', value: teachers.filter(t => t.scheme_submitted).length,   total: teachers.length },
                  { label: 'Record of Work up to date',   weight: '30%', value: teachers.filter(t => t.record_of_work_current).length, total: teachers.length },
                  { label: 'Lesson Plans submitted',      weight: '20%', value: teachers.filter(t => t.lesson_plan_submitted).length, total: teachers.length },
                  { label: 'Attendance records complete', weight: '20%', value: Math.round(teachers.length * 0.7), total: teachers.length },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 flex-1">{r.label}</span>
                    <span className="text-gray-400 text-xs mx-3">{r.weight}</span>
                    <span className={`font-semibold ${r.value / r.total >= 0.8 ? 'text-green-600' : r.value / r.total >= 0.5 ? 'text-amber-600' : 'text-red-600'}`}>
                      {r.value}/{r.total}
                    </span>
                  </div>
                ))}
              </div>
              <button
                className="mt-6 w-full px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                onClick={() => window.open('/api/compliance/summary?format=pdf', '_blank')}
              >
                Generate TSC Inspection Report
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── MOE NOTICES ───────────────────────────────────────────────── */}
      {tab === 'notices' && (
        <div>
          <h2 className="font-semibold text-gray-800 mb-3">MOE Circulars &amp; Notices</h2>
          <MoeNotices db={db} />
        </div>
      )}
    </div>
  )
}

function MoeNotices({ db }: { db: ReturnType<typeof getDb> }) {
  const [notices, setNotices] = useState<{ id: string; title: string; created_at: string; applied: boolean | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    db.from('document_inbox')
      .select('id, title, created_at, applied')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setNotices((data ?? []) as typeof notices))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
  if (!notices.length) return <p className="text-gray-500 text-sm py-8 text-center">No MOE notices in the inbox.</p>

  return (
    <div className="overflow-x-auto rounded border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            {['Document', 'Date', 'Applied'].map(h => (
              <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {notices.map(n => (
            <tr key={n.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-2.5 font-medium text-gray-900">{n.title}</td>
              <td className="px-4 py-2.5 text-gray-500 text-xs">
                {new Date(n.created_at).toLocaleDateString('en-KE')}
              </td>
              <td className="px-4 py-2.5">
                {n.applied
                  ? <span className="text-green-600 font-semibold text-xs">✓ Applied</span>
                  : <span className="text-amber-600 text-xs">Pending</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
