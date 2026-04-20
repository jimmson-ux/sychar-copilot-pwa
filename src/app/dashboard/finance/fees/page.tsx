'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/roles'

interface StudentBalance {
  id: string
  student_id: string
  total_fees: number
  amount_paid: number
  students: { full_name: string; admission_number: string; class_name: string } | null
}

interface FeeTransaction {
  id: string
  amount: number
  payment_method: string
  reference_number: string
  payment_date: string
  student_id: string
}

export default function FeeCollectionPage() {
  const [balances, setBalances] = useState<StudentBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [showPayment, setShowPayment] = useState<StudentBalance | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('M-Pesa')
  const [ref, setRef] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: staff } = await supabase
      .from('staff_records').select('school_id').eq('user_id', user.id).single()
    if (!staff) return
    setSchoolId(staff.school_id)
    const { data } = await supabase
      .from('fee_balances')
      .select('id, student_id, total_fees, amount_paid, students(full_name, admission_number, class_name)')
      .eq('school_id', staff.school_id)
      .order('amount_paid', { ascending: true })
      .limit(200)
    setBalances((data as unknown as StudentBalance[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = search.trim()
    ? balances.filter(b => {
        const s = b.students
        if (!s) return false
        const q = search.toLowerCase()
        return s.full_name.toLowerCase().includes(q) || s.admission_number.toLowerCase().includes(q)
      })
    : balances

  async function recordPayment() {
    if (!showPayment || !amount || !ref) return
    setSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase.from('fee_transactions').insert({
      school_id: schoolId,
      student_id: showPayment.student_id,
      amount: parseFloat(amount),
      payment_method: method,
      reference_number: ref,
      payment_date: new Date().toISOString(),
    })
    if (!error) {
      await supabase.from('fee_balances').update({
        amount_paid: showPayment.amount_paid + parseFloat(amount),
      }).eq('id', showPayment.id)
    }
    setSubmitting(false)
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setMsg({ ok: true, text: `Payment of ${formatCurrency(parseFloat(amount))} recorded` })
    setShowPayment(null)
    setAmount(''); setRef('')
    load()
  }

  const totalFees = balances.reduce((s, b) => s + b.total_fees, 0)
  const totalPaid = balances.reduce((s, b) => s + b.amount_paid, 0)
  const pct = totalFees > 0 ? Math.round((totalPaid / totalFees) * 100) : 0

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          Fee Collection
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Nkoroi Mixed Senior Secondary School</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Invoiced', value: formatCurrency(totalFees), color: '#2176FF' },
          { label: 'Total Collected', value: formatCurrency(totalPaid), color: '#16a34a' },
          { label: 'Collection Rate', value: `${pct}%`, color: pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626' },
        ].map(c => (
          <div key={c.label} style={{
            background: 'white', border: '1px solid #f1f5f9', borderRadius: 14,
            padding: '16px 20px', borderTop: `3px solid ${c.color}`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color, fontFamily: 'Space Grotesk, sans-serif' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 14, padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Collection Progress</span>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{pct}%</span>
        </div>
        <div style={{ height: 10, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626', borderRadius: 5, transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {msg && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: msg.ok ? '#f0fdf4' : '#fef2f2', color: msg.ok ? '#16a34a' : '#dc2626', border: `1px solid ${msg.ok ? '#bbf7d0' : '#fecaca'}`, fontSize: 13 }}>
          {msg.text}
        </div>
      )}

      {/* Search */}
      <input
        style={{ ...inp, marginBottom: 16 }}
        placeholder="Search by name or admission number..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {loading ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>Loading fee balances...</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: 40, textAlign: 'center', color: '#6b7280' }}>
          No students found
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(b => {
            const balance = b.total_fees - b.amount_paid
            const bPct = b.total_fees > 0 ? Math.round((b.amount_paid / b.total_fees) * 100) : 0
            const student = b.students
            return (
              <div key={b.id} style={{
                background: 'white', border: '1px solid #f1f5f9', borderRadius: 12,
                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 2 }}>
                    {student?.full_name ?? '—'}
                    <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>
                      {student?.admission_number} · {student?.class_name}
                    </span>
                  </div>
                  <div style={{ height: 4, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
                    <div style={{ height: '100%', width: `${bPct}%`, background: bPct >= 80 ? '#16a34a' : bPct >= 50 ? '#d97706' : '#dc2626', borderRadius: 2 }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Paid: {formatCurrency(b.amount_paid)}</div>
                  {balance > 0 && (
                    <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>Owed: {formatCurrency(balance)}</div>
                  )}
                </div>
                <button
                  onClick={() => setShowPayment(b)}
                  style={{
                    background: '#16a34a', color: 'white', border: 'none',
                    borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Pay
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Payment modal */}
      {showPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, width: '90%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 4px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 18 }}>Record Payment</h2>
            <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>{showPayment.students?.full_name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Amount (KES)</label>
                <input style={inp} type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Payment Method</label>
                <select style={{ ...inp, cursor: 'pointer' }} value={method} onChange={e => setMethod(e.target.value)}>
                  <option>M-Pesa</option>
                  <option>Bank</option>
                  <option>Cash</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Reference Number</label>
                <input style={inp} value={ref} onChange={e => setRef(e.target.value)} placeholder="Transaction reference" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowPayment(null)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button
                onClick={recordPayment}
                disabled={submitting || !amount || !ref}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#16a34a', color: 'white', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 14, opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
