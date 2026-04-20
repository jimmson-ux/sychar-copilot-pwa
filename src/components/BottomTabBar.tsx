'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: 'Home',       href: '/dashboard',         icon: '🏠' },
  { label: 'Attendance', href: '/dashboard/teacher',  icon: '✅' },
  { label: 'Lessons',   href: '/record',             icon: '📖' },
  { label: 'Notices',   href: '/dashboard/whatsapp-bot', icon: '🔔' },
  { label: 'Profile',   href: '/dashboard/settings', icon: '👤' },
]

export default function BottomTabBar() {
  const pathname = usePathname()

  return (
    <nav
      className="md:hidden"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'white',
        borderTop: '1px solid #f1f5f9',
        display: 'flex',
        boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
      }}
    >
      {TABS.map(tab => {
        const isActive =
          tab.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(tab.href)

        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 56,        // 44px touch target + padding
              gap: 2,
              textDecoration: 'none',
              color: isActive ? '#0891b2' : '#9ca3af',
              background: isActive
                ? 'linear-gradient(to bottom, #f0fdfa, #ffffff)'
                : 'transparent',
              transition: 'color 0.15s',
              paddingBottom: 'env(safe-area-inset-bottom, 0)',
            }}
          >
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {tab.label}
            </span>
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  width: 24,
                  height: 2,
                  borderRadius: '0 0 2px 2px',
                  background: 'linear-gradient(to right, #0891b2, #22c55e)',
                }}
              />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
