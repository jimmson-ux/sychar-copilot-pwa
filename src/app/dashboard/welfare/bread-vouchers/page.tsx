'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Voucher {
  id: string
  voucher_date: string
  quantity: number
  unit_cost: number
  total_cost: number
  redeemed: boolean
  redeemed_at: string | null
  students: {
    id: string
    full_name: string
    admission_number: string | null
    class_name: string | null
  } | null
}

export default function BreadVouchersPage() {
  const router   = useRouter()
  const [date, setDate]         = useState(new Date().toISOString().split('T')[0])
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading, setLoading]   = useState(true)
  const [issuing, setIssuing]   = useState(false)
  const [className, setClassName] = useState('')
  const [unitCost, setUnitCost]   = useState('30')
  const [redeeming, setRedeeming] = useState<string | null>(null)
  const [msg, setMsg]           = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/welfare/vouchers?date=${date}`)
    if (r.status === 401) { router.push('/login'); return }
    if (r.ok) {
      const d = await r.json() as { vouchers: Voucher[] }
      setVouchers(d.vouchers)
    }
    setLoading(false)
  }, [date, router])

  useEffect(() => { load() }, [load])

  async function issueClass() {
    if (!className.trim()) { setMsg('Enter a class name'); return }
    setIssuing(true); setMsg('')
    const r = await fetch('/api/welfare/vouchers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_name: className.trim(), unit_cost: Number(unitCost), voucher_date: date }),
    })
    if (r.ok) {
      const d = await r.json() as { count: number }
      setMsg(`Issued ${d.count} voucher${d.count !== 1 ? 's' : ''} for ${className}`)
      load()
    } else {
      setMsg('Failed to issue vouchers')
    }
    setIssuing(false)
  }

  async function redeem(id: string) {
    setRedeeming(id)
    await fetch(`/api/welfare/vouchers?id=${id}`, { method: 'PATCH' })
    setVouchers(prev => prev.map(v => v.id === id ? { ...v, redeemed: true, redeemed_at: new Date().toISOString() } : v))
    setRedeeming(null)
  }

  const redeemed   = vouchers.filter(v => v.redeemed).length
  const pending    = vouchers.filter(v => !v.redeemed).length
  const totalCost  = vouchers.reduce((s, v) => s + Number(v.total_cost), 0)

  const CARD: React.CSSProperties = {
    background: 'white', border: '1px solid #f1f5f9',
    borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }

  return (
    <div style={{ padding: '20px 20px 48px', maxWidth: 800, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280', padding: '4px 8px', borderRadius: 8 }}>←</button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>🍞 Bread Vouchers</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Issue and track daily bread vouchers by class</p>
        </div>
      </div>

      {/* Date picker */}
      <div style={{ ...CARD, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Date:</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
        />
        <button onClick={load} style={{ padding: '7px 16px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>Refresh</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { l: 'Issued',   v: vouchers.length, c: '#1d4ed8' },
          { l: 'Redeemed', v: redeemed,         c: '#16a34a' },
          { l: 'Pending',  v: pending,           c: '#d97706' },
        ].map(s => (
          <div key={s.l} style={{ ...CARD, padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>
      {vouchers.length > 0 && (
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, textAlign: 'right' }}>
          Total value: <strong style={{ color: '#111827' }}>KSH {totalCost.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</strong>
        </div>
      )}

      {/* Issue by class */}
      <div style={{ ...CARD, padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Issue to Whole Class</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Class name</div>
            <input
              value={className}
              onChange={e => setClassName(e.target.value)}
              placeholder="e.g. Form 2 North"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ width: 100 }}>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Unit cost (KSH)</div>
            <input
              type="number"
              value={unitCost}
              onChange={e => setUnitCost(e.target.value)}
              min={1}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={issueClass}
            disabled={issuing}
            style={{ padding: '9px 20px', background: issuing ? '#93c5fd' : 'linear-gradient(135deg,#d97706,#b45309)', color: 'white', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: issuing ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
          >
            {issuing ? 'Issuing…' : '🍞 Issue'}
          </button>
        </div>
        {msg && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: msg.startsWith('Issued') ? '#f0fdf4' : '#fef2f2', borderRadius: 8, fontSize: 12, color: msg.startsWith('Issued') ? '#16a34a' : '#dc2626' }}>
            {msg}
          </div>
        )}
      </div>

      {/* Voucher list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3,4,5].map(i => <div key={i} style={{ height: 60, background: '#f3f4f6', borderRadius: 12 }} />)}
        </div>
      ) : vouchers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🍞</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No vouchers for {date}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Issue vouchers using the form above</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vouchers.map(v => {
            const student = v.students
            return (
              <div key={v.id} style={{
                ...CARD, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                borderLeft: `4px solid ${v.redeemed ? '#16a34a' : '#d97706'}`,
                opacity: v.redeemed ? 0.7 : 1,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                    {student?.full_name ?? 'Unknown'}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    {student?.class_name ?? '—'} · {student?.admission_number ?? '—'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                    KSH {Number(v.total_cost).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>×{v.quantity} @ {v.unit_cost}</div>
                </div>
                {v.redeemed ? (
                  <span style={{ padding: '4px 10px', background: '#dcfce7', color: '#16a34a', borderRadius: 20, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>Redeemed</span>
                ) : (
                  <button
                    onClick={() => redeem(v.id)}
                    disabled={redeeming === v.id}
                    style={{ padding: '6px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                  >
                    {redeeming === v.id ? '…' : 'Redeem'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
