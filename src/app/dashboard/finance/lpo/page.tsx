'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/roles'

type LpoStatus = 'Pending' | 'Authorized' | 'Payment_Pending' | 'Completed' | 'Voided'
type ActiveTab = 'lpo' | 'imprest'

interface LPO {
  id: string
  lpo_number: string
  vendor_name: string
  description: string
  amount: number
  vote_head: string
  status: LpoStatus
  created_at: string
  authorized_at: string | null
  authorized_by_name?: string
}

interface Imprest {
  id: string
  voucher_number: string
  amount: number
  reason: string
  recipient_name: string
  amount_surrendered: number
  surrender_status: string
  issued_at: string
}

const VOTE_HEADS = [
  { code: 'OP-PE', name: 'Personnel Emoluments' },
  { code: 'OP-RMI', name: 'Repairs, Maintenance & Improvement' },
  { code: 'OP-EWC', name: 'Electricity, Water & Conservancy' },
  { code: 'OP-ADMIN', name: 'Administration' },
  { code: 'TU-LB', name: 'Library Books' },
  { code: 'TU-EXM', name: 'Examinations' },
  { code: 'TU-SM', name: 'Science & Materials' },
]

const STATUS_COLORS: Record<LpoStatus, string> = {
  Pending: '#d97706',
  Authorized: '#2176FF',
  Payment_Pending: '#7C3AED',
  Completed: '#16a34a',
  Voided: '#6b7280',
}

function Badge({ status }: { status: string }) {
  const color = STATUS_COLORS[status as LpoStatus] ?? '#6b7280'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 100,
      fontSize: 11, fontWeight: 600, color: 'white', background: color,
    }}>
      {status.replace('_', ' ')}
    </span>
  )
}

export default function LPOPage() {
  const [tab, setTab] = useState<ActiveTab>('lpo')
  const [lpos, setLpos] = useState<LPO[]>([])
  const [imprests, setImprests] = useState<Imprest[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [showNewLPO, setShowNewLPO] = useState(false)
  const [showNewImprest, setShowNewImprest] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // New LPO form
  const [vendor, setVendor] = useState('')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [voteHead, setVoteHead] = useState('')

  // New imprest form
  const [impAmount, setImpAmount] = useState('')
  const [impReason, setImpReason] = useState('')
  const [impRecipient, setImpRecipient] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: staff } = await supabase
      .from('staff_records')
      .select('sub_role, school_id')
      .eq('user_id', user.id)
      .single()
    if (!staff) return
    setUserRole(staff.sub_role)
    setSchoolId(staff.school_id)

    const [lpoRes, impRes] = await Promise.all([
      supabase.from('lpos').select('*').eq('school_id', staff.school_id).order('created_at', { ascending: false }),
      supabase.from('imprest_advances').select('*').eq('school_id', staff.school_id).order('issued_at', { ascending: false }),
    ])
    setLpos(lpoRes.data ?? [])
    setImprests(impRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function submitLPO() {
    if (!vendor || !desc || !amount || !voteHead) return
    setSubmitting(true)
    const supabase = createClient()
    const num = `LPO-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`
    const { error } = await supabase.from('lpos').insert({
      school_id: schoolId,
      lpo_number: num,
      vendor_name: vendor,
      description: desc,
      amount: parseFloat(amount),
      vote_head: voteHead,
      status: 'Pending',
    })
    setSubmitting(false)
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setMsg({ ok: true, text: `LPO ${num} created` })
    setShowNewLPO(false)
    setVendor(''); setDesc(''); setAmount(''); setVoteHead('')
    load()
  }

  async function authorizeLPO(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from('lpos').update({
      status: 'Authorized',
      authorized_at: new Date().toISOString(),
    }).eq('id', id)
    if (!error) load()
  }

  async function submitImprest() {
    if (!impAmount || !impReason || !impRecipient) return
    setSubmitting(true)
    const supabase = createClient()
    const num = `IMP-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`
    const { error } = await supabase.from('imprest_advances').insert({
      school_id: schoolId,
      voucher_number: num,
      amount: parseFloat(impAmount),
      reason: impReason,
      recipient_name: impRecipient,
      amount_surrendered: 0,
      surrender_status: 'Pending',
      issued_at: new Date().toISOString(),
    })
    setSubmitting(false)
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setMsg({ ok: true, text: `Imprest ${num} issued` })
    setShowNewImprest(false)
    setImpAmount(''); setImpReason(''); setImpRecipient('')
    load()
  }

  const canAuthorize = userRole === 'principal'
  const canCreate = ['principal', 'accountant', 'bursar'].includes(userRole)

  const filteredLpos = filterStatus === 'all' ? lpos : lpos.filter(l => l.status === filterStatus)

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid #e5e7eb', fontSize: 14, fontFamily: 'DM Sans, sans-serif',
    boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
            Finance — {tab === 'lpo' ? 'LPO Management' : 'Imprest Advances'}
          </h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Nkoroi Mixed Senior Secondary School</p>
        </div>
        {canCreate && (
          <button
            onClick={() => tab === 'lpo' ? setShowNewLPO(true) : setShowNewImprest(true)}
            style={{
              background: '#2176FF', color: 'white', border: 'none', borderRadius: 10,
              padding: '10px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 14,
            }}
          >
            {tab === 'lpo' ? '+ New LPO' : '+ Issue Advance'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f8fafc', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {(['lpo', 'imprest'] as ActiveTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: tab === t ? 'white' : 'transparent',
              color: tab === t ? '#111827' : '#6b7280',
              fontWeight: tab === t ? 600 : 400, fontSize: 13,
              boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {t === 'lpo' ? '📜 LPOs' : '💵 Imprest Advances'}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 10,
          background: msg.ok ? '#f0fdf4' : '#fef2f2',
          color: msg.ok ? '#16a34a' : '#dc2626',
          border: `1px solid ${msg.ok ? '#bbf7d0' : '#fecaca'}`,
          fontSize: 13,
        }}>
          {msg.text}
        </div>
      )}

      {/* ── LPO TAB ── */}
      {tab === 'lpo' && (
        <>
          {/* Status filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {['all', 'Pending', 'Authorized', 'Payment_Pending', 'Completed', 'Voided'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: '5px 14px', borderRadius: 100, border: '1px solid #e5e7eb',
                  background: filterStatus === s ? '#111827' : 'white',
                  color: filterStatus === s ? 'white' : '#374151',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                }}
              >
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>Loading...</div>
          ) : filteredLpos.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: '40px', textAlign: 'center', color: '#6b7280' }}>
              No LPOs found
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredLpos.map(lpo => (
                <div key={lpo.id} style={{
                  background: 'white', border: '1px solid #f1f5f9', borderRadius: 14,
                  padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>
                          {lpo.lpo_number}
                        </span>
                        <Badge status={lpo.status} />
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>{lpo.vote_head}</span>
                      </div>
                      <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>
                        <strong>{lpo.vendor_name}</strong> — {lpo.description}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        {formatDate(lpo.created_at)}
                        {lpo.authorized_at && ` · Authorized ${formatDate(lpo.authorized_at)}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>
                        {formatCurrency(lpo.amount)}
                      </span>
                      {canAuthorize && lpo.status === 'Pending' && (
                        <button
                          onClick={() => authorizeLPO(lpo.id)}
                          style={{
                            background: '#16a34a', color: 'white', border: 'none',
                            borderRadius: 8, padding: '6px 14px', fontSize: 12,
                            fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          Authorize
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── IMPREST TAB ── */}
      {tab === 'imprest' && (
        <>
          {loading ? (
            <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>Loading...</div>
          ) : imprests.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: '40px', textAlign: 'center', color: '#6b7280' }}>
              No imprest advances
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {imprests.map(imp => {
                const balance = imp.amount - imp.amount_surrendered
                return (
                  <div key={imp.id} style={{
                    background: 'white', border: '1px solid #f1f5f9', borderRadius: 14,
                    padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    borderLeft: `4px solid ${imp.surrender_status === 'Fully_Surrendered' ? '#16a34a' : '#d97706'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 4, fontFamily: 'Space Grotesk, sans-serif' }}>
                          {imp.voucher_number} — {imp.recipient_name}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{imp.reason}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(imp.issued_at)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>
                          {formatCurrency(imp.amount)}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>
                          Surrendered: {formatCurrency(imp.amount_surrendered)}
                        </div>
                        {balance > 0 && (
                          <div style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>
                            Balance: {formatCurrency(balance)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── NEW LPO MODAL ── */}
      {showNewLPO && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 20, padding: 28, width: '90%', maxWidth: 480,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ margin: '0 0 20px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 18 }}>New LPO</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Vendor Name</label>
                <input style={inp} value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Nakumatt Supplies Ltd" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Description</label>
                <input style={inp} value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Science lab reagents" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Amount (KES)</label>
                <input style={inp} type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Vote Head</label>
                <select style={{ ...inp, cursor: 'pointer' }} value={voteHead} onChange={e => setVoteHead(e.target.value)}>
                  <option value="">Select vote head...</option>
                  {VOTE_HEADS.map(v => (
                    <option key={v.code} value={v.code}>{v.code} — {v.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowNewLPO(false)}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 14 }}
              >
                Cancel
              </button>
              <button
                onClick={submitLPO}
                disabled={submitting || !vendor || !desc || !amount || !voteHead}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                  background: '#2176FF', color: 'white', fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 14,
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Creating...' : 'Create LPO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW IMPREST MODAL ── */}
      {showNewImprest && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 20, padding: 28, width: '90%', maxWidth: 440,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ margin: '0 0 20px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 18 }}>Issue Imprest Advance</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Recipient</label>
                <input style={inp} value={impRecipient} onChange={e => setImpRecipient(e.target.value)} placeholder="Staff name" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Amount (KES)</label>
                <input style={inp} type="number" value={impAmount} onChange={e => setImpAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Reason</label>
                <input style={inp} value={impReason} onChange={e => setImpReason(e.target.value)} placeholder="Purpose of advance" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowNewImprest(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button
                onClick={submitImprest}
                disabled={submitting || !impAmount || !impReason || !impRecipient}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#7C3AED', color: 'white', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 14, opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'Issuing...' : 'Issue Advance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
