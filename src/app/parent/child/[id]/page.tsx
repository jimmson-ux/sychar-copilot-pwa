'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'

const G = '#16a34a'

function authHeaders() {
  const t = typeof window !== 'undefined' ? localStorage.getItem('parent_token') : null
  return { Authorization: `Bearer ${t}` }
}
function fmtKES(n: number) { return `KES ${n.toLocaleString('en-KE')}` }

type Tab = 'marks' | 'fees' | 'attendance' | 'discipline'

interface MarkRow    { subject: string | null; score: number | null; percentage: number | null; grade: string | null }
interface TrendRow   { period: string; avg: number }
interface FeeRecord  { amount_paid: number; payment_date: string; payment_method: string; receipt_number: string | null; term: string | null }
interface FeeBalance { invoiced_amount: number; paid_amount: number; current_balance: number; last_payment_at: string | null }
interface AttendRow  { date: string; status: string; remarks: string | null }
interface AttSummary { total: number; present: number; absent: number; late: number; rate: number | null }
interface DiscRow    { id: string; incident_date: string; allegation: string; action_taken: string | null; status: string; parent_informed: boolean; suspension_days: number | null }
interface ChildInfo  { full_name: string; gender: string | null; classes: { name: string } | null; form: number | null }

const GRADE_COLOR: Record<string, string> = {
  'A': '#15803d', 'A+': '#15803d', 'A-': '#16a34a',
  'B': '#1d4ed8', 'B+': '#2563eb', 'B-': '#3b82f6',
  'C': '#d97706', 'C+': '#b45309', 'C-': '#92400e',
  'D': '#dc2626', 'D+': '#b91c1c', 'D-': '#991b1b',
  'E': '#7f1d1d',
}

export default function ChildDetailPage() {
  const router   = useRouter()
  const { id }   = useParams<{ id: string }>()
  const [tab,    setTab]    = useState<Tab>('marks')
  const [child,  setChild]  = useState<ChildInfo | null>(null)
  const [marks,  setMarks]  = useState<MarkRow[]>([])
  const [trend,  setTrend]  = useState<TrendRow[]>([])
  const [fees,   setFees]   = useState<{ balance: FeeBalance; payments: FeeRecord[]; paybill: { number: string | null } }>({ balance: { invoiced_amount: 0, paid_amount: 0, current_balance: 0, last_payment_at: null }, payments: [], paybill: { number: null } })
  const [att,    setAtt]    = useState<{ records: AttendRow[]; summary: AttSummary }>({ records: [], summary: { total: 0, present: 0, absent: 0, late: 0, rate: null } })
  const [disc,   setDisc]   = useState<DiscRow[]>([])
  const [loaded, setLoaded] = useState<Set<Tab>>(new Set())
  const [err,    setErr]    = useState('')

  const ensureLoaded = useCallback(async (t: Tab) => {
    if (loaded.has(t)) return
    const token = localStorage.getItem('parent_token')
    if (!token) { router.replace('/parent'); return }

    try {
      if (t === 'marks') {
        const r = await fetch(`/api/parent/student/${id}/marks?term=1&year=2026`, { headers: authHeaders() })
        if (r.status === 401) { router.replace('/parent'); return }
        if (r.status === 403) { setErr('Access denied for this student.'); return }
        const d = await r.json()
        setMarks(d.marks ?? [])
        setTrend(d.termTrend ?? [])
      } else if (t === 'fees') {
        const r = await fetch(`/api/parent/student/${id}/fee`, { headers: authHeaders() })
        const d = await r.json()
        setFees({ balance: d.balance, payments: d.payments ?? [], paybill: d.paybill })
      } else if (t === 'attendance') {
        const r = await fetch(`/api/parent/student/${id}/attendance`, { headers: authHeaders() })
        const d = await r.json()
        setAtt({ records: d.records ?? [], summary: d.summary })
      } else if (t === 'discipline') {
        const r = await fetch(`/api/parent/student/${id}/discipline`, { headers: authHeaders() })
        const d = await r.json()
        setDisc(d.records ?? [])
      }
      setLoaded(prev => new Set([...prev, t]))
    } catch {
      setErr('Failed to load data. Check connection.')
    }
  }, [id, loaded, router])

  useEffect(() => {
    const token = localStorage.getItem('parent_token')
    if (!token) { router.replace('/parent'); return }
    ;(async () => {
      const r = await fetch('/api/parent/child', { headers: authHeaders() })
      if (!r.ok) return
      const d = await r.json()
      const found = (d.students ?? []).find((c: ChildInfo & { id: string }) => c.id === id)
      if (found) setChild(found)
    })()
    ensureLoaded('marks')
  }, [id, ensureLoaded, router])

  function switchTab(t: Tab) {
    setTab(t)
    ensureLoaded(t)
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'marks',      label: 'Marks',      icon: '📊' },
    { key: 'fees',       label: 'Fees',        icon: '💳' },
    { key: 'attendance', label: 'Attendance',  icon: '✅' },
    { key: 'discipline', label: 'Conduct',     icon: '⚖️' },
  ]

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100dvh' }}>
      {/* Header */}
      <div style={{ background: G, padding: '16px 16px 56px', color: 'white' }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer', marginBottom: 14, fontWeight: 600 }}
        >
          ← Back
        </button>
        {child && (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
              {child.gender === 'female' ? '👧' : '👦'}
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{child.full_name}</h2>
              <p style={{ fontSize: 12, opacity: 0.8, margin: '3px 0 0' }}>{child.classes?.name ?? `Form ${child.form ?? '?'}`}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'white', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10, marginTop: -28, borderRadius: '14px 14px 0 0', overflow: 'hidden' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => switchTab(t.key)} style={{
            flex: 1, padding: '12px 4px 10px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
            background: tab === t.key ? '#f0fdf4' : 'white',
            color:      tab === t.key ? G : '#6b7280',
            borderBottom: tab === t.key ? `2.5px solid ${G}` : '2.5px solid transparent',
            transition: 'all 0.15s',
          }}>
            <div style={{ fontSize: 18, marginBottom: 2 }}>{t.icon}</div>
            {t.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ margin: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#dc2626' }}>{err}</div>
      )}

      <div style={{ padding: '16px' }}>

        {/* ── MARKS ── */}
        {tab === 'marks' && (
          <div>
            {trend.length > 0 && (
              <div style={{ background: 'white', borderRadius: 14, padding: '14px 16px', marginBottom: 16, border: '1px solid #e5e7eb' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Term Average Trend</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 60 }}>
                  {trend.map(tr => (
                    <div key={tr.period} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ background: G, borderRadius: '3px 3px 0 0', height: `${tr.avg}%`, minHeight: 4, transition: 'height 0.3s' }} />
                      <p style={{ fontSize: 9, color: '#9ca3af', margin: '4px 0 0' }}>{tr.period}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {marks.length === 0 ? (
              <div style={{ background: 'white', borderRadius: 14, padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13, border: '1px solid #e5e7eb' }}>
                No marks recorded for Term 1 2026 yet.
              </div>
            ) : (
              <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                {marks.map((m, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < marks.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <p style={{ fontSize: 14, color: '#111827', fontWeight: 500, margin: 0 }}>{m.subject ?? '—'}</p>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 14, color: '#374151' }}>{m.percentage != null ? `${m.percentage}%` : '—'}</span>
                      {m.grade && (
                        <span style={{ fontSize: 13, fontWeight: 700, color: GRADE_COLOR[m.grade] ?? '#374151', minWidth: 24, textAlign: 'center' }}>
                          {m.grade}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── FEES ── */}
        {tab === 'fees' && (
          <div>
            <div style={{ background: fees.balance.current_balance > 0 ? '#fef3c7' : '#f0fdf4', border: `1px solid ${fees.balance.current_balance > 0 ? '#fcd34d' : '#86efac'}`, borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Outstanding Balance</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: fees.balance.current_balance > 0 ? '#92400e' : G, margin: 0 }}>
                {fmtKES(fees.balance.current_balance)}
              </p>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '6px 0 0' }}>
                Invoiced: {fmtKES(fees.balance.invoiced_amount)} · Paid: {fmtKES(fees.balance.paid_amount)}
              </p>
            </div>

            {fees.paybill.number && (
              <div style={{ background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', margin: '0 0 4px' }}>Pay via M-PESA</p>
                <p style={{ fontSize: 14, color: '#1e40af', margin: 0 }}>
                  Paybill: <strong>{fees.paybill.number}</strong> · Account: Admission No.
                </p>
              </div>
            )}

            {fees.payments.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Recent Payments</p>
                <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                  {fees.payments.map((p, i) => (
                    <div key={i} style={{ padding: '12px 16px', borderBottom: i < fees.payments.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 600, color: G, margin: 0 }}>{fmtKES(p.amount_paid)}</p>
                          <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>
                            {new Date(p.payment_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {p.receipt_number ? ` · ${p.receipt_number}` : ''}
                          </p>
                        </div>
                        <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', borderRadius: 8, padding: '3px 8px', fontWeight: 500, textTransform: 'capitalize', alignSelf: 'center' }}>
                          {p.payment_method}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ATTENDANCE ── */}
        {tab === 'attendance' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Rate',    value: att.summary.rate != null ? `${att.summary.rate}%` : '—', color: att.summary.rate != null && att.summary.rate >= 90 ? G : '#d97706' },
                { label: 'Present', value: att.summary.present, color: G },
                { label: 'Absent',  value: att.summary.absent,  color: '#dc2626' },
                { label: 'Late',    value: att.summary.late,    color: '#d97706' },
              ].map(s => (
                <div key={s.label} style={{ background: 'white', borderRadius: 12, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                  <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
                  {s.label === 'Rate' && <p style={{ fontSize: 10, color: '#9ca3af', margin: '3px 0 0' }}>Last 14 days</p>}
                </div>
              ))}
            </div>

            {att.records.length === 0 ? (
              <div style={{ background: 'white', borderRadius: 14, padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13, border: '1px solid #e5e7eb' }}>
                No attendance records in the last 14 days.
              </div>
            ) : (
              <div style={{ background: 'white', borderRadius: 14, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                {att.records.map((r, i) => {
                  const col = r.status === 'present' ? G : r.status === 'absent' ? '#dc2626' : '#d97706'
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', borderBottom: i < att.records.length - 1 ? '1px solid #f1f5f9' : 'none', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: '#374151' }}>
                        {new Date(r.date).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: col, textTransform: 'capitalize', background: col + '18', borderRadius: 8, padding: '3px 10px' }}>
                        {r.status}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── DISCIPLINE ── */}
        {tab === 'discipline' && (
          <div>
            {disc.length === 0 ? (
              <div style={{ background: 'white', borderRadius: 14, padding: 32, textAlign: 'center', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: G, margin: 0 }}>All Clear!</p>
                <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>No conduct records on file.</p>
              </div>
            ) : (
              disc.map((d, i) => {
                const col = d.status === 'Resolved' ? G : '#d97706'
                return (
                  <div key={d.id} style={{ background: 'white', borderRadius: 14, padding: '16px', marginBottom: 12, border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>
                        {new Date(d.incident_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: col, background: col + '18', borderRadius: 8, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {d.status}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: '#374151', fontWeight: 500, margin: '0 0 6px' }}>{d.allegation}</p>
                    {d.action_taken && (
                      <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                        <strong>Action:</strong> {d.action_taken}
                      </p>
                    )}
                    {d.suspension_days != null && d.suspension_days > 0 && (
                      <p style={{ fontSize: 12, color: '#dc2626', margin: '4px 0 0', fontWeight: 600 }}>
                        Suspended: {d.suspension_days} day{d.suspension_days > 1 ? 's' : ''}
                      </p>
                    )}
                    {!d.parent_informed && (
                      <p style={{ fontSize: 11, color: '#d97706', margin: '6px 0 0' }}>⚠️ Parent not yet formally notified</p>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
