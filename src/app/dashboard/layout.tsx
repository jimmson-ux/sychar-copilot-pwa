'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import BottomTabBar from '@/components/BottomTabBar'
import SycharLogo from '@/components/SycharLogo'

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const ROLE_THEMES: Record<string, { primary: string; secondary: string }> = {
  principal:                    { primary: '#B51A2B', secondary: '#FFA586' },
  deputy_principal:             { primary: '#09D1C7', secondary: '#46DFB1' },
  deputy_principal_academics:   { primary: '#09D1C7', secondary: '#46DFB1' },
  deputy_principal_discipline:  { primary: '#DC586D', secondary: '#FFBB94' },
  dean_of_studies:              { primary: '#7C3AED', secondary: '#A78BFA' },
  deputy_dean_of_studies:       { primary: '#7C3AED', secondary: '#C4B5FD' },
  dean_of_students:             { primary: '#0F766E', secondary: '#2DD4BF' },
  guidance_counselling:         { primary: '#D97706', secondary: '#FCD34D' },
  hod_pathways:                 { primary: '#2176FF', secondary: '#80EE98' },
  hod_subjects:                 { primary: '#09D1C7', secondary: '#80EE98' },
  hod_sciences:                 { primary: '#16a34a', secondary: '#86efac' },
  hod_mathematics:              { primary: '#2176FF', secondary: '#93c5fd' },
  hod_languages:                { primary: '#7C3AED', secondary: '#A78BFA' },
  hod_humanities:               { primary: '#b45309', secondary: '#fcd34d' },
  hod_applied_sciences:         { primary: '#0891b2', secondary: '#67e8f9' },
  hod_games_sports:             { primary: '#ea580c', secondary: '#fdba74' },
  form_principal_form4:         { primary: '#09D1C7', secondary: '#46DFB1' },
  form_principal_grade10:       { primary: '#09D1C7', secondary: '#46DFB1' },
  bursar:                       { primary: '#2176FF', secondary: '#FDCA40' },
  accountant:                   { primary: '#2176FF', secondary: '#bfdbfe' },
  class_teacher:                { primary: '#09D1C7', secondary: '#46DFB1' },
  bom_teacher:                  { primary: '#09D1C7', secondary: '#46DFB1' },
  storekeeper:                  { primary: '#6B7280', secondary: '#9CA3AF' },
  qaso:                         { primary: '#384358', secondary: '#FFA586' },
  default:                      { primary: '#0891b2', secondary: '#22c55e' },
}

const LEADERSHIP = [
  'principal','deputy_principal','deputy_principal_academics','deputy_principal_discipline',
  'dean_of_studies','deputy_dean_of_studies','dean_of_students',
  'form_principal_form4','form_principal_grade10',
]
const HODS = [
  'hod_subjects','hod_sciences','hod_mathematics',
  'hod_languages','hod_humanities','hod_applied_sciences','hod_games_sports',
]
// hod_pathways are Heads of Pathways — they login as class teachers, not subject HODs
const PATHWAY_HEADS = ['hod_pathways']
const TEACHERS = ['class_teacher','bom_teacher',...HODS,...PATHWAY_HEADS]

interface NavItem {
  label: string
  href: string
  icon: string
  roles: string[] | 'all'
}

const NAV: NavItem[] = [
  { label: 'Dashboard',        href: '/dashboard',                     icon: '🏠', roles: 'all' },
  { label: 'School Profile',   href: '/dashboard/school-profile',      icon: '🏫', roles: 'all' },
  { label: 'Students',         href: '/dashboard/students',            icon: '🎓', roles: 'all' },
  { label: 'Staff',            href: '/dashboard/staff',               icon: '👥', roles: [...LEADERSHIP,'bursar','qaso','accountant','storekeeper','guidance_counselling','hod_pathways'] },
  { label: 'Discipline',       href: '/dashboard/discipline',          icon: '⚖️', roles: [...LEADERSHIP,'guidance_counselling'] },
  { label: 'HOD Analytics',    href: '/dashboard/hod',                 icon: '📊', roles: [...HODS,...LEADERSHIP] },
  { label: 'Timetable',        href: '/dashboard/timetable',           icon: '📅', roles: 'all' },
  { label: 'BOM Report',       href: '/dashboard/principal/bom-report', icon: '📑', roles: ['principal'] },
  { label: 'Compliance',       href: '/dashboard/document-compliance', icon: '📋', roles: [...LEADERSHIP,...HODS,'qaso'] },
  { label: 'Merit List',       href: '/dashboard/merit-list',          icon: '🏆', roles: 'all' },
  { label: 'KCSE Predictions', href: '/dashboard/kcse',                icon: '🎯', roles: [...LEADERSHIP,...HODS] },
  { label: 'Counselling',      href: '/dashboard/counselling',         icon: '💬', roles: ['guidance_counselling',...LEADERSHIP] },
  { label: 'Duty Appraisals',  href: '/dashboard/duty-appraisals',    icon: '⭐', roles: LEADERSHIP },
  { label: 'My Duties',        href: '/dashboard/my-duties',           icon: '📌', roles: TEACHERS },
  { label: 'Pathways',         href: '/dashboard/pathways',            icon: '🧭', roles: [...LEADERSHIP,...HODS,...PATHWAY_HEADS] },
  { label: 'Scanner',          href: '/dashboard/scanner',             icon: '📄', roles: 'all' },
  { label: 'QR Codes',         href: '/dashboard/qr-management',      icon: '📲', roles: [...LEADERSHIP,...HODS,'qaso'] },
  { label: 'WhatsApp Bot',     href: '/dashboard/whatsapp-bot',        icon: '💚', roles: ['principal','deputy_principal','bursar','dean_of_students'] },
  { label: 'Gender Analysis',  href: '/dashboard/gender-analysis',     icon: '📈', roles: [...LEADERSHIP,...PATHWAY_HEADS] },
  { label: 'University Match', href: '/dashboard/university-matching', icon: '🤖', roles: 'all' },
  { label: 'Finance',          href: '/dashboard/finance',             icon: '💼', roles: ['principal','bursar','accountant'] },
  { label: 'LPO & Imprest',    href: '/dashboard/finance/lpo',         icon: '📜', roles: ['principal','bursar','accountant'] },
  { label: 'Fee Collection',   href: '/dashboard/finance/fees',        icon: '💳', roles: ['principal','bursar','accountant'] },
  { label: 'Gate Pass',        href: '/dashboard/gate-pass',           icon: '🚪', roles: [...LEADERSHIP,'storekeeper'] },
  { label: 'Staff Attendance', href: '/dashboard/staff-attendance',    icon: '📋', roles: [...LEADERSHIP,'qaso'] },
  { label: 'Welfare',          href: '/dashboard/welfare',             icon: '🍞', roles: ['principal','bursar','accountant','class_teacher','storekeeper'] },
  { label: 'Visitor Log',      href: '/dashboard/visitor-log',         icon: '📝', roles: [...LEADERSHIP,'storekeeper'] },
  { label: 'Settings',         href: '/dashboard/settings',            icon: '⚙️', roles: 'all' },
]

const ROLE_LABELS: Record<string, string> = {
  principal:                   'Principal',
  deputy_principal:            'Deputy Principal',
  deputy_principal_academics:  'Deputy (Academics)',
  deputy_principal_discipline: 'Deputy (Discipline)',
  dean_of_studies:             'Dean of Studies',
  deputy_dean_of_studies:      'Deputy Dean of Studies',
  dean_of_students:            'Dean of Students',
  form_principal_form4:        'Form 4 Principal',
  form_principal_grade10:      'Grade 10 Principal',
  hod_subjects:                'Head of Department',
  hod_pathways:                'HOD Pathways',
  hod_sciences:                'HOD Sciences',
  hod_mathematics:             'HOD Mathematics',
  hod_languages:               'HOD Languages',
  hod_humanities:              'HOD Humanities',
  hod_applied_sciences:        'HOD Applied Sciences',
  hod_games_sports:            'HOD Games & Sports',
  class_teacher:               'Class Teacher',
  bom_teacher:                 'BOM Teacher',
  bursar:                      'Bursar',
  accountant:                  'Accountant',
  guidance_counselling:        'Guidance & Counselling',
  storekeeper:                 'Storekeeper',
  qaso:                        'Quality Assurance Officer',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [role, setRole] = useState('')
  const [userName, setUserName] = useState('')
  const [initials, setInitials] = useState('??')
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    applyTheme(null)
    fetchUserInfo()

    // Check subscription status — redirect to frozen page if school is suspended
    // Canteen routes are exempt (student funds, unrelated to subscription)
    if (!pathname.startsWith('/dashboard/frozen') && !pathname.startsWith('/dashboard/canteen')) {
      fetch('/api/school/subscription-status')
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.status === 'frozen') router.push('/dashboard/frozen')
        })
        .catch(() => { /* network error — don't block access */ })
    }

    // Listen for SW_UPDATED message — when new service worker activates,
    // reload the page so users immediately get the latest JS bundles
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        // Small delay so the SW fully activates before we reload
        setTimeout(() => window.location.reload(), 500)
      }
    }
    navigator.serviceWorker?.addEventListener('message', handleSWMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', handleSWMessage)
  }, [])

  function applyTheme(subRole: string | null) {
    const theme = ROLE_THEMES[subRole ?? ''] ?? ROLE_THEMES.default
    const root = document.documentElement
    root.style.setProperty('--role-primary', theme.primary)
    root.style.setProperty('--role-secondary', theme.secondary)
  }

  async function fetchUserInfo() {
    // Serve cached role instantly so nav renders without waiting for Supabase
    const cached = localStorage.getItem('sychar_role_cache')
    if (cached) {
      try {
        const { r, n, at } = JSON.parse(cached)
        // Use cache if fresher than 30 minutes
        if (Date.now() - at < 30 * 60 * 1000) {
          setRole(r); setUserName(n.split(' ')[0] || 'Staff')
          setInitials(n.split(' ').map((x: string) => x[0]).join('').slice(0, 2).toUpperCase() || '??')
          applyTheme(r)
        }
      } catch { /* ignore */ }
    }

    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: staff } = await supabase
      .from('staff_records')
      .select('sub_role, full_name')
      .eq('user_id', user.id)
      .single()
    const r = staff?.sub_role ?? ''
    const n = staff?.full_name ?? ''
    setRole(r); setUserName(n.split(' ')[0] || 'Staff')
    setInitials(n.split(' ').map((x: string) => x[0]).join('').slice(0, 2).toUpperCase() || '??')
    applyTheme(r)
    localStorage.setItem('sychar_role_cache', JSON.stringify({ r, n, at: Date.now() }))
  }

  async function handleSignOut() {
    localStorage.removeItem('sychar_role_cache')
    await getSupabase().auth.signOut()
    router.push('/login')
  }

  function canSee(item: NavItem): boolean {
    if (item.roles === 'all') return true
    if (!role) return true // show all while loading
    if (role === 'principal') return true // principal is master — sees everything
    return (item.roles as string[]).includes(role)
  }

  const sidebarW = collapsed ? 64 : 220

  const SidebarContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: collapsed ? '20px 16px' : '20px 16px',
        borderBottom: '1px solid #f1f5f9',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'white',
          border: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <SycharLogo size={22} />
        </div>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#111827', fontFamily: 'Space Grotesk, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Nkoroi Mixed Senior Secondary School
            </div>
            <div style={{ fontSize: 9, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 1 }}>Academic Year 2025/2026</div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, borderRadius: 6, color: '#6b7280', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >{collapsed ? '→' : '←'}</button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
        {NAV.filter(canSee).map(item => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '10px 12px' : '9px 12px',
                borderRadius: 10, marginBottom: 2, textDecoration: 'none',
                background: isActive ? 'var(--role-light, #f0fdfa)' : 'transparent',
                color: isActive ? 'var(--role-primary, #0891b2)' : '#374151',
                fontWeight: isActive ? 600 : 400,
                fontSize: 13,
                transition: 'background 0.15s',
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

      {/* Profile + Sign Out */}
      <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 8px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'var(--role-primary, #0891b2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: 'white',
          }}>{initials}</div>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</div>
              <div style={{ fontSize: 10, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ROLE_LABELS[role] || role}</div>
            </div>
          )}
        </div>
        <button
          onClick={handleSignOut}
          style={{
            width: '100%', marginTop: 4,
            display: 'flex', alignItems: 'center', gap: 8,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: '8px 12px', borderRadius: 10,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#dc2626', fontSize: 13, fontWeight: 500,
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
          title={collapsed ? 'Sign out' : undefined}
        >
          <span style={{ fontSize: 16 }}>🚪</span>
          {!collapsed && <span>Exit Portal</span>}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: 'DM Sans, sans-serif' }}>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
            zIndex: 40, display: 'block',
          }}
          className="md:hidden"
        />
      )}

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex"
        style={{
          width: sidebarW, flexShrink: 0,
          background: 'white', borderRight: '1px solid #f1f5f9',
          height: '100vh', position: 'sticky', top: 0,
          overflowY: 'auto', transition: 'width 0.25s ease',
          flexDirection: 'column',
          boxShadow: '2px 0 8px rgba(0,0,0,0.03)',
        }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <aside
        className="md:hidden"
        style={{
          position: 'fixed', left: 0, top: 0, bottom: 0,
          width: 220, background: 'white', borderRight: '1px solid #f1f5f9',
          zIndex: 50, transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease', display: 'flex', flexDirection: 'column',
        }}
      >
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Mobile topbar */}
        <header
          className="md:hidden"
          style={{
            height: 56, background: 'white', borderBottom: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
            position: 'sticky', top: 0, zIndex: 30,
          }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4 }}
          >☰</button>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>
            Nkoroi Portal
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--role-primary, #0891b2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'white',
            }}>{initials}</div>
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
          className="md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar — replaces sidebar on small screens */}
      <BottomTabBar />
    </div>
  )
}
