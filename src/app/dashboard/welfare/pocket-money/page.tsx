'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/roles'

interface PocketBalance {
  id: string
  student_id: string
  balance: number
  students: { full_name: string; admission_number: string; class_name: string } | null
}

interface PocketTx {
  id: string
  type: 'topup' | 'withdrawal'
  amount: number
  reason: string | null
  mpesa_ref: string | null
  created_at: string
}

type ActionType = 'topup' | 'withdrawal'

export default function PocketMoneyPage() {
  const [balances, setBalances] = useState<PocketBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null)
  const [selected, setSelected] = useState<PocketBalance | null>(null)
  const [action, setAction] = useState<ActionType>('topup')
  const [amount, setAmount] = useState('')
  const [mpesaRef, setMpesaRef] = useState('')
  const [reason, setReason] = useState('')
  const [txHistory, setTxHistory] = useState<PocketTx[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const totalHeld = balances.reduce((s, b) => s + b.balance, 0)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: staff } = await supabase.from('staff_records').select('school_id').eq('user_id', user.id).single()
    if (!staff) return
    setSchoolId(staff.school_id)
    const { data: school } = await supabase.from('schools').select('features').eq('id', staff.school_id).single()
    setFeatureEnabled(school?.features?.pocket_money ?? false)
    if (!school?.features?.pocket_money) { setLoading(false); return }
    const { data } = await supabase.from('pocket_money_balances').select('*, students(full_name, admission_number, class_name)').eq('school_id', staff.school_id).order('balance', { ascending: false }).limit(300)
    setBalances((data as unknown as PocketBalance[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function openStudent(b: PocketBalance) {
    setSelected(b); setMsg(null); setAmount(''); setMpesaRef(''); setReason('')
    const supabase = createClient()
    const { data } = await supabase.from('pocket_money_ledger').select('*').eq('student_id', b.student_id).order('created_at', { ascending: false }).limit(10)
    setTxHistory(data ?? [])
  }

  async function submit() {
    if (!selected || !amount) return
    const amt = parseFloat(amount)
    if (action === 'withdrawal' && amt > selected.balance) {
      setMsg({ ok: false, text: `Insufficient balance. Available: ${formatCurrency(selected.balance)}` })
      return
    }
    setSubmitting(true)
    const supabase = createClient()
    const newBal = action === 'topup' ? selected.balance + amt : selected.balance - amt
    const { error: ledgerErr } = await supabase.from('pocket_money_ledger').insert({
      school_id: schoolId,
      student_id: selected.student_id,
      type: action,
      amount: amt,
      reason: reason || null,
      mpesa_ref: mpesaRef || null,
      balance_after: newBal,
    })
    if (!ledgerErr) {
      await supabase.from('pocket_money_balances').upsert({ school_id: schoolId, student_id: selected.student_id, balance: newBal }, { onConflict: 'school_id,student_id' })
    }
    setSubmitting(false)
    if (ledgerErr) { setMsg({ ok: false, text: ledgerErr.message }); return }
    setMsg({ ok: true, text: `${action === 'topup' ? 'Top-up' : 'Withdrawal'} of ${formatCurrency(amt)} recorded` })
    setSelected(prev => prev ? { ...prev, balance: newBal } : null)
    setAmount(''); setMpesaRef(''); setReason('')
    const { data } = await supabase.from('pocket_money_ledger').select('*').eq('student_id', selected.student_id).order('created_at', { ascending: false }).limit(10)
    setTxHistory(data ?? [])
    load()
  }

  if (featureEnabled === false) {
    return (
      <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ background: 'white', border: '2px dashed #e5e7eb', borderRadius: 20, padding: '40px 48px', textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 8px', fontFamily: 'Space Grotesk, sans-serif' }}>Pocket Money — Add-on Required</h2>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>Contact Sychar to enable this feature for your school.</p>
        </div>
      </div>
    )
  }

  const filtered = search.trim()
    ? balances.filter(b => {
        const s = b.students
        if (!s) return false
        const q = search.toLowerCase()
        return s.full_name.toLowerCase().includes(q) || s.admission_number?.toLowerCase().includes(q)
      })
    : balances

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none' }

  return (
    <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>Pocket Money Ledger</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Nkoroi Mixed Senior Secondary School</p>
      </div>

      <div style={{ background: 'linear-gradient(135deg, #2176FF, #0891b2)', borderRadius: 14, padding: '16px 22px', marginBottom: 20, color: 'white' }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Total Pocket Money Held</div>
        <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif' }}>{formatCurrency(totalHeld)}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>across {balances.length} students</div>
      </div>

      <input style={{ ...inp, marginBottom: 16 }} placeholder="Search by name or admission number..." value={search} onChange={e => setSearch(e.target.value)} />

      {loading ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(b => (
            <div key={b.id} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', cursor: 'pointer' }} onClick={() => openStudent(b)} onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{b.students?.full_name ?? '—'} <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>{b.students?.admission_number} · {b.students?.class_name}</span></div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: b.balance > 0 ? '#16a34a' : '#6b7280', fontFamily: 'Space Grotesk, sans-serif' }}>{formatCurrency(b.balance)}</div>
              <button onClick={e => { e.stopPropagation(); openStudent(b) }} style={{ background: '#2176FF', color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Manage</button>
            </div>
          ))}
        </div>
      )}

      {/* Student modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, width: '90%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontSize: 18 }}>{selected.students?.full_name}</h2>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>×</button>
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>{selected.students?.class_name} · Balance: <strong style={{ color: '#16a34a' }}>{formatCurrency(selected.balance)}</strong></div>

            {/* Action toggle */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f8fafc', borderRadius: 10, padding: 4 }}>
              {(['topup', 'withdrawal'] as ActionType[]).map(a => (
                <button key={a} onClick={() => setAction(a)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', background: action === a ? 'white' : 'transparent', color: action === a ? '#111827' : '#6b7280', fontWeight: action === a ? 600 : 400, fontSize: 13, boxShadow: action === a ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
                  {a === 'topup' ? '⬆ Top Up' : '⬇ Withdraw'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Amount (KES)</label>
                <input style={inp} type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              {action === 'topup' && (
                <div>
                  <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>M-Pesa Reference (optional)</label>
                  <input style={inp} value={mpesaRef} onChange={e => setMpesaRef(e.target.value)} placeholder="e.g. QKJ7X..." />
                </div>
              )}
              {action === 'withdrawal' && (
                <div>
                  <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Reason</label>
                  <input style={inp} value={reason} onChange={e => setReason(e.target.value)} placeholder="Purpose of withdrawal" />
                </div>
              )}
            </div>

            {msg && <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: msg.ok ? '#f0fdf4' : '#fef2f2', color: msg.ok ? '#16a34a' : '#dc2626', fontSize: 13 }}>{msg.text}</div>}

            <button onClick={submit} disabled={submitting || !amount} style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: action === 'topup' ? '#16a34a' : '#dc2626', color: 'white', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 14, marginBottom: 20, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Processing...' : action === 'topup' ? 'Confirm Top Up' : 'Confirm Withdrawal'}
            </button>

            {txHistory.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Recent Transactions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {txHistory.map(tx => (
                    <div key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: '#f8fafc' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: tx.type === 'topup' ? '#16a34a' : '#dc2626', textTransform: 'capitalize' }}>{tx.type}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(tx.created_at)}{tx.reason ? ` · ${tx.reason}` : ''}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: tx.type === 'topup' ? '#16a34a' : '#dc2626' }}>
                        {tx.type === 'topup' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
