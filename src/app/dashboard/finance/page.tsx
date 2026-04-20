'use client'
export const dynamic = 'force-dynamic'

import { useRouter } from 'next/navigation'

const modules = [
  {
    title: 'LPO Management',
    desc: 'Create, authorize and track Local Purchase Orders',
    icon: '📜',
    href: '/dashboard/finance/lpo',
    color: '#2176FF',
    roles: 'Principal & Accountant',
  },
  {
    title: 'Imprest Advances',
    desc: 'Issue and retire imprest advances with surrender tracking',
    icon: '💵',
    href: '/dashboard/finance/lpo?tab=imprest',
    color: '#7C3AED',
    roles: 'Principal & Accountant',
  },
  {
    title: 'Fee Collection',
    desc: 'Record fee payments and view student balances',
    icon: '💳',
    href: '/dashboard/finance/fees',
    color: '#16a34a',
    roles: 'Accountant',
  },
  {
    title: 'Votebook',
    desc: 'Budget absorption by vote-head with progress tracking',
    icon: '📊',
    href: '/dashboard/finance/votebook',
    color: '#d97706',
    roles: 'Principal & Accountant',
  },
]

export default function FinancePage() {
  const router = useRouter()
  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          Finance Module
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>
          Nkoroi Mixed Senior Secondary School — Financial Management
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {modules.map(m => (
          <button
            key={m.title}
            onClick={() => router.push(m.href)}
            style={{
              background: 'white', border: '1px solid #f1f5f9',
              borderLeft: `4px solid ${m.color}`,
              borderRadius: 16, padding: '20px',
              textAlign: 'left', cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>{m.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 6, fontFamily: 'Space Grotesk, sans-serif' }}>
              {m.title}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{m.desc}</div>
            <div style={{ marginTop: 10, fontSize: 11, color: m.color, fontWeight: 600 }}>{m.roles}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
