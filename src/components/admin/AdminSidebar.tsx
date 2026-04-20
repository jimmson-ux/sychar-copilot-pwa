'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/admin',         icon: '◈', label: 'Overview'    },
  { href: '/admin/schools', icon: '⬡', label: 'Schools'     },
  { href: '/admin/billing', icon: '◎', label: 'Billing'     },
  { href: '/admin/pricing', icon: '◇', label: 'Pricing'     },
  { href: '/admin/logs',    icon: '▤', label: 'System Logs' },
] as const

export default function AdminSidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  return (
    <aside
      style={{
        position:        'fixed',
        top:             0,
        left:            0,
        width:           220,
        height:          '100vh',
        background:      '#111114',
        borderRight:     '1px solid rgba(255,255,255,0.07)',
        display:         'flex',
        flexDirection:   'column',
        zIndex:          50,
      }}
    >
      {/* ── Logo ───────────────────────────────────────── */}
      <div
        style={{
          padding:      '20px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div
          style={{
            fontFamily:    'var(--font-display, Syne, sans-serif)',
            fontWeight:    800,
            fontSize:      18,
            color:         '#e8e6e1',
            letterSpacing: '-0.02em',
            lineHeight:    1.2,
          }}
        >
          SYCHAR
        </div>
        <div
          style={{
            fontFamily:    'var(--font-mono, "JetBrains Mono", monospace)',
            fontSize:      10,
            color:         '#e8593c',
            letterSpacing: '0.12em',
            marginTop:     5,
          }}
        >
          GOD MODE ▸
        </div>
      </div>

      {/* ── Navigation ─────────────────────────────────── */}
      <nav
        style={{
          padding: '16px 12px',
          flex:    1,
        }}
      >
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display:         'flex',
                alignItems:      'center',
                gap:             10,
                padding:         '8px 12px',
                borderRadius:    7,
                marginBottom:    2,
                textDecoration:  'none',
                fontSize:        13,
                fontWeight:      active ? 500 : 400,
                color:           active ? '#e8593c' : '#7a7870',
                background:      active ? 'rgba(232,89,60,0.12)' : 'transparent',
                border:          active
                                   ? '1px solid rgba(232,89,60,0.2)'
                                   : '1px solid transparent',
                transition:      'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.color = '#e8e6e1'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.color = '#7a7870'
                }
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  fontSize:   14,
                  lineHeight: 1,
                  opacity:    active ? 1 : 0.6,
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-display, Syne, sans-serif)',
                  letterSpacing: '0.01em',
                }}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* ── Footer ─────────────────────────────────────── */}
      <div
        style={{
          padding:       '16px 20px',
          borderTop:     '1px solid rgba(255,255,255,0.07)',
          fontFamily:    'var(--font-mono, "JetBrains Mono", monospace)',
          fontSize:      10,
          lineHeight:    1.6,
        }}
      >
        <div style={{ color: '#4a4845' }}>v2026.04</div>
        <div style={{ color: '#1d9e75', marginTop: 2 }}>● SYSTEM ONLINE</div>
      </div>
    </aside>
  )
}
