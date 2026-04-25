'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const NAV = [
  { href: '/super/dashboard',          label: 'Command Centre', icon: '◈' },
  { href: '/super/dashboard/features', label: 'Feature Flags',  icon: '⚑' },
  { href: '/super/dashboard/billing',  label: 'Billing',        icon: '₿' },
  { href: '/super/dashboard/database', label: 'Database',       icon: '⬡' },
  { href: '/super/dashboard/ai',       label: 'AI Engines',     icon: '◎' },
  { href: '/super/dashboard/logs',     label: 'System Logs',    icon: '≡' },
  { href: '/super/dashboard/alerts',   label: 'Alerts',         icon: '△' },
  { href: '/super/dashboard/onboard',  label: 'Onboard School', icon: '+' },
  { href: '/super/dashboard/users',    label: 'Users',          icon: '⊛' },
  { href: '/super/dashboard/design',   label: 'Design / Brand', icon: '◐' },
  { href: '/super/dashboard/config',   label: 'Config',         icon: '⚙' },
  { href: '/super/dashboard/settings', label: 'Settings',       icon: '◈' },
] as const

const C = {
  bg:      '#070711',
  side:    '#0c0c1a',
  border:  'rgba(99,102,241,0.18)',
  text:    '#e2e8f0',
  muted:   '#475569',
  accent:  '#6366f1',
  accentL: '#818cf8',
  green:   '#4ade80',
  red:     '#f87171',
}

export default function GodModeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const [clock,  setClock]  = useState('')
  const [email,  setEmail]  = useState('')

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/super/login')
      else setEmail(data.user.email ?? '')
    })
  }, [router])

  async function signOut() {
    const sb = createClient()
    await sb.auth.signOut()
    document.cookie = 'sychar-role=; path=/; max-age=0'
    document.cookie = 'sychar-sub=; path=/; max-age=0'
    router.push('/super/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: '"JetBrains Mono", monospace' }}>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside style={{
        width: 220, flexShrink: 0, background: C.side,
        borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ padding: '22px 20px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.accentL, letterSpacing: '0.04em' }}>SYCHAR</div>
          <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.14em', marginTop: 2 }}>GOD MODE ◈ COMMAND</div>
        </div>

        {/* Clock */}
        <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.accent, letterSpacing: '0.04em' }}>{clock}</div>
          <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{new Date().toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
          {NAV.map(item => {
            const active = item.href === '/super/dashboard'
              ? pathname === '/super/dashboard'
              : pathname.startsWith(item.href)
            return (
              <a
                key={item.href}
                href={item.href}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          10,
                  padding:      '9px 12px',
                  borderRadius: 7,
                  marginBottom: 2,
                  fontSize:     12,
                  fontWeight:   active ? 700 : 400,
                  color:        active ? C.accentL : C.muted,
                  background:   active ? 'rgba(99,102,241,0.14)' : 'transparent',
                  textDecoration: 'none',
                  transition:   'all 0.15s',
                  borderLeft:   active ? `2px solid ${C.accent}` : '2px solid transparent',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = C.text }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = C.muted }}
              >
                <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                {item.label}
              </a>
            )
          })}
        </nav>

        {/* User footer */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 2, letterSpacing: '0.08em' }}>SUPER ADMIN</div>
          <div style={{ fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 10 }}>
            {email || '—'}
          </div>
          <button
            onClick={signOut}
            style={{ width: '100%', padding: '7px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11, cursor: 'pointer', letterSpacing: '0.06em' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.red }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.muted }}
          >
            SIGN OUT
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'auto', padding: '28px 32px', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}
