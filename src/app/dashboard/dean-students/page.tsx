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

type RiskStudent = {
  id: string; student_id: string; risk_tier: string; risk_score: number
  risk_flags: string[]; updated_at: string
  students: { full_name: string; class_name: string } | null
}
type DisciplineRecord = {
  id: string; student_id: string; offence_description: string
  severity: string; status: string; created_at: string
  reported_by: string | null
  students: { full_name: string; class_name: string } | null
}
type ExeatRequest = {
  id: string; student_id: string; reason: string
  leave_date: string; return_date: string; status: string; created_at: string
  students: { full_name: string; class_name: string } | null
}
type GatePass = {
  id: string; student_id: string; exit_time: string; destination: string
  expected_return: string | null; status: string
  students: { full_name: string; class_name: string } | null
}
type AbsentStudent = {
  student_id: string; full_name: string; class_name: string
  consecutive_days: number; last_seen: string | null
}
type Stats = { totalStudents: number; atRisk: number; pendingExeats: number; openDiscipline: number }

const TIER_COLOR: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border border-red-200',
  high:     'bg-orange-100 text-orange-800 border border-orange-200',
  medium:   'bg-yellow-100 text-yellow-700',
  low:      'bg-green-100 text-green-700',
}
const SEV_COLOR: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  serious:  'bg-orange-100 text-orange-800',
  minor:    'bg-blue-100 text-blue-700',
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
      ))}
    </div>
  )
}

export default function DeanStudentsPage() {
  const [tab, setTab] = useState<'risk' | 'discipline' | 'exeat' | 'gate' | 'absent'>('risk')
  const [stats,       setStats]       = useState<Stats | null>(null)
  const [riskList,    setRiskList]    = useState<RiskStudent[]>([])
  const [discipline,  setDiscipline]  = useState<DisciplineRecord[]>([])
  const [discFilter,  setDiscFilter]  = useState<'all' | 'critical' | 'serious' | 'pending'>('all')
  const [exeats,      setExeats]      = useState<ExeatRequest[]>([])
  const [gatePasses,  setGatePasses]  = useState<GatePass[]>([])
  const [absentees,   setAbsentees]   = useState<AbsentStudent[]>([])
  const [loading,     setLoading]     = useState(true)
  const [reviewId,    setReviewId]    = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionMsg,   setActionMsg]   = useState('')

  const db = getDb()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await db.auth.getUser()
      if (!user) return

      const { data: staff } = await db
        .from('staff_records')
        .select('school_id')
        .eq('user_id', user.id)
        .single()
      if (!staff) return

      const schoolId = staff.school_id

      const [riskRes, discRes, exeatRes, gateRes, studentRes] = await Promise.all([
        db.from('student_risk_scores')
          .select('id, student_id, risk_tier, risk_score, risk_flags, updated_at, students(full_name, class_name)')
          .eq('school_id', schoolId)
          .in('risk_tier', ['high', 'critical'])
          .order('risk_score', { ascending: false })
          .limit(50),

        db.from('discipline_records')
          .select('id, student_id, offence_description, severity, status, created_at, reported_by, students(full_name, class_name)')
          .eq('school_id', schoolId)
          .neq('status', 'resolved')
          .order('created_at', { ascending: false })
          .limit(100),

        db.from('exeat_requests')
          .select('id, student_id, reason, leave_date, return_date, status, created_at, students(full_name, class_name)')
          .eq('school_id', schoolId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),

        db.from('gate_passes')
          .select('id, student_id, exit_time, destination, expected_return, status, students(full_name, class_name)')
          .eq('school_id', schoolId)
          .gte('exit_time', new Date().toISOString().split('T')[0])
          .order('exit_time', { ascending: false }),

        db.from('students')
          .select('id, full_name, class_name')
          .eq('school_id', schoolId)
          .eq('is_active', true),
      ])

      const riskData   = (riskRes.data   ?? []) as unknown as RiskStudent[]
      const discData   = (discRes.data   ?? []) as unknown as DisciplineRecord[]
      const exeatData  = (exeatRes.data  ?? []) as unknown as ExeatRequest[]
      const gateData   = (gateRes.data   ?? []) as unknown as GatePass[]
      const totalStud  = studentRes.data?.length ?? 0

      setRiskList(riskData)
      setDiscipline(discData)
      setExeats(exeatData)
      setGatePasses(gateData)
      setStats({
        totalStudents: totalStud,
        atRisk:        riskData.length,
        pendingExeats: exeatData.length,
        openDiscipline: discData.length,
      })

      // Absenteeism: students absent ≥ 3 consecutive days
      const today = new Date()
      const threeAgo = new Date(today); threeAgo.setDate(threeAgo.getDate() - 3)
      const { data: absentRaw } = await db
        .from('attendance_records')
        .select('student_id, date, status')
        .eq('school_id', schoolId)
        .in('status', ['absent', 'sick'])
        .gte('date', threeAgo.toISOString().split('T')[0])
        .order('date', { ascending: false })

      const byStudent: Record<string, string[]> = {}
      for (const r of absentRaw ?? []) {
        if (!byStudent[r.student_id]) byStudent[r.student_id] = []
        byStudent[r.student_id].push(r.date)
      }
      const absentList: AbsentStudent[] = []
      for (const [sid, dates] of Object.entries(byStudent)) {
        if (dates.length >= 3) {
          const stud = studentRes.data?.find(s => s.id === sid)
          if (stud) {
            absentList.push({
              student_id: sid,
              full_name:  stud.full_name,
              class_name: stud.class_name,
              consecutive_days: dates.length,
              last_seen: null,
            })
          }
        }
      }
      setAbsentees(absentList)
    } catch (err) {
      console.error('[dean-students]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime gate passes
  useEffect(() => {
    const channel = db
      .channel('gate-passes-dean')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_passes' }, () => load())
      .subscribe()
    return () => { db.removeChannel(channel) }
  }, [load])

  async function reviewExeat(id: string, action: 'approve' | 'reject') {
    setActionMsg('')
    const r = await fetch(`/api/exeat/${id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, rejectionReason: action === 'reject' ? rejectReason : undefined }),
    }).catch(() => null)
    if (r?.ok) {
      setActionMsg(`Exeat ${action === 'approve' ? 'approved' : 'rejected'} successfully.`)
      setReviewId(null)
      setRejectReason('')
      load()
    } else {
      setActionMsg('Action failed — please try again.')
    }
  }

  const filteredDisc = discFilter === 'all' ? discipline
    : discFilter === 'pending' ? discipline.filter(d => d.status === 'pending')
    : discipline.filter(d => d.severity === discFilter)

  const TABS: { id: typeof tab; label: string; count?: number }[] = [
    { id: 'risk',       label: 'At-Risk',     count: riskList.length },
    { id: 'discipline', label: 'Discipline',   count: discipline.length },
    { id: 'exeat',      label: 'Exeats',       count: exeats.length },
    { id: 'gate',       label: 'Gate Passes Today', count: gatePasses.length },
    { id: 'absent',     label: 'Absenteeism',  count: absentees.length },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dean of Students</h1>
          <p className="text-sm text-gray-500 mt-1">
            Term 2, 2025/2026 · Student Welfare &amp; Safety
          </p>
        </div>
      </div>

      {/* Stats cards */}
      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Students',       value: stats.totalStudents, color: 'text-blue-700',   bg: 'bg-blue-50' },
            { label: 'At-Risk Count',         value: stats.atRisk,        color: 'text-red-700',    bg: 'bg-red-50'  },
            { label: 'Pending Exeats',        value: stats.pendingExeats, color: 'text-amber-700',  bg: 'bg-amber-50'},
            { label: 'Open Discipline Cases', value: stats.openDiscipline,color: 'text-orange-700', bg: 'bg-orange-50'},
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

      {/* Action message */}
      {actionMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm">
          {actionMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 flex-wrap">
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
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-red-100 text-red-700 font-semibold">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── AT-RISK STUDENTS ─────────────────────────────────────────── */}
      {tab === 'risk' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">High &amp; Critical Risk Students</h2>
            <button
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={() => fetch('/api/ai/principal-summary', { method: 'POST' })}
            >
              Generate Intervention Report
            </button>
          </div>
          {loading ? <Skeleton rows={5} /> : riskList.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No high-risk students — great news.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    {['Student', 'Class', 'Risk Tier', 'Score', 'Flags', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {riskList.map(r => (
                    <tr
                      key={r.id}
                      className={`border-t border-gray-100 ${r.risk_tier === 'critical' ? 'bg-red-50' : r.risk_tier === 'high' ? 'bg-orange-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {(r.students as { full_name: string } | null)?.full_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {(r.students as { class_name: string } | null)?.class_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${TIER_COLOR[r.risk_tier] ?? ''}`}>
                          {r.risk_tier.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700">{r.risk_score?.toFixed(1)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {(r.risk_flags ?? []).slice(0, 3).join(', ')}
                        {(r.risk_flags ?? []).length > 3 && <span className="text-gray-400"> +{r.risk_flags.length - 3}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <a href={`/dashboard/students/${r.student_id}`}
                          className="text-blue-600 hover:underline text-xs font-medium">
                          View Profile
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

      {/* ── DISCIPLINE ────────────────────────────────────────────────── */}
      {tab === 'discipline' && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            {(['all', 'critical', 'serious', 'pending'] as const).map(f => (
              <button
                key={f}
                onClick={() => setDiscFilter(f)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  discFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)} ({
                  f === 'all' ? discipline.length
                  : f === 'pending' ? discipline.filter(d => d.status === 'pending').length
                  : discipline.filter(d => d.severity === f).length
                })
              </button>
            ))}
          </div>
          {loading ? <Skeleton rows={5} /> : filteredDisc.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No open discipline cases.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    {['Student', 'Class', 'Offence', 'Severity', 'Status', 'Days Open', 'Reported By'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDisc.map(d => {
                    const daysOpen = Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000)
                    return (
                      <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {(d.students as { full_name: string } | null)?.full_name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {(d.students as { class_name: string } | null)?.class_name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{d.offence_description}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${SEV_COLOR[d.severity] ?? 'bg-gray-100 text-gray-700'}`}>
                            {d.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 capitalize text-gray-600 text-xs">{d.status}</td>
                        <td className={`px-4 py-3 font-medium ${daysOpen > 7 ? 'text-red-600' : daysOpen > 3 ? 'text-amber-600' : 'text-gray-600'}`}>
                          {daysOpen}d
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{d.reported_by ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── EXEAT REQUESTS ────────────────────────────────────────────── */}
      {tab === 'exeat' && (
        <div>
          <h2 className="font-semibold text-gray-800 mb-3">Pending Exeat Requests</h2>
          {loading ? <Skeleton rows={4} /> : exeats.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No pending exeat requests.</p>
          ) : (
            <div className="space-y-3">
              {exeats.map(ex => (
                <div key={ex.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {(ex.students as { full_name: string } | null)?.full_name ?? '—'}
                        <span className="ml-2 text-sm text-gray-500">
                          {(ex.students as { class_name: string } | null)?.class_name}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">{ex.reason}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        Leave: {ex.leave_date} · Return: {ex.return_date}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => reviewExeat(ex.id, 'approve')}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setReviewId(reviewId === ex.id ? null : ex.id)}
                        className="px-3 py-1.5 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                  {reviewId === ex.id && (
                    <div className="mt-3 flex gap-2">
                      <input
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="Reason for rejection…"
                        className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-400"
                      />
                      <button
                        onClick={() => reviewExeat(ex.id, 'reject')}
                        disabled={!rejectReason.trim()}
                        className="px-3 py-1.5 bg-red-600 text-white text-xs rounded disabled:opacity-40 hover:bg-red-700"
                      >
                        Confirm Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── GATE PASSES TODAY ─────────────────────────────────────────── */}
      {tab === 'gate' && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold text-gray-800">Gate Passes Today</h2>
            <span className="text-xs text-green-600 font-medium">• Live</span>
          </div>
          {loading ? <Skeleton rows={4} /> : gatePasses.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No gate passes recorded today.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    {['Student', 'Class', 'Exit Time', 'Destination', 'Expected Return', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gatePasses.map(g => (
                    <tr key={g.id} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {(g.students as { full_name: string } | null)?.full_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {(g.students as { class_name: string } | null)?.class_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {new Date(g.exit_time).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{g.destination}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {g.expected_return
                          ? new Date(g.expected_return).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          g.status === 'out' ? 'bg-amber-100 text-amber-700'
                          : g.status === 'returned' ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                        }`}>
                          {g.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ABSENTEEISM ───────────────────────────────────────────────── */}
      {tab === 'absent' && (
        <div>
          <h2 className="font-semibold text-gray-800 mb-3">Students Absent 3+ Consecutive Days</h2>
          {loading ? <Skeleton rows={4} /> : absentees.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No extended absences in the past 3 days.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    {['Student', 'Class', 'Consecutive Days', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {absentees.map(a => (
                    <tr key={a.student_id} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-medium text-gray-900">{a.full_name}</td>
                      <td className="px-4 py-3 text-gray-600">{a.class_name}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${a.consecutive_days >= 5 ? 'text-red-600' : 'text-amber-600'}`}>
                          {a.consecutive_days} days
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <a href={`/dashboard/students/${a.student_id}`}
                          className="text-blue-600 hover:underline text-xs font-medium">
                          View Profile
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
    </div>
  )
}
