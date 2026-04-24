'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSchoolId } from '@/hooks/useSchoolId'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudentStats  { total: number; boys: number; girls: number }
interface DisciplineSummary { total: number; today: number; high: number; medium: number; low: number }
interface ComplianceSummary { green: number; amber: number; red: number; total: number }
interface AiInsight  { id: string; insight_type: string; title: string; body: string; severity: string; created_at: string }
interface Notice     { id: string; title: string; content: string; target_audience: string; created_at: string }
interface Subscription { status: string; trial_ends_at: string | null; sms_used: number; sms_quota: number }
interface FeeSummary { totalCollected: number; transactionCount: number; currency: string }

interface OverviewData {
  studentStats:       StudentStats
  staffCount:         number
  disciplineSummary:  DisciplineSummary
  complianceSummary:  ComplianceSummary
  aiInsights:         AiInsight[]
  notices:            Notice[]
  subscription:       Subscription | null
  feeSummary:         FeeSummary | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTimeGreeting(): { greeting: string; period: 'morning' | 'midday' | 'afternoon' } {
  const h = new Date().getHours()
  if (h < 12) return { greeting: 'Good morning',   period: 'morning'   }
  if (h < 17) return { greeting: 'Good afternoon', period: 'midday'    }
  return            { greeting: 'Good evening',    period: 'afternoon' }
}

function fmtCurrency(n: number, currency = 'KES') {
  return `${currency} ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`
}

function timeSince(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (d < 60)    return `${d}s ago`
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

// ── Skeleton shimmer ───────────────────────────────────────────────────────────

function Skeleton({ w = '100%', h = 16, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)',
      backgroundSize: '400px 100%',
      animation: 'shimmer 1.4s ease infinite',
    }} />
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }: {
  icon: string; label: string; value: number | string; sub?: string; color: string
}) {
  return (
    <div style={{
      background: 'white', borderRadius: 16, padding: '18px 20px',
      boxShadow: '0 1px 8px rgba(0,0,0,0.06)', flex: 1, minWidth: 0,
      borderTop: `3px solid ${color}`,
      transition: 'transform 0.18s, box-shadow 0.18s',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)' }}
    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 8px rgba(0,0,0,0.06)' }}
    >
      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: color, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────

function Panel({ title, icon, children, action }: {
  title: string; icon: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div style={{
      background: 'white', borderRadius: 16, padding: '20px 22px',
      boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── Traffic light dot ─────────────────────────────────────────────────────────

function TrafficDot({ color }: { color: 'green' | 'amber' | 'red' }) {
  const c = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444' }[color]
  return <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }} />
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PrincipalDashboard() {
  const router = useRouter()
  const { schoolId } = useSchoolId()
  const [data, setData]       = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [name, setName]       = useState('')

  // AI Command Center state
  const [aiSummary, setAiSummary]             = useState('')
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  const [aiSummaryErr, setAiSummaryErr]       = useState('')

  async function generateAiSummary() {
    setAiSummaryLoading(true); setAiSummaryErr(''); setAiSummary('')
    try {
      const res = await fetch('/api/ai/principal-summary', { method: 'POST' })
      const d = await res.json() as { ok?: boolean; summary?: string; error?: string }
      if (d.ok && d.summary) setAiSummary(d.summary)
      else setAiSummaryErr(d.error ?? 'Failed to generate summary')
    } catch {
      setAiSummaryErr('Network error — try again')
    } finally {
      setAiSummaryLoading(false)
    }
  }

  // Emergency broadcast state
  const [showEmergency, setShowEmergency]       = useState(false)
  const [broadcastType, setBroadcastType]       = useState('school_closure')
  const [broadcastMsg, setBroadcastMsg]         = useState('')
  const [broadcastLoading, setBroadcastLoading] = useState(false)
  const [broadcastResult, setBroadcastResult]   = useState<{ ok: boolean; sent?: number; failed?: number; broadcast_id?: string } | null>(null)

  const sendEmergency = async () => {
    if (!broadcastMsg.trim()) return
    setBroadcastLoading(true)
    setBroadcastResult(null)
    try {
      const res = await fetch('/api/emergency-broadcast', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: broadcastType, message: broadcastMsg.trim() }),
      })
      const json = await res.json()
      setBroadcastResult(json)
    } catch {
      setBroadcastResult({ ok: false })
    } finally {
      setBroadcastLoading(false)
    }
  }

  const { greeting } = getTimeGreeting()

  const load = useCallback(async () => {
    if (!schoolId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/principal/overview')
      if (res.status === 403) { router.replace('/dashboard'); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch {
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [schoolId, router])

  useEffect(() => {
    if (!schoolId) return
    load()
    // Pull name from localStorage (set at login)
    const n = localStorage.getItem('sychar_name')
    if (n) setName(n.split(' ')[0])
  }, [schoolId, load])

  // ── Subscription badge ────────────────────────────────────────────────────
  function SubBadge() {
    const sub = data?.subscription
    if (!sub) return null
    const isTrialing = sub.status === 'trial'
    const daysLeft   = sub.trial_ends_at
      ? Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000)
      : null

    const bg   = isTrialing ? '#fffbeb' : '#f0fdf4'
    const col  = isTrialing ? '#d97706' : '#16a34a'
    const text = isTrialing
      ? `Trial${daysLeft !== null ? ` — ${daysLeft}d left` : ''}`
      : sub.status.charAt(0).toUpperCase() + sub.status.slice(1)

    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: bg, color: col,
        border: `1px solid ${col}33`, borderRadius: 20,
        padding: '3px 10px', fontSize: 12, fontWeight: 600,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: col }} />
        {text}
      </div>
    )
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '24px 20px', maxWidth: 960, margin: '0 auto' }}>
        <style>{`@keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }`}</style>
        <div style={{ marginBottom: 24 }}>
          <Skeleton w={200} h={28} />
          <div style={{ marginTop: 8 }}><Skeleton w={280} h={16} /></div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[1,2,3,4].map(i => <div key={i} style={{ flex: 1, minWidth: 140 }}><Skeleton h={100} r={16} /></div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} h={180} r={16} />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: '#ef4444', marginBottom: 16 }}>{error}</div>
        <button onClick={load} style={{ padding: '10px 24px', borderRadius: 10, background: '#1e40af', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const { studentStats, staffCount, disciplineSummary, complianceSummary, aiInsights, notices, feeSummary } = data

  return (
    <>
      <style>{`
        @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .principal-panel { animation: fadeUp 0.3s ease both; }
      `}</style>

      <div style={{ padding: '24px 20px', maxWidth: 960, margin: '0 auto' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>
              {greeting}{name ? `, ${name}` : ''}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              {new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <SubBadge />
            <button
              onClick={() => { setShowEmergency(true); setBroadcastResult(null); setBroadcastMsg('') }}
              style={{
                padding: '8px 16px', borderRadius: 10,
                background: '#dc2626', color: 'white',
                border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 8px rgba(220,38,38,0.35)',
                transition: 'transform 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
            >
              🚨 EMERGENCY
            </button>
          </div>
        </div>

        {/* ── Stats row ───────────────────────────────────────────────────── */}
        <div className="principal-panel" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard icon="🎓" label="Students"    value={studentStats.total} sub={`${studentStats.boys}B · ${studentStats.girls}G`} color="#1e40af" />
          <StatCard icon="👩‍🏫" label="Staff"      value={staffCount}         color="#0891b2" />
          <StatCard icon="⚠️" label="Incidents today" value={disciplineSummary.today} sub={disciplineSummary.total > 0 ? `${disciplineSummary.total} this week` : undefined} color={disciplineSummary.today > 0 ? '#ef4444' : '#22c55e'} />
          <StatCard icon="📋" label="Compliance"  value={`${complianceSummary.green}/${complianceSummary.total}`} sub={complianceSummary.red > 0 ? `${complianceSummary.red} overdue` : 'All current'} color={complianceSummary.red > 0 ? '#f59e0b' : '#22c55e'} />
        </div>

        {/* ── Main grid ───────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>

          {/* Compliance traffic lights */}
          <div className="principal-panel" style={{ animationDelay: '0.05s' }}>
            <Panel title="Compliance" icon="🚦">
              {complianceSummary.total === 0 ? (
                <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>No compliance records</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {([
                    { label: 'Compliant', value: complianceSummary.green, color: 'green' as const, bg: '#f0fdf4', text: '#16a34a' },
                    { label: 'Pending',   value: complianceSummary.amber, color: 'amber' as const, bg: '#fffbeb', text: '#d97706' },
                    { label: 'Overdue',   value: complianceSummary.red,   color: 'red'   as const, bg: '#fef2f2', text: '#dc2626' },
                  ]).map(row => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: row.bg, borderRadius: 10 }}>
                      <TrafficDot color={row.color} />
                      <span style={{ flex: 1, fontSize: 14, color: '#374151' }}>{row.label}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: row.text }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {/* Discipline summary */}
          <div className="principal-panel" style={{ animationDelay: '0.08s' }}>
            <Panel
              title="Discipline — this week"
              icon="🔔"
              action={
                <button onClick={() => router.push('/dashboard/discipline')} style={{ fontSize: 12, color: '#1e40af', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                  View all →
                </button>
              }
            >
              {disciplineSummary.total === 0 ? (
                <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>No incidents this week</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {([
                    { label: 'High severity',   value: disciplineSummary.high,   color: '#ef4444', bg: '#fef2f2' },
                    { label: 'Medium severity', value: disciplineSummary.medium, color: '#f59e0b', bg: '#fffbeb' },
                    { label: 'Low severity',    value: disciplineSummary.low,    color: '#22c55e', bg: '#f0fdf4' },
                  ]).filter(r => r.value > 0).map(row => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', background: row.bg, borderRadius: 10 }}>
                      <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{row.label}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: row.color }}>{row.value}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'right', marginTop: 4 }}>
                    {disciplineSummary.today} incident{disciplineSummary.today !== 1 ? 's' : ''} today
                  </div>
                </div>
              )}
            </Panel>
          </div>

          {/* Fee collection — principal only */}
          {feeSummary && (
            <div className="principal-panel" style={{ animationDelay: '0.11s' }}>
              <Panel title="Fee Collection" icon="💰">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Collected this year</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#111827' }}>
                      {fmtCurrency(feeSummary.totalCollected, feeSummary.currency)}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      {feeSummary.transactionCount} transaction{feeSummary.transactionCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ height: 1, background: '#f3f4f6' }} />
                  <button
                    onClick={() => router.push('/dashboard/fees')}
                    style={{ width: '100%', padding: '10px', borderRadius: 10, background: 'linear-gradient(135deg,#1e40af,#059669)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                  >
                    View fee details
                  </button>
                </div>
              </Panel>
            </div>
          )}

          {/* AI Insights */}
          <div className="principal-panel" style={{ animationDelay: '0.14s' }}>
            <Panel title="AI Insights" icon="🤖">
              {aiInsights.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>
                  No insights yet — insights appear as patterns emerge
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {aiInsights.slice(0, 3).map(ins => {
                    const sev = ins.severity === 'high' ? { bg: '#fef2f2', border: '#fecaca', dot: '#ef4444' }
                              : ins.severity === 'medium' ? { bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b' }
                              : { bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' }
                    return (
                      <div key={ins.id} style={{ padding: '10px 12px', background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: sev.dot, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>{ins.title}</span>
                          <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>{timeSince(ins.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.4 }}>{ins.body}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
          </div>

          {/* Notices */}
          <div className="principal-panel" style={{ animationDelay: '0.17s' }}>
            <Panel
              title="Recent Notices"
              icon="📢"
              action={
                <button onClick={() => router.push('/dashboard/notices')} style={{ fontSize: 12, color: '#1e40af', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                  All →
                </button>
              }
            >
              {notices.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>No notices yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notices.map(n => (
                    <div key={n.id} style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: 10, borderLeft: '3px solid #1e40af' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 3 }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.content}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{timeSince(n.created_at)} · {n.target_audience}</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {/* AI Command Center */}
          <div className="principal-panel" style={{ animationDelay: '0.2s', gridColumn: '1 / -1' }}>
            <Panel
              title="AI Command Center"
              icon="🧠"
              action={
                <button
                  onClick={generateAiSummary}
                  disabled={aiSummaryLoading}
                  style={{ padding: '6px 14px', background: aiSummaryLoading ? '#93c5fd' : 'linear-gradient(135deg,#1e40af,#7c3aed)', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: aiSummaryLoading ? 'not-allowed' : 'pointer' }}
                >
                  {aiSummaryLoading ? 'Generating…' : '⚡ Generate Daily Brief'}
                </button>
              }
            >
              {!aiSummary && !aiSummaryLoading && !aiSummaryErr && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>
                  Click &quot;Generate Daily Brief&quot; for an AI-powered school status summary
                </div>
              )}
              {aiSummaryLoading && (
                <div style={{ padding: '20px 0', color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
                  Analysing school data…
                </div>
              )}
              {aiSummaryErr && (
                <div style={{ padding: '12px', background: '#fef2f2', borderRadius: 10, color: '#dc2626', fontSize: 13 }}>
                  {aiSummaryErr}
                </div>
              )}
              {aiSummary && (
                <div style={{ padding: '16px', background: '#f0f9ff', borderRadius: 12, border: '1px solid #bae6fd' }}>
                  <p style={{ fontSize: 13, lineHeight: 1.7, color: '#0c4a6e', whiteSpace: 'pre-wrap', margin: 0 }}>
                    {aiSummary}
                  </p>
                </div>
              )}
            </Panel>
          </div>

          {/* Quick actions */}
          <div className="principal-panel" style={{ animationDelay: '0.23s' }}>
            <Panel title="Quick Actions" icon="⚡">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {([
                  { label: 'New Notice',    icon: '📢', path: '/dashboard/notices' },
                  { label: 'Discipline',    icon: '📋', path: '/dashboard/discipline' },
                  { label: 'Staff',         icon: '👥', path: '/dashboard/staff' },
                  { label: 'Students',      icon: '🎓', path: '/dashboard/students' },
                  { label: 'Timetable',     icon: '📅', path: '/dashboard/timetable' },
                  { label: 'Calendar',      icon: '📆', path: '/dashboard/principal/calendar' },
                  { label: 'Fee Reminders', icon: '💰', path: '/dashboard/bursar' },
                  { label: 'School Profile',icon: '🏫', path: '/dashboard/school-profile' },
                ]).map(a => (
                  <button
                    key={a.path}
                    onClick={() => router.push(a.path)}
                    style={{
                      padding: '12px 10px', borderRadius: 12,
                      background: '#f9fafb', border: '1px solid #f3f4f6',
                      cursor: 'pointer', textAlign: 'center',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#eff6ff'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#dbeafe' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#f3f4f6' }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{a.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{a.label}</div>
                  </button>
                ))}
              </div>
            </Panel>
          </div>

        </div>
      </div>

      {/* ── Emergency Broadcast Modal ───────────────────────────────────── */}
      {showEmergency && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
          onClick={e => { if (e.target === e.currentTarget) setShowEmergency(false) }}
        >
          <div style={{
            background: 'white', borderRadius: 20, width: '100%', maxWidth: 540,
            boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ background: '#dc2626', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>🚨 Emergency Broadcast</div>
                <div style={{ fontSize: 12, color: '#fecaca', marginTop: 3 }}>Will be sent to ALL registered parents immediately</div>
              </div>
              <button onClick={() => setShowEmergency(false)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 18 }}>
                ×
              </button>
            </div>

            <div style={{ padding: 24 }}>
              {broadcastResult ? (
                // Result screen
                <div>
                  {broadcastResult.ok ? (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>Broadcast Sent</div>
                      <div style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>
                        {broadcastResult.sent} parent{broadcastResult.sent !== 1 ? 's' : ''} notified
                        {(broadcastResult.failed ?? 0) > 0 && ` · ${broadcastResult.failed} failed`}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                        SMS fallback will be sent to unconfirmed parents after 30 minutes.
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
                      <div style={{ fontSize: 16, color: '#dc2626', fontWeight: 600 }}>Broadcast failed</div>
                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>Check that parents are registered via the WhatsApp bot.</div>
                    </div>
                  )}
                  <button
                    onClick={() => { setShowEmergency(false); setBroadcastResult(null) }}
                    style={{ width: '100%', padding: '12px', borderRadius: 12, background: '#1e40af', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, marginTop: 16 }}
                  >
                    Close
                  </button>
                </div>
              ) : (
                // Compose screen
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                      Emergency Type
                    </label>
                    <select
                      value={broadcastType}
                      onChange={e => setBroadcastType(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, background: '#f9fafb' }}
                    >
                      <option value="school_closure">School Closure</option>
                      <option value="lockdown">Lockdown / Security Alert</option>
                      <option value="natural_disaster">Natural Disaster</option>
                      <option value="health_emergency">Health Emergency</option>
                      <option value="infrastructure">Infrastructure Issue</option>
                      <option value="government_directive">Government Directive</option>
                      <option value="custom">Custom Notice</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                      Message <span style={{ color: '#9ca3af', fontWeight: 400 }}>({broadcastMsg.length}/1000)</span>
                    </label>
                    <textarea
                      value={broadcastMsg}
                      onChange={e => setBroadcastMsg(e.target.value)}
                      maxLength={1000}
                      rows={5}
                      placeholder="Enter the emergency message for all parents..."
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 10,
                        border: '1px solid #e5e7eb', fontSize: 14, resize: 'vertical',
                        background: '#f9fafb', boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px' }}>
                    <p style={{ margin: 0, fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>⚠️ This will immediately WhatsApp ALL registered parents.</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>
                      A &quot;Reply YES to confirm&quot; prompt will be appended. SMS fallback fires after 30 min for unconfirmed parents.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => setShowEmergency(false)}
                      style={{ flex: 1, padding: '12px', borderRadius: 12, border: '2px solid #e5e7eb', background: 'white', cursor: 'pointer', fontWeight: 600, color: '#374151' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={sendEmergency}
                      disabled={broadcastLoading || !broadcastMsg.trim()}
                      style={{
                        flex: 2, padding: '12px', borderRadius: 12,
                        background: broadcastLoading || !broadcastMsg.trim() ? '#fca5a5' : '#dc2626',
                        color: 'white', border: 'none', cursor: broadcastLoading || !broadcastMsg.trim() ? 'not-allowed' : 'pointer',
                        fontWeight: 700, fontSize: 15,
                      }}
                    >
                      {broadcastLoading ? 'Sending...' : '🚨 Send Emergency Broadcast'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
