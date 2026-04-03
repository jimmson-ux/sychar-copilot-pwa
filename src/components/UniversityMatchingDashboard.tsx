'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy singleton — createClient is deferred until first component render (browser only).
// Module-level calls would crash Next.js static generation when env vars are absent.
let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _supabase
}

const SCHOOL_ID = '68bd8d34-f2f0-4297-bd18-093328824d84'

// ── Types ────────────────────────────────────────────────────────────────────

interface UniversityMatch {
  university: string
  country: string
  program: string
  match_score: number
  tuition_kes_per_year: number
  scholarship_available: boolean
  scholarship_name: string
  minimum_grade: string
  why_matched: string
  application_deadline: string
  link: string
}

interface UniversityMatchResult {
  matches: UniversityMatch[]
  career_tracks: string[]
  summary: string
}

interface Prediction {
  predicted_grade: string
  predicted_points: number
  confidence: number
  intervention_needed: boolean
}

interface Student {
  id: string
  full_name: string
  gender: string
  class_name: string
  stream_name: string
  pathway: string | null
  kcpe_marks: number | null
  curriculum_type: string
}

interface Report {
  id: string
  student_id: string
  university_matches: UniversityMatchResult | null
  generated_at: string
}

interface StudentWithData extends Student {
  prediction: Prediction | null
  report: Report | null
}

interface BatchResult {
  processed: number
  total: number
  errors: { student_id: string; name: string; error: string }[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function countryFlag(country: string): string {
  const flags: Record<string, string> = {
    Kenya: '🇰🇪',
    UK: '🇬🇧',
    'United Kingdom': '🇬🇧',
    Germany: '🇩🇪',
    UAE: '🇦🇪',
    'United Arab Emirates': '🇦🇪',
    Canada: '🇨🇦',
    Australia: '🇦🇺',
  }
  return flags[country] ?? '🌍'
}

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-800'
  if (score >= 60) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

function gradeColor(grade: string): string {
  const top = ['A', 'A-']
  const mid = ['B+', 'B', 'B-']
  if (top.includes(grade)) return 'text-green-600 font-semibold'
  if (mid.includes(grade)) return 'text-blue-600 font-semibold'
  return 'text-gray-600'
}

function formatKES(amount: number): string {
  if (amount === 0) return 'Free'
  if (amount >= 1_000_000) return `KES ${(amount / 1_000_000).toFixed(1)}M`
  return `KES ${(amount / 1_000).toFixed(0)}K`
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function UniversityMatchingDashboard() {
  const [students, setStudents] = useState<StudentWithData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generating, setGenerating] = useState<Set<string>>(new Set())
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch students
      const { data: studs, error: sErr } = await getSupabase()
        .from('students')
        .select('id, full_name, gender, class_name, stream_name, pathway, kcpe_marks, curriculum_type')
        .eq('school_id', SCHOOL_ID)
        .order('full_name', { ascending: true })

      if (sErr) throw new Error(sErr.message)
      if (!studs || studs.length === 0) {
        setStudents([])
        return
      }

      const studentIds = (studs as Student[]).map(s => s.id)

      // Fetch predictions and reports in parallel
      const [predRes, reportRes] = await Promise.all([
        getSupabase()
          .from('kcse_predictions')
          .select('student_id, predicted_grade, predicted_points, confidence, intervention_needed')
          .in('student_id', studentIds),
        getSupabase()
          .from('ai_career_reports')
          .select('id, student_id, university_matches, generated_at')
          .eq('school_id', SCHOOL_ID)
          .in('student_id', studentIds),
      ])

      // Build lookup maps (latest prediction per student)
      const predMap = new Map<string, Prediction>()
      for (const p of (predRes.data ?? []) as (Prediction & { student_id: string })[]) {
        if (!predMap.has(p.student_id)) predMap.set(p.student_id, p)
      }

      const reportMap = new Map<string, Report>()
      for (const r of (reportRes.data ?? []) as (Report)[]) {
        const existing = reportMap.get(r.student_id)
        if (!existing || r.generated_at > existing.generated_at) {
          reportMap.set(r.student_id, r)
        }
      }

      const merged: StudentWithData[] = (studs as Student[]).map(s => ({
        ...s,
        prediction: predMap.get(s.id) ?? null,
        report: reportMap.get(s.id) ?? null,
      }))

      setStudents(merged)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const generateOne = useCallback(async (student: StudentWithData) => {
    setGenerating(prev => new Set([...prev, student.id]))
    try {
      const res = await fetch('/api/university-matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: student.id }),
      })
      const payload = await res.json() as { report?: Report; error?: string }
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`)

      setStudents(prev =>
        prev.map(s =>
          s.id === student.id ? { ...s, report: payload.report ?? null } : s
        )
      )
      setSelectedId(student.id)
      showToast(`Matches generated for ${student.full_name}`)
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setGenerating(prev => {
        const next = new Set(prev)
        next.delete(student.id)
        return next
      })
    }
  }, [])

  const generateAll = useCallback(async () => {
    setBatchRunning(true)
    setBatchResult(null)
    try {
      const res = await fetch('/api/university-matching/batch', { method: 'POST' })
      const payload = await res.json() as BatchResult & { error?: string }
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`)
      setBatchResult(payload)
      showToast(`Batch complete: ${payload.processed}/${payload.total} students matched`)
      await load()
    } catch (err) {
      showToast(`Batch error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBatchRunning(false)
    }
  }, [load])

  const selected = students.find(s => s.id === selectedId) ?? null

  const matchedCount = students.filter(s => s.report?.university_matches?.matches?.length).length
  const pendingCount = students.length - matchedCount

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading students…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-20 p-6 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-red-700 font-medium">Failed to load</p>
        <p className="text-red-500 text-sm mt-1">{error}</p>
        <button
          onClick={load}
          className="mt-4 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm px-4 py-3 rounded-lg shadow-lg max-w-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Global University Matching</h1>
            <p className="text-sm text-gray-500 mt-0.5">AI-powered university recommendations for every student</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Refresh
            </button>
            <button
              onClick={generateAll}
              disabled={batchRunning || students.length === 0}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {batchRunning ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Running…
                </>
              ) : (
                `Generate All (${pendingCount} pending)`
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Total Students</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{students.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Matched</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{matchedCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Pending</p>
            <p className="text-2xl font-bold text-orange-500 mt-1">{pendingCount}</p>
          </div>
        </div>

        {/* Batch result banner */}
        {batchResult && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm">
            <p className="font-medium text-blue-800">
              Batch complete — {batchResult.processed}/{batchResult.total} students matched
            </p>
            {batchResult.errors.length > 0 && (
              <ul className="mt-2 text-red-600 space-y-1">
                {batchResult.errors.map(e => (
                  <li key={e.student_id}>{e.name}: {e.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {students.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">No students found for this school.</p>
          </div>
        ) : (
          <div className={`grid gap-6 ${selected ? 'grid-cols-[1fr_2fr]' : 'grid-cols-1'}`}>
            {/* Student List */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-sm font-medium text-gray-700">Students</p>
              </div>
              <div className="divide-y divide-gray-100 overflow-y-auto max-h-[70vh]">
                {students.map(student => {
                  const hasMatches = !!(student.report?.university_matches?.matches?.length)
                  const isGenerating = generating.has(student.id)
                  const isSelected = selectedId === student.id

                  return (
                    <div
                      key={student.id}
                      onClick={() => setSelectedId(isSelected ? null : student.id)}
                      className={`px-4 py-3 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{student.full_name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {student.class_name} · {student.stream_name}
                            {student.pathway ? ` · ${student.pathway}` : ''}
                          </p>
                          {student.prediction && (
                            <p className={`text-xs mt-0.5 ${gradeColor(student.prediction.predicted_grade)}`}>
                              Pred: {student.prediction.predicted_grade} ({student.prediction.predicted_points} pts)
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-1">
                          {hasMatches ? (
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                              {student.report!.university_matches!.matches.length} matches
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                              No matches
                            </span>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); void generateOne(student) }}
                            disabled={isGenerating || batchRunning}
                            className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isGenerating ? '…' : hasMatches ? 'Regenerate' : 'Generate'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Match Detail Panel */}
            {selected && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{selected.full_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {selected.class_name} · {selected.stream_name}
                      {selected.pathway ? ` · ${selected.pathway}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                  >
                    ✕
                  </button>
                </div>

                {!selected.report?.university_matches ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <p className="text-sm">No matches yet.</p>
                    <button
                      onClick={() => void generateOne(selected)}
                      disabled={generating.has(selected.id)}
                      className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {generating.has(selected.id) ? 'Generating…' : 'Generate Matches'}
                    </button>
                  </div>
                ) : (
                  <div className="overflow-y-auto max-h-[70vh] p-5 space-y-5">
                    {/* Summary */}
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-blue-800 mb-1">Overview</p>
                      <p className="text-sm text-blue-700">{selected.report.university_matches.summary}</p>
                    </div>

                    {/* Career Tracks */}
                    {selected.report.university_matches.career_tracks?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Recommended Career Tracks</p>
                        <div className="flex flex-wrap gap-2">
                          {selected.report.university_matches.career_tracks.map(track => (
                            <span
                              key={track}
                              className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full"
                            >
                              {track}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* University Cards */}
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-3">
                        University Matches ({selected.report.university_matches.matches.length})
                      </p>
                      <div className="space-y-3">
                        {selected.report.university_matches.matches
                          .sort((a, b) => b.match_score - a.match_score)
                          .map((match, i) => (
                            <div
                              key={i}
                              className="border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-base">{countryFlag(match.country)}</span>
                                    <p className="font-semibold text-gray-900 text-sm">{match.university}</p>
                                    <span className="text-xs text-gray-400">{match.country}</span>
                                  </div>
                                  <p className="text-sm text-blue-700 mt-0.5">{match.program}</p>
                                </div>
                                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor(match.match_score)}`}>
                                    {match.match_score}%
                                  </span>
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-gray-600">
                                <div>
                                  <span className="text-gray-400">Tuition / yr: </span>
                                  <span className="font-medium">{formatKES(match.tuition_kes_per_year)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Min Grade: </span>
                                  <span className="font-medium">{match.minimum_grade}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Deadline: </span>
                                  <span className="font-medium">{match.application_deadline}</span>
                                </div>
                                {match.scholarship_available && (
                                  <div className="col-span-2">
                                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200">
                                      🎓 {match.scholarship_name || 'Scholarship available'}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <p className="mt-2.5 text-xs text-gray-600 leading-relaxed">{match.why_matched}</p>

                              {match.link && (
                                <a
                                  href={match.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-2 inline-block text-xs text-blue-600 hover:text-blue-800 underline"
                                >
                                  Apply / Learn More →
                                </a>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>

                    <p className="text-xs text-gray-400 text-right">
                      Generated {new Date(selected.report.generated_at).toLocaleDateString('en-KE', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
