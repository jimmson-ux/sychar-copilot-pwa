'use client'
export const dynamic = 'force-dynamic'

import { useRouter } from 'next/navigation'

export default function WelfarePage() {
  const router = useRouter()
  return (
    <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>Welfare</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Student welfare management — pocket money and bread vouchers</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {[
          { title: 'Pocket Money Ledger', desc: 'Top-up and withdraw student pocket money. Track balances and transaction history.', icon: '💰', href: '/dashboard/welfare/pocket-money', color: '#2176FF' },
          { title: 'Bread Vouchers', desc: 'Issue daily bread vouchers and track redemptions. Real-time class-by-class view.', icon: '🍞', href: '/dashboard/welfare/bread-vouchers', color: '#d97706' },
        ].map(m => (
          <button
            key={m.title}
            onClick={() => router.push(m.href)}
            style={{
              background: 'white', border: '1px solid #f1f5f9', borderLeft: `4px solid ${m.color}`,
              borderRadius: 16, padding: '24px', textAlign: 'left', cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)' }}
          >
            <div style={{ fontSize: 36, marginBottom: 14 }}>{m.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 8, fontFamily: 'Space Grotesk, sans-serif' }}>{m.title}</div>
            <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>{m.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
