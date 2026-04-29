'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const G = '#16a34a'

const TABS = [
  { href: '/parent/dashboard', label: 'Home',    icon: '🏠' },
  { href: '/parent/chat',      label: 'AI Chat', icon: '🤖' },
  { href: '/parent/profile',   label: 'Account', icon: '👤' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav style={{
      position:        'fixed',
      bottom:          0,
      left:            0,
      right:           0,
      height:          64,
      background:      'white',
      borderTop:       '1px solid #e5e7eb',
      display:         'flex',
      zIndex:          100,
      boxShadow:       '0 -2px 12px rgba(0,0,0,0.06)',
      paddingBottom:   'env(safe-area-inset-bottom)',
    }}>
      {TABS.map(tab => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              flex:           1,
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              textDecoration: 'none',
              gap:            2,
              paddingTop:     6,
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>{tab.icon}</span>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? G : '#9ca3af', letterSpacing: '0.02em' }}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
