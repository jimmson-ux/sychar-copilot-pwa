'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter }  from 'next/navigation'
import Link from 'next/link'

const G  = '#16a34a'
const GL = '#15803d'

interface Child {
  id:   string
  full_name: string
  date_of_birth: string | null
  gender: string | null
  stream: string | null
  classes: { name: string; level: number } | null
}

interface Notice {
  id:           string
  title:        string
  body:         string
  category:     string
  published_at: string
}

interface FeeBalance {
  invoiced_amount:  number
  paid_amount:      number
  current_balance:  number
  last_payment_at:  string | null
}

function authHeaders() {
  const token = localStorage.getItem('parent_token')
  return { Authorization: `Bearer ${token}` }
}

function fmtKES(n: number) {
  return `KES ${n.toLocaleString('en-KE')}`
}

function ageStr(dob: string | null) {
  if (!dob) return ''
  const y = Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
  return `${y} yrs`
}

function NoticeCard({ n }: { n: Notice }) {
  const [open, setOpen] = useState(false)
  const catColor: Record<string, string> = {
    Finance: '#2563eb', Administrative: '#7c3aed', Examinations: '#ea580c',
    Events: '#16a34a', Welfare: '#0891b2', default: '#6b7280',
  }
  const col = catColor[n.category] ?? catColor.default
  return (
    <div onClick={() => setOpen(!open)} style={{ background: 'white', borderRadius: 12, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 10, background: col + '18', color: col, padding: '3px 8px', borderRadius: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', marginTop: 1 }}>
          {n.category}
        </span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>{n.title}</p>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '3px 0 0' }}>
            {new Date(n.published_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <span style={{ color: '#9ca3af', fontSize: 14 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <p style={{ fontSize: 13, color: '#374151', marginTop: 12, marginBottom: 0, lineHeight: 1.6 }}>{n.body}</p>}
    </div>
  )
}

export default function ParentDashboardPage() {
  const router = useRouter()
  const [children,  setChildren]  = useState<Child[]>([])
  const [notices,   setNotices]   = useState<Notice[]>([])
  const [balances,  setBalances]  = useState<Record<string, FeeBalance>>({})
  const [loading,   setLoading]   = useState(true)
  const [greeting,  setGreeting]  = useState('Hello')

  const load = useCallback(async () => {
    const token = localStorage.getItem('parent_token')
    if (!token) { router.replace('/parent'); return }

    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')

    try {
      const [childRes, noticeRes] = await Promise.all([
        fetch('/api/parent/child',   { headers: authHeaders() }),
        fetch('/api/parent/notices', { headers: authHeaders() }),
      ])

      if (childRes.status === 401) { router.replace('/parent'); return }

      const childData  = childRes.ok  ? await childRes.json()  : { students: [] }
      const noticeData = noticeRes.ok ? await noticeRes.json() : { notices: [] }

      setChildren(childData.students ?? [])
      setNotices(noticeData.notices ?? [])

      // Load fee balances for each child
      const kids: Child[] = childData.students ?? []
      const balanceMap: Record<string, FeeBalance> = {}
      await Promise.all(kids.map(async (c: Child) => {
        try {
          const r = await fetch(`/api/parent/student/${c.id}/fee`, { headers: authHeaders() })
          if (r.ok) {
            const d = await r.json()
            balanceMap[c.id] = d.balance
          }
        } catch { /* ignore */ }
      }))
      setBalances(balanceMap)

    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { load() }, [load])

  function signOut() {
    localStorage.removeItem('parent_token')
    localStorage.removeItem('parent_school_id')
    localStorage.removeItem('parent_student_ids')
    router.replace('/parent')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: G }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏫</div>
          <p style={{ fontSize: 14, fontWeight: 600 }}>Loading…</p>
        </div>
      </div>
    )
  }

  const totalOwed = Object.values(balances).reduce((s, b) => s + (b?.current_balance ?? 0), 0)

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ background: G, padding: '20px 20px 48px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 12, opacity: 0.8, margin: 0 }}>{greeting}</p>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '2px 0 0' }}>Parent Portal</h2>
          </div>
          <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ padding: '0 16px', marginTop: -28 }}>

        {/* Fee summary card */}
        {totalOwed > 0 && (
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 14, padding: '14px 18px', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#92400e', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Outstanding Fees</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#78350f', margin: '4px 0 0' }}>{fmtKES(totalOwed)}</p>
              </div>
              <span style={{ fontSize: 28 }}>⚠️</span>
            </div>
          </div>
        )}

        {/* Children cards */}
        <section style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {children.length === 1 ? 'Your Child' : 'Your Children'}
          </h3>

          {children.length === 0 ? (
            <div style={{ background: 'white', borderRadius: 14, padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              No children linked to your account yet.
            </div>
          ) : (
            children.map(child => {
              const bal    = balances[child.id]
              const owed   = bal?.current_balance ?? 0
              const paid   = bal?.paid_amount ?? 0
              const total  = bal?.invoiced_amount ?? 0
              const pct    = total > 0 ? Math.round((paid / total) * 100) : 100

              return (
                <Link key={child.id} href={`/parent/child/${child.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: 'white', borderRadius: 16, padding: '16px 18px', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: child.gender === 'female' ? '#fce7f3' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                          {child.gender === 'female' ? '👧' : '👦'}
                        </div>
                        <div>
                          <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>{child.full_name}</p>
                          <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>
                            {child.classes?.name ?? `Form ${child.stream ?? '—'}`}
                            {child.date_of_birth ? ` · ${ageStr(child.date_of_birth)}` : ''}
                          </p>
                        </div>
                      </div>
                      <span style={{ color: '#9ca3af', fontSize: 18 }}>›</span>
                    </div>

                    {/* Fee progress bar */}
                    {total > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: '#6b7280' }}>Fees paid</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: owed > 0 ? '#d97706' : G }}>{pct}%</span>
                        </div>
                        <div style={{ height: 5, background: '#f1f5f9', borderRadius: 99 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: owed > 0 ? '#f59e0b' : G, borderRadius: 99 }} />
                        </div>
                        {owed > 0 && (
                          <p style={{ fontSize: 11, color: '#d97706', margin: '5px 0 0', fontWeight: 600 }}>
                            {fmtKES(owed)} outstanding
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              )
            })
          )}
        </section>

        {/* Notices */}
        {notices.length > 0 && (
          <section>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              School Notices
            </h3>
            {notices.slice(0, 8).map(n => <NoticeCard key={n.id} n={n} />)}
          </section>
        )}
      </div>
    </div>
  )
}
