'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { formatCurrency, getCurrentTerm } from '@/lib/roles'

interface VoteEntry {
  id: string
  code: string
  name: string
  budget: number
  spent: number
  year: number
  school_id: string
}

const VOTE_HEADS = [
  { code: 'OP-PE', name: 'Personnel Emoluments', color: '#2176FF' },
  { code: 'OP-RMI', name: 'Repairs, Maintenance & Improvement', color: '#7C3AED' },
  { code: 'OP-EWC', name: 'Electricity, Water & Conservancy', color: '#0891b2' },
  { code: 'OP-ADMIN', name: 'Administration', color: '#6b7280' },
  { code: 'TU-LB', name: 'Library Books', color: '#d97706' },
  { code: 'TU-EXM', name: 'Examinations', color: '#dc2626' },
  { code: 'TU-SM', name: 'Science & Materials', color: '#16a34a' },
]

export default function VotebookPage() {
  const [entries, setEntries] = useState<VoteEntry[]>([])
  const [loading, setLoading] = useState(true)
  const { year } = getCurrentTerm()

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: staff } = await supabase.from('staff_records').select('school_id').eq('user_id', user.id).single()
    if (!staff) return
    const { data } = await supabase
      .from('votebook')
      .select('*')
      .eq('school_id', staff.school_id)
      .eq('year', year)
    setEntries(data ?? [])
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  const totalBudget = entries.reduce((s, e) => s + e.budget, 0)
  const totalSpent = entries.reduce((s, e) => s + e.spent, 0)
  const overallPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0

  const merged = VOTE_HEADS.map(vh => {
    const entry = entries.find(e => e.code === vh.code)
    return {
      ...vh,
      budget: entry?.budget ?? 0,
      spent: entry?.spent ?? 0,
      remaining: (entry?.budget ?? 0) - (entry?.spent ?? 0),
      pct: entry && entry.budget > 0 ? Math.round((entry.spent / entry.budget) * 100) : 0,
    }
  })

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          Votebook — Budget Absorption {year}
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Nkoroi Mixed Senior Secondary School</p>
      </div>

      {/* Overall */}
      <div style={{
        background: 'linear-gradient(135deg, #2176FF 0%, #0891b2 100%)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 24, color: 'white',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 500 }}>Total Budget {year}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif' }}>{formatCurrency(totalBudget)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Spent</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif' }}>{formatCurrency(totalSpent)}</div>
          </div>
        </div>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${overallPct}%`, background: 'white', borderRadius: 4, transition: 'width 0.6s ease' }} />
        </div>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>{overallPct}% absorbed · {formatCurrency(totalBudget - totalSpent)} remaining</div>
      </div>

      {loading ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>Loading votebook...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {merged.map(v => (
            <div key={v.code} style={{
              background: 'white', border: '1px solid #f1f5f9', borderRadius: 14,
              padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <span style={{
                  display: 'inline-block', padding: '2px 10px', borderRadius: 100,
                  fontSize: 11, fontWeight: 700, color: 'white', background: v.color, flexShrink: 0,
                }}>
                  {v.code}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827', flex: 1 }}>{v.name}</span>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: v.pct >= 90 ? '#dc2626' : v.pct >= 70 ? '#d97706' : '#16a34a',
                }}>
                  {v.pct}%
                </span>
              </div>
              <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{
                  height: '100%', width: `${Math.min(v.pct, 100)}%`,
                  background: v.pct >= 90 ? '#dc2626' : v.pct >= 70 ? '#d97706' : v.color,
                  borderRadius: 4, transition: 'width 0.6s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280' }}>
                <span>Budget: {formatCurrency(v.budget)}</span>
                <span>Spent: {formatCurrency(v.spent)}</span>
                <span style={{ color: v.remaining < 0 ? '#dc2626' : '#374151', fontWeight: v.remaining < 0 ? 700 : 400 }}>
                  Remaining: {formatCurrency(v.remaining)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
