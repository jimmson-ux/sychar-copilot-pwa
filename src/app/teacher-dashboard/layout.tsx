'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'

const ROLE_COLORS: Record<string, string> = {
  principal: '#B51A2B',
  deputy_principal_academics: '#09D1C7',
  deputy_principal_discipline: '#DC586D',
  dean_of_studies: '#7C3AED',
  dean_of_students: '#0F766E',
  hod_subjects: '#09D1C7',
  hod_pathways: '#2176FF',
  class_teacher: '#22c55e',
  bom_teacher: '#22c55e',
  bursar: '#2176FF',
  guidance_counselling: '#D97706',
  storekeeper: '#6B7280',
}

const NAV = [
  { label: 'My Dashboard',    href: '/teacher-dashboard',           icon: '🏠' },
  { label: 'My Students',     href: '/teacher-dashboard/students',  icon: '👥' },
  { label: 'Record of Work',  href: null,                           icon: '📋', isRow: true },
  { label: 'My Timetable',    href: '/teacher-dashboard/timetable', icon: '📅' },
  { label: 'Duty Roster',     href: '/teacher-dashboard/duties',    icon: '📌' },
  { label: 'Schemes',         href: '/teacher-dashboard/schemes',   icon: '📖' },
  { label: 'Settings',        href: '/teacher-dashboard/settings',  icon: '⚙️' },
]

export default function TeacherDashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [staffName, setStaffName] = useState('')
  const [initials, setInitials] = useState('??')
  const [role, setRole] = useState('class_teacher')
  const [storedToken, setStoredToken] = useState('')
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem('sychar_teacher_token')
    if (!token) { router.push('/teacher-login'); return }

    const name = localStorage.getItem('sychar_staff_name') ?? ''
    const r = localStorage.getItem('sychar_role') ?? 'class_teacher'
    setStoredToken(token)
    setStaffName(name.split(' ')[0] || 'Teacher')
    setInitials(name.split(' ').map((x: string) => x[0]).join('').slice(0, 2).toUpperCase() || '??')
    setRole(r)

    const color = ROLE_COLORS[r] ?? '#22c55e'
    document.documentElement.style.setProperty('--role-primary', color)
    document.documentElement.style.setProperty('--role-secondary', color + 'aa')
  }, [router])

  function handleSignOut() {
    localStorage.removeItem('sychar_teacher_token')
    localStorage.removeItem('sychar_staff_id')
    localStorage.removeItem('sychar_role')
    localStorage.removeItem('sychar_staff_name')
    localStorage.removeItem('sychar_department')
    localStorage.removeItem('sychar_subject')
    localStorage.removeItem('sychar_class')
    router.push('/teacher-login')
  }

  const roleColor = ROLE_COLORS[role] ?? '#22c55e'
  const sidebarW = collapsed ? 64 : 220

  const SidebarContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: `linear-gradient(135deg, ${roleColor}, ${roleColor}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏫</div>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#111827', fontFamily: 'Space Grotesk, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Nkoroi Mixed Senior Secondary School
            </div>
            <div style={{ fontSize: 9, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 1 }}>Academic Year 2025/2026</div>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#6b7280', fontSize: 14 }}>
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
        {NAV.map(item => {
          if (item.isRow) {
            const href = storedToken ? `/record?token=${storedToken}` : '#'
            return (
              <a key="row" href={href} target="_blank" rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: collapsed ? '10px 12px' : '9px 12px',
                  borderRadius: 10, marginBottom: 2, textDecoration: 'none',
                  background: 'transparent', color: '#374151', fontSize: 13,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  whiteSpace: 'nowrap', overflow: 'hidden',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                title={collapsed ? item.label : undefined}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && <span style={{ fontFamily: 'DM Sans, sans-serif' }}>{item.label}</span>}
              </a>
            )
          }
          const isActive = pathname === item.href || (item.href !== '/teacher-dashboard' && pathname.startsWith(item.href ?? '___'))
          return (
            <Link key={item.href} href={item.href!}
              onClick={() => setMobileOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '10px 12px' : '9px 12px',
                borderRadius: 10, marginBottom: 2, textDecoration: 'none',
                background: isActive ? `${roleColor}15` : 'transparent',
                color: isActive ? roleColor : '#374151',
                fontWeight: isActive ? 600 : 400, fontSize: 13,
                justifyContent: collapsed ? 'center' : 'flex-start',
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f9fafb' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              title={collapsed ? item.label : undefined}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span style={{ fontFamily: 'DM Sans, sans-serif' }}>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Profile */}
      <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: roleColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white' }}>{initials}</div>
          {!collapsed && <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{staffName}</div>}
        </div>
        <button onClick={handleSignOut}
          style={{ width: '100%', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, justifyContent: collapsed ? 'center' : 'flex-start', padding: '8px 12px', borderRadius: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 13, fontWeight: 500 }}
          onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
          title={collapsed ? 'Sign out' : undefined}
        >
          <span style={{ fontSize: 16 }}>🚪</span>
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: 'DM Sans, sans-serif' }}>
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 40 }} className="md:hidden" />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex" style={{ width: sidebarW, flexShrink: 0, background: 'white', borderRight: '1px solid #f1f5f9', height: '100vh', position: 'sticky', top: 0, overflowY: 'auto', transition: 'width 0.25s ease', flexDirection: 'column', boxShadow: '2px 0 8px rgba(0,0,0,0.03)' }}>
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <aside className="md:hidden" style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 220, background: 'white', borderRight: '1px solid #f1f5f9', zIndex: 50, transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.25s ease', display: 'flex', flexDirection: 'column' }}>
        <SidebarContent />
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header className="md:hidden" style={{ height: 56, background: 'white', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, position: 'sticky', top: 0, zIndex: 30 }}>
          <button onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4 }}>☰</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>My Portal</div>
          <div style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: '50%', background: roleColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white' }}>{initials}</div>
        </header>
        <main style={{ flex: 1, overflowY: 'auto' }}>{children}</main>
      </div>
    </div>
  )
}
