'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface PlatformStats {
  total_schools: number
  by_status: Record<string, number>
  total_active_students: number
  mrr: number
  arr: number
}

interface PaymentApproval {
  id: string
  school_id: string
  amount: number
  payment_ref: string
  virtual_account: string | null
  expected_amount: number | null
  tier_expected: number | null
  status: string
  created_at: string
  schools: { name: string }
}

interface Subscription {
  status: string
  trialEndsAt: string | null
  amountPaid: number
  smsUsed: number
  smsQuota: number
}

interface SchoolRow {
  id: string
  name: string
  county: string | null
  tier: string
  isActive: boolean
  createdAt: string
  themeColor: string | null
  staffCount: number
  health: 'green' | 'amber' | 'red'
  subscription: Subscription | null
}

interface Summary {
  total: number
  active: number
  green: number
  amber: number
  red: number
  totalRevenue: number
}

function HealthDot({ health }: { health: 'green' | 'amber' | 'red' }) {
  const c = { green: '#4ade80', amber: '#fbbf24', red: '#f87171' }[health]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0, boxShadow: `0 0 6px ${c}` }} />
      <span style={{ fontSize: 12, color: c, textTransform: 'capitalize' }}>{health}</span>
    </div>
  )
}

function SubBadge({ sub }: { sub: Subscription | null }) {
  if (!sub) return <span style={{ fontSize: 12, color: '#475569' }}>—</span>

  const daysLeft = sub.trialEndsAt
    ? Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86400000)
    : null

  const isTrial    = sub.status === 'trial'
  const isActive   = sub.status === 'active'
  const isSuspended = sub.status === 'suspended' || sub.status === 'expired'

  const bg  = isSuspended ? '#450a0a' : isTrial ? '#1c1917' : '#052e16'
  const col = isSuspended ? '#f87171' : isTrial ? '#fbbf24' : '#4ade80'
  const label = isTrial
    ? `Trial${daysLeft !== null ? ` (${daysLeft}d)` : ''}`
    : sub.status.charAt(0).toUpperCase() + sub.status.slice(1)

  return (
    <span style={{ background: bg, color: col, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500 }}>
      {label}
    </span>
  )
}

function SmsBar({ used, quota }: { used: number; quota: number }) {
  if (!quota) return <span style={{ fontSize: 12, color: '#475569' }}>—</span>
  const pct = Math.min(100, Math.round((used / quota) * 100))
  const col = pct > 85 ? '#f87171' : pct > 60 ? '#fbbf24' : '#4ade80'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 5, background: '#1e293b', borderRadius: 3, minWidth: 50 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{used}/{quota}</span>
    </div>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{
      background: '#1e293b', borderRadius: 12, padding: '16px 18px',
      borderTop: `3px solid ${color}`, flex: 1, minWidth: 0,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: color, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

const SUPER_SECRET = process.env.NEXT_PUBLIC_SUPER_ADMIN_SECRET ?? ''

export default function SuperDashboardPage() {
  const router = useRouter()
  const [tab,      setTab]      = useState<'schools' | 'payments' | 'stats'>('schools')
  const [schools,  setSchools]  = useState<SchoolRow[]>([])
  const [summary,  setSummary]  = useState<Summary | null>(null)
  const [stats,    setStats]    = useState<PlatformStats | null>(null)
  const [queue,    setQueue]    = useState<PaymentApproval[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [filter,   setFilter]   = useState<'all' | 'green' | 'amber' | 'red'>('all')
  const [actioning, setActioning] = useState<string | null>(null)

  const adminHeaders = { 'x-super-admin-secret': SUPER_SECRET }

  const loadQueue = useCallback(async () => {
    const r = await fetch('/api/admin/subscriptions?action=queue', { headers: adminHeaders })
    if (r.ok) { const d = await r.json(); setQueue(d.approvals ?? []) }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const loadStats = useCallback(async () => {
    const r = await fetch('/api/admin/subscriptions?action=stats', { headers: adminHeaders })
    if (r.ok) { const d = await r.json(); setStats(d) }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/super/login'); return }

      const res = await fetch('/api/super/schools')
      if (res.status === 401 || res.status === 403) { router.push('/super/login'); return }
      if (!res.ok) { setError('Failed to load schools'); setLoading(false); return }

      const json = await res.json()
      setSchools(json.schools ?? [])
      setSummary(json.summary ?? null)
      setLoading(false)
      loadQueue()
      loadStats()
    }
    load().catch(() => { setError('Unexpected error'); setLoading(false) })
  }, [router, loadQueue, loadStats])

  async function approvePayment(approvalId: string) {
    setActioning(approvalId)
    await fetch('/api/admin/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify({ action: 'approve', approval_id: approvalId }),
    })
    setActioning(null)
    loadQueue()
    loadStats()
  }

  async function flagPayment(approvalId: string) {
    const notes = window.prompt('Flag reason:')
    if (!notes) return
    setActioning(approvalId)
    await fetch('/api/admin/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify({ action: 'flag', approval_id: approvalId, notes }),
    })
    setActioning(null)
    loadQueue()
  }

  async function toggleFreeze(schoolId: string, currentStatus: string) {
    const action = currentStatus === 'frozen' ? 'unfreeze' : 'freeze'
    if (!window.confirm(`${action === 'freeze' ? 'Freeze' : 'Unfreeze'} this school?`)) return
    setActioning(schoolId)
    await fetch('/api/admin/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify({ action, school_id: schoolId }),
    })
    setActioning(null)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    document.cookie = 'sychar-role=; path=/; max-age=0'
    document.cookie = 'sychar-sub=; path=/; max-age=0'
    router.push('/super/login')
  }

  const visible = filter === 'all' ? schools : schools.filter(s => s.health === filter)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#64748b' }}>
        Loading…
      </div>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', padding: '28px 24px', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#09D1C7' }}>Sychar CoPilot</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>Super Admin Console</div>
        </div>
        <button
          onClick={handleSignOut}
          style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
        >
          Sign Out
        </button>
      </header>

      {error && (
        <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 10, padding: '12px 16px', marginBottom: 20, color: '#fca5a5', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Summary stats */}
      {summary && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <StatCard label="Total schools"   value={summary.total}  color="#09D1C7" />
          <StatCard label="Active"          value={summary.active} color="#4ade80" />
          <StatCard label="Healthy"         value={summary.green}  sub={`${summary.amber} amber · ${summary.red} red`} color="#4ade80" />
          <StatCard label="Total revenue"   value={`KES ${summary.totalRevenue.toLocaleString()}`} color="#a78bfa" />
          {stats && <>
            <StatCard label="MRR"  value={`KES ${stats.mrr.toLocaleString()}`}  color="#fbbf24" sub="Monthly recurring" />
            <StatCard label="ARR"  value={`KES ${stats.arr.toLocaleString()}`}  color="#f59e0b" sub="Annual recurring" />
            <StatCard label="Students" value={stats.total_active_students.toLocaleString()} color="#818cf8" />
            {queue.length > 0 && <StatCard label="Payment Queue" value={queue.length} color="#f87171" sub="Awaiting approval" />}
          </>}
        </div>
      )}

      {/* Main tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1e293b', marginBottom: 20 }}>
        {([['schools', 'Schools'], ['payments', `Payments${queue.length > 0 ? ` (${queue.length})` : ''}`], ['stats', 'Platform Stats']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t as typeof tab)}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? '#09D1C7' : '#64748b', background: 'none', border: 'none',
              borderBottom: tab === t ? '2px solid #09D1C7' : '2px solid transparent',
              cursor: 'pointer', marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── PAYMENT QUEUE TAB ──────────────────────────────────────────────── */}
      {tab === 'payments' && (
        <section>
          {queue.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>No pending payments</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {queue.map(p => {
                const isUnder = p.expected_amount != null && p.amount < p.expected_amount
                return (
                  <div key={p.id} style={{ background: '#1e293b', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 14 }}>{p.schools?.name ?? p.school_id}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        Ref: <span style={{ color: '#94a3b8' }}>{p.payment_ref}</span>
                        {p.virtual_account && <> · VA: <span style={{ color: '#94a3b8' }}>{p.virtual_account}</span></>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: isUnder ? '#f87171' : '#4ade80' }}>
                        KES {p.amount.toLocaleString()}
                      </div>
                      {p.expected_amount != null && (
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          Expected KES {p.expected_amount.toLocaleString()} (Tier {p.tier_expected})
                          {isUnder && <span style={{ color: '#f87171', marginLeft: 4 }}>⚠ Underpayment</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => approvePayment(p.id)} disabled={actioning === p.id}
                        style={{ background: '#14532d', color: '#4ade80', border: '1px solid #166534', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: actioning === p.id ? 0.5 : 1 }}>
                        {actioning === p.id ? '…' : '✓ Approve'}
                      </button>
                      <button onClick={() => flagPayment(p.id)} disabled={actioning === p.id}
                        style={{ background: '#450a0a', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: actioning === p.id ? 0.5 : 1 }}>
                        Flag
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ── PLATFORM STATS TAB ────────────────────────────────────────────── */}
      {tab === 'stats' && stats && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatCard label="Total Schools"    value={stats.total_schools} color="#09D1C7" />
            <StatCard label="Active Students"  value={stats.total_active_students.toLocaleString()} color="#4ade80" />
            <StatCard label="MRR"              value={`KES ${stats.mrr.toLocaleString()}`} color="#fbbf24" />
            <StatCard label="ARR"              value={`KES ${stats.arr.toLocaleString()}`} color="#f59e0b" />
          </div>
          <div style={{ background: '#1e293b', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>By Status</div>
            {Object.entries(stats.by_status).map(([status, count]) => (
              <div key={status} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #0f172a', fontSize: 13 }}>
                <span style={{ textTransform: 'capitalize', color: '#94a3b8' }}>{status.replace('_', ' ')}</span>
                <strong style={{ color: '#f1f5f9' }}>{count}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── SCHOOLS TAB ───────────────────────────────────────────────────── */}
      {tab === 'schools' && <>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {(['all', 'green', 'amber', 'red'] as const).map(f => {
          const active = filter === f
          const col = f === 'all' ? '#09D1C7' : f === 'green' ? '#4ade80' : f === 'amber' ? '#fbbf24' : '#f87171'
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none',
                background: active ? col + '22' : '#1e293b',
                color: active ? col : '#64748b',
                cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400,
                outline: active ? `1px solid ${col}44` : 'none',
                textTransform: 'capitalize',
              }}
            >
              {f === 'all' ? `All (${schools.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${schools.filter(s => s.health === f).length})`}
            </button>
          )
        })}
      </div>

      {/* Schools table */}
      <section>
        {visible.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>
            No schools in this category.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#475569', textAlign: 'left' }}>
                  {['School', 'County', 'Tier', 'Health', 'Subscription', 'Staff', 'SMS', 'Joined', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(s => (
                  <tr
                    key={s.id}
                    style={{ borderBottom: '1px solid #1e293b', cursor: 'default' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#1e293b'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                  >
                    <td style={{ padding: '11px 12px' }}>
                      <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{s.name}</div>
                    </td>
                    <td style={{ padding: '11px 12px', color: '#64748b' }}>{s.county ?? '—'}</td>
                    <td style={{ padding: '11px 12px', color: '#09D1C7', textTransform: 'capitalize' }}>{s.tier}</td>
                    <td style={{ padding: '11px 12px' }}><HealthDot health={s.health} /></td>
                    <td style={{ padding: '11px 12px' }}><SubBadge sub={s.subscription} /></td>
                    <td style={{ padding: '11px 12px', color: '#94a3b8' }}>{s.staffCount}</td>
                    <td style={{ padding: '11px 12px', minWidth: 120 }}>
                      {s.subscription
                        ? <SmsBar used={s.subscription.smsUsed} quota={s.subscription.smsQuota} />
                        : <span style={{ fontSize: 12, color: '#475569' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {new Date(s.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => toggleFreeze(s.id, s.subscription?.status ?? '')}
                        disabled={actioning === s.id}
                        style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                          fontWeight: 600, border: 'none', opacity: actioning === s.id ? 0.5 : 1,
                          background: s.subscription?.status === 'frozen' ? '#14532d' : '#450a0a',
                          color:      s.subscription?.status === 'frozen' ? '#4ade80'  : '#f87171',
                        }}>
                        {s.subscription?.status === 'frozen' ? 'Unfreeze' : 'Freeze'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>}

    </main>
  )
}
