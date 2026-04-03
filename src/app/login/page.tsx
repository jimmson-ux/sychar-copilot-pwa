'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Eye, EyeOff, Loader2, X, ChevronRight, ChevronLeft } from 'lucide-react'

function getClient() { return createClient() }

// ── Types ─────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string
  full_name: string
  sub_role: string
  email: string | null
  assigned_class_name: string | null
  department: string | null
}

interface SchoolStats {
  students: number
  boys: number
  girls: number
  staff: number
  classes: number
}

type TabKey = 'leadership' | 'hods' | 'pathways' | 'class_teachers' | 'support' | 'other_departments'

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: 'leadership',       icon: '🏛',  label: 'Leadership'        },
  { key: 'hods',             icon: '🎓',  label: 'HODs'              },
  { key: 'pathways',         icon: '🛤',  label: 'Pathways'          },
  { key: 'class_teachers',   icon: '👩‍🏫', label: 'Class Teachers'   },
  { key: 'support',          icon: '🏢',  label: 'Support Staff'     },
  { key: 'other_departments',icon: '🔷',  label: 'Other Departments' },
]

const LEADERSHIP_ROLES = ['principal','deputy_principal','deputy_principal_academics','deputy_principal_discipline','dean_of_studies','deputy_dean_of_studies','dean_of_students','form_principal_form4','form_principal_grade10']
const HOD_ROLES        = ['hod_sciences','hod_mathematics','hod_languages','hod_humanities','hod_applied_sciences','hod_games_sports']
const PATHWAYS_ROLES   = ['hod_pathways']
const CLASS_ROLES      = ['class_teacher']
const SUPPORT_ROLES    = ['accountant','storekeeper','bursar','school_secretary']
const OTHER_ROLES      = ['guidance_counselling','qaso']

// ── Role helpers ──────────────────────────────────────────────────────────────

interface RoleMeta { label: string; color: string; gradient: string; glow: string }

function getRoleLabel(s: StaffMember): string {
  const map: Record<string, string> = {
    principal:               'Principal',
    deputy_principal:        'Deputy Principal',
    dean_of_studies:         'Dean of Studies',
    deputy_dean_of_studies:  'Deputy Dean of Studies',
    dean_of_students:        'Dean of Students',
    form_principal_form4:    'Form 4 Principal',
    form_principal_grade10:  'Grade 10 Principal',
    guidance_counselling:    'Guidance & Counsellor',
    hod_sciences:            'HOD — Sciences',
    hod_mathematics:         'HOD — Mathematics',
    hod_languages:           'HOD — Languages',
    hod_humanities:          'HOD — Humanities',
    hod_applied_sciences:    'HOD — Applied Sciences',
    hod_games_sports:        'HOD — Games & Sports',
    hod_pathways:            'Pathways — ' + (s.department ?? ''),
    class_teacher:           (s.assigned_class_name ? s.assigned_class_name + ' Class Teacher' : 'Class Teacher'),
    bom_teacher:             (s.assigned_class_name ? s.assigned_class_name + ' Class Teacher' : 'Class Teacher'),
    accountant:              'School Accountant',
    storekeeper:             'Storekeeper',
    qaso:                    'Quality Assurance Officer',
    bursar:                  'Bursar',
    school_secretary:        'School Secretary',
  }
  return map[s.sub_role] ?? s.sub_role
}

function getRoleMeta(subRole: string): RoleMeta {
  const meta: Record<string, RoleMeta> = {
    principal:               { label: 'Principal',            color: '#B51A2B', gradient: 'linear-gradient(135deg,#B51A2B,#FFA586)', glow: 'rgba(181,26,43,0.25)' },
    deputy_principal:        { label: 'Deputy Principal',     color: '#09D1C7', gradient: 'linear-gradient(135deg,#09D1C7,#46DFB1)', glow: 'rgba(9,209,199,0.25)' },
    dean_of_studies:         { label: 'Dean of Studies',      color: '#7C3AED', gradient: 'linear-gradient(135deg,#7C3AED,#A78BFA)', glow: 'rgba(124,58,237,0.25)' },
    deputy_dean_of_studies:  { label: 'Deputy Dean',          color: '#7C3AED', gradient: 'linear-gradient(135deg,#7C3AED,#A78BFA)', glow: 'rgba(124,58,237,0.25)' },
    dean_of_students:        { label: 'Dean of Students',     color: '#DC586D', gradient: 'linear-gradient(135deg,#DC586D,#FFBB94)', glow: 'rgba(220,88,109,0.25)' },
    form_principal_form4:    { label: 'Form 4 Principal',     color: '#0F766E', gradient: 'linear-gradient(135deg,#0F766E,#2DD4BF)', glow: 'rgba(15,118,110,0.25)' },
    form_principal_grade10:  { label: 'Grade 10 Principal',   color: '#0F766E', gradient: 'linear-gradient(135deg,#0F766E,#2DD4BF)', glow: 'rgba(15,118,110,0.25)' },
    guidance_counselling:    { label: 'Guidance',             color: '#D97706', gradient: 'linear-gradient(135deg,#D97706,#FCD34D)', glow: 'rgba(217,119,6,0.25)' },
    hod_sciences:            { label: 'HOD Sciences',         color: '#09D1C7', gradient: 'linear-gradient(135deg,#09D1C7,#80EE98)', glow: 'rgba(9,209,199,0.25)' },
    hod_mathematics:         { label: 'HOD Mathematics',      color: '#2176FF', gradient: 'linear-gradient(135deg,#2176FF,#80EE98)', glow: 'rgba(33,118,255,0.25)' },
    hod_languages:           { label: 'HOD Languages',        color: '#7C3AED', gradient: 'linear-gradient(135deg,#7C3AED,#A78BFA)', glow: 'rgba(124,58,237,0.25)' },
    hod_humanities:          { label: 'HOD Humanities',       color: '#D97706', gradient: 'linear-gradient(135deg,#D97706,#FCD34D)', glow: 'rgba(217,119,6,0.25)' },
    hod_applied_sciences:    { label: 'HOD Applied Sciences', color: '#0F766E', gradient: 'linear-gradient(135deg,#0F766E,#2DD4BF)', glow: 'rgba(15,118,110,0.25)' },
    hod_games_sports:        { label: 'HOD Games & Sports',   color: '#DC586D', gradient: 'linear-gradient(135deg,#DC586D,#FFBB94)', glow: 'rgba(220,88,109,0.25)' },
    hod_pathways:            { label: 'HOD Pathways',         color: '#2176FF', gradient: 'linear-gradient(135deg,#2176FF,#FDCA40)', glow: 'rgba(33,118,255,0.25)' },
    class_teacher:           { label: 'Class Teacher',        color: '#0891b2', gradient: 'linear-gradient(135deg,#0891b2,#22c55e)', glow: 'rgba(8,145,178,0.25)' },
    bom_teacher:             { label: 'Class Teacher',        color: '#0891b2', gradient: 'linear-gradient(135deg,#0891b2,#22c55e)', glow: 'rgba(8,145,178,0.25)' },
    accountant:              { label: 'Accountant',           color: '#374151', gradient: 'linear-gradient(135deg,#374151,#9CA3AF)', glow: 'rgba(55,65,81,0.25)' },
    storekeeper:             { label: 'Storekeeper',          color: '#6B7280', gradient: 'linear-gradient(135deg,#6B7280,#D1D5DB)', glow: 'rgba(107,114,128,0.25)' },
    qaso:                    { label: 'QASO',                 color: '#384358', gradient: 'linear-gradient(135deg,#384358,#FFA586)', glow: 'rgba(56,67,88,0.25)' },
    bursar:                  { label: 'Bursar',               color: '#2176FF', gradient: 'linear-gradient(135deg,#2176FF,#FDCA40)', glow: 'rgba(33,118,255,0.25)' },
  }
  return meta[subRole] ?? { label: subRole, color: '#1e40af', gradient: 'linear-gradient(135deg,#1e40af,#22c55e)', glow: 'rgba(30,64,175,0.25)' }
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const STREAM_COLORS: Record<string, string> = {
  Champions: '#d97706',
  Achievers: '#0891b2',
  Winners:   '#2563eb',
  Victors:   '#be185d',
}

function extractStream(className: string | null): string {
  if (!className) return ''
  const parts = className.split(' ')
  return parts[parts.length - 1] ?? ''
}

// ── Sychar logo SVG ───────────────────────────────────────────────────────────

function SycharIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} fill="none">
      <defs>
        <linearGradient id="hg" x1="0" y1="0" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e40af"/>
          <stop offset="50%" stopColor="#0891b2"/>
          <stop offset="100%" stopColor="#22c55e"/>
        </linearGradient>
      </defs>
      <path d="M10 15 Q30 8 50 15" stroke="url(#hg)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M10 30 Q30 30 50 30" stroke="url(#hg)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M10 45 Q30 52 50 45" stroke="url(#hg)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M15 10 Q8 30 15 50" stroke="url(#hg)" strokeWidth="5" strokeLinecap="round"/>
      <path d="M45 10 Q52 30 45 50" stroke="url(#hg)" strokeWidth="5" strokeLinecap="round"/>
    </svg>
  )
}

// ── Staff card ─────────────────────────────────────────────────────────────────

function StaffCard({ s, onClick }: { s: StaffMember; onClick: () => void }) {
  const meta = getRoleMeta(s.sub_role)
  const label = getRoleLabel(s)
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'white',
        border: `1px solid ${hovered ? meta.color : '#f1f5f9'}`,
        borderRadius: 16, padding: 16,
        cursor: 'pointer', textAlign: 'left', width: '100%',
        transition: 'all 0.18s ease',
        boxShadow: hovered ? '0 4px 20px rgba(0,0,0,0.08)' : 'none',
        transform: hovered ? 'translateY(-1px)' : 'none',
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
        background: meta.gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontWeight: 700, fontSize: 17,
        fontFamily: 'Space Grotesk, sans-serif',
      }}>
        {getInitials(s.full_name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>{s.full_name}</div>
        <div style={{ fontSize: 13, color: meta.color, marginTop: 3 }}>{label}</div>
      </div>
      <ChevronRight size={16} color="#9ca3af" />
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter()
  const [staff, setStaff]               = useState<StaffMember[]>([])
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [activeTab, setActiveTab]       = useState<TabKey>('leadership')
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [selected, setSelected]         = useState<StaffMember | null>(null)
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPw, setShowPw]             = useState(false)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [stats, setStats]               = useState<SchoolStats | null>(null)

  const loadStaff = useCallback(async () => {
    setLoadingStaff(true)
    try {
      const res = await fetch('/api/auth/staff-list')
      if (res.ok) {
        const d = await res.json() as { staff: StaffMember[] }
        setStaff(d.staff)
      }
    } finally {
      setLoadingStaff(false)
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/school-stats')
      if (res.ok) setStats(await res.json())
    } catch { /* silent */ }
  }, [])

  useEffect(() => { loadStaff(); loadStats() }, [loadStaff, loadStats])

  function selectStaff(s: StaffMember) {
    setSelected(s)
    setEmail(s.email ?? '')
    setPassword('')
    setError('')
  }

  function closePanel() {
    setSelected(null)
    setEmail('')
    setPassword('')
    setError('')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: authError } = await getClient().auth.signInWithPassword({ email, password })

    if (authError || !data.user) {
      setError(authError?.message ?? 'Login failed')
      setLoading(false)
      return
    }

    if (selected) {
      document.documentElement.dataset.role = selected.sub_role
      localStorage.setItem('sychar_role', selected.sub_role)
      localStorage.setItem('sychar_name', selected.full_name)
      localStorage.setItem('sychar_staff_id', selected.id)
    }

    router.push('/dashboard')
  }

  // ── Filter staff per tab ────────────────────────────────────────────────────
  function getTabStaff(tab: TabKey): StaffMember[] {
    const rolesets: Record<TabKey, string[]> = {
      leadership:        LEADERSHIP_ROLES,
      hods:              HOD_ROLES,
      pathways:          PATHWAYS_ROLES,
      class_teachers:    CLASS_ROLES,
      support:           SUPPORT_ROLES,
      other_departments: OTHER_ROLES,
    }
    if (tab === 'class_teachers') {
      // Rule: anyone with a valid stream class is the class teacher for that class,
      // regardless of sub_role (covers class_teacher, form_principal_*, hod_games_sports, hod_pathways, etc.)
      const KNOWN_STREAMS = new Set(Object.keys(STREAM_COLORS))
      return staff.filter(s => {
        const cn = s.assigned_class_name
        if (!cn || cn.trim() === '') return false
        return KNOWN_STREAMS.has(extractStream(cn))
      })
    }
    return staff.filter(s => rolesets[tab].includes(s.sub_role))
  }

  // Group class teachers by stream, sorted by form level within each stream
  function groupByStream(teachers: StaffMember[]): [string, StaffMember[]][] {
    const order = ['Champions', 'Achievers', 'Winners', 'Victors', 'Other']
    const map = new Map<string, StaffMember[]>()
    for (const t of teachers) {
      const stream = extractStream(t.assigned_class_name) || 'Other'
      const key = order.includes(stream) ? stream : 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    // Sort within each stream by form level ascending (Grade 10 < Form 3 < Form 4 won't sort well numerically — use explicit mapping)
    const formRank = (cn: string | null): number => {
      if (!cn) return 99
      const m = cn.match(/(?:form|grade)\s*(\d+)/i)
      if (!m) return 99
      return parseInt(m[1], 10)
    }
    return order.filter(k => map.has(k)).map(k => {
      const sorted = map.get(k)!.slice().sort((a, b) => formRank(a.assigned_class_name) - formRank(b.assigned_class_name))
      return [k, sorted] as [string, StaffMember[]]
    })
  }

  const tabStaff = getTabStaff(activeTab)
  const selectedMeta = selected ? getRoleMeta(selected.sub_role) : null
  const selectedLabel = selected ? getRoleLabel(selected) : ''

  const fmt = (n: number) => n.toLocaleString()

  return (
    <>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .panel-in { animation: fadeSlideUp 0.3s ease; }
        .sidebar-link { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; border:none; background:none; cursor:pointer; width:100%; text-align:left; transition:background 0.15s; }
        .sidebar-link:hover { background:#f9fafb; }
        @media (max-width:767px) {
          .login-layout { flex-direction:column !important; }
          .sidebar-col { width:100% !important; min-width:unset !important; max-width:unset !important; border-right:none !important; border-bottom:1px solid #f1f5f9 !important; }
          .sidebar-col-inner { flex-direction:row !important; overflow-x:auto; padding:8px 12px !important; gap:4px !important; white-space:nowrap; }
          .sidebar-toggle { display:none !important; }
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', flexDirection: 'column' }}>

        {/* ── Sticky header ──────────────────────────────────────────────────── */}
        <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'white', borderBottom: '1px solid #f3f4f6', padding: '0 20px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', flexShrink: 0 }}>
              <SycharIcon size={22} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', background: 'linear-gradient(to right,#1e40af,#0891b2,#22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', lineHeight: 1.2 }}>
                Nkoroi Mixed Senior Secondary School
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 1 }}>
                Academic Year 2025/2026
              </div>
            </div>
          </div>
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 18, display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6 }}>
            →
          </button>
        </header>

        {/* ── Layout: sidebar + content ──────────────────────────────────────── */}
        <div className="login-layout" style={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* ── Left sidebar ─────────────────────────────────────────────────── */}
          <div
            className="sidebar-col"
            style={{ width: sidebarOpen ? 200 : 56, minWidth: sidebarOpen ? 200 : 56, transition: 'width 0.25s ease, min-width 0.25s ease', borderRight: '1px solid #f1f5f9', background: 'white', flexShrink: 0, position: 'relative' }}
          >
            <div className="sidebar-col-inner" style={{ display: 'flex', flexDirection: 'column', padding: '12px 8px', gap: 2 }}>
              {TABS.map(tab => {
                const active = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    className="sidebar-link"
                    onClick={() => setActiveTab(tab.key)}
                    style={{ background: active ? '#f0f9ff' : 'none', color: active ? '#0891b2' : '#6b7280', fontWeight: active ? 600 : 400, fontSize: 13, borderRadius: 10, justifyContent: sidebarOpen ? 'flex-start' : 'center' }}
                    title={tab.label}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{tab.icon}</span>
                    {sidebarOpen && <span style={{ fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>{tab.label}</span>}
                  </button>
                )
              })}
            </div>

            {/* School Profile link at bottom */}
            <div style={{ position: 'absolute', bottom: 52, left: 0, right: 0, padding: '0 8px' }}>
              <a
                href="/school-profile"
                className="sidebar-link"
                style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#6b7280', textDecoration: 'none', borderRadius: 10, justifyContent: sidebarOpen ? 'flex-start' : 'center' }}
                title="School Profile"
              >
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>🏫</span>
                {sidebarOpen && <span style={{ fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>School Profile</span>}
              </a>
            </div>

            {/* Toggle chevron */}
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarOpen(o => !o)}
              style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: 'white', border: '1px solid #f1f5f9', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}
            >
              {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>

          {/* ── Main content ──────────────────────────────────────────────────── */}
          <main style={{ flex: 1, overflowY: 'auto', padding: '32px 20px 80px', maxWidth: 720, margin: '0 auto', width: '100%' }}>

            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>Staff Login Portal</h1>
              <p style={{ fontSize: 15, color: '#6b7280', marginTop: 6 }}>Select your name to access your dashboard</p>
            </div>

            {/* Tab title */}
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {TABS.find(t => t.key === activeTab)?.icon} {TABS.find(t => t.key === activeTab)?.label}
              </span>
            </div>

            {loadingStaff ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}>
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
              </div>
            ) : tabStaff.length === 0 ? (
              <p style={{ color: '#9ca3af', textAlign: 'center', paddingTop: 48, fontSize: 14 }}>No staff in this category.</p>
            ) : activeTab === 'class_teachers' ? (
              /* Grouped by stream, sorted by form level */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {groupByStream(tabStaff).map(([stream, teachers]) => (
                  <div key={stream}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ flex: 1, height: 1, background: STREAM_COLORS[stream] ?? '#e5e7eb', opacity: 0.5 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: STREAM_COLORS[stream] ?? '#6b7280', letterSpacing: '0.1em', textTransform: 'uppercase' }}>── {stream} ──</span>
                      <div style={{ flex: 1, height: 1, background: STREAM_COLORS[stream] ?? '#e5e7eb', opacity: 0.5 }} />
                    </div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {teachers.map(s => <StaffCard key={s.id} s={s} onClick={() => selectStaff(s)} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : activeTab === 'pathways' ? (
              /* Pathways — display only, no login from here */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 16px', fontSize: 13, color: '#92400e', marginBottom: 4 }}>
                  💡 Pathways staff log in via the <strong>Class Teachers</strong> tab using their class credentials.
                </div>
                {tabStaff.map(s => {
                  const meta = getRoleMeta(s.sub_role)
                  const label = getRoleLabel(s)
                  return (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        background: 'white',
                        border: `1.5px dashed #fbbf24`,
                        borderRadius: 16, padding: 16,
                        cursor: 'default', textAlign: 'left', width: '100%',
                        position: 'relative', opacity: 0.85,
                      }}
                    >
                      <div style={{
                        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                        background: meta.gradient,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 700, fontSize: 17,
                        fontFamily: 'Space Grotesk, sans-serif',
                      }}>
                        {getInitials(s.full_name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>{s.full_name}</div>
                        <div style={{ fontSize: 13, color: meta.color, marginTop: 3 }}>{label}</div>
                      </div>
                      <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 100, padding: '3px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        Login via Class Teachers tab
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : activeTab === 'other_departments' ? (
              /* Other Departments — guidance & counselling, QASO */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, padding: '10px 16px', fontSize: 13, color: '#0c4a6e', marginBottom: 4 }}>
                  🔷 Specialist roles — Guidance & Counsellor and Quality Assurance Officer.
                </div>
                {tabStaff.map(s => <StaffCard key={s.id} s={s} onClick={() => selectStaff(s)} />)}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {tabStaff.map(s => <StaffCard key={s.id} s={s} onClick={() => selectStaff(s)} />)}
              </div>
            )}

            {/* ── School profile card ──────────────────────────────────────── */}
            <div style={{ marginTop: 56, background: 'white', borderRadius: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 24px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

              {/* Gradient header */}
              <div style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#0e4d2f 100%)', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" style={{ width: 28, height: 28 }}>
                    <path d="M12 3L3 8v13h7v-5h4v5h7V8L12 3z" fill="white" fillOpacity="0.9"/>
                    <rect x="9" y="14" width="6" height="7" fill="#0f172a" fillOpacity="0.4" rx="1"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'white', fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1.2 }}>Nkoroi Mixed Senior Secondary School</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>Ongata Rongai · Kajiado County</div>
                </div>
              </div>

              {/* Identity row */}
              <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
                {[{ label: 'KNEC CODE', value: '31557224' }, { label: 'S/N', value: '1834' }, { label: 'TYPE', value: 'Day School' }].map((item, i) => (
                  <div key={item.label} style={{ flex: 1, textAlign: 'center', padding: '12px 6px', borderRight: i < 2 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif', marginTop: 3 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* About paragraph */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 12, color: '#6b7280', lineHeight: 1.6, fontStyle: 'italic' }}>
                A proud, high-performing day school accommodating{' '}
                <strong style={{ fontStyle: 'normal', color: '#111827' }}>{stats ? fmt(stats.students) : '…'}</strong> students —{' '}
                <strong style={{ fontStyle: 'normal', color: '#2176FF' }}>{stats ? fmt(stats.boys) : '…'}</strong> boys and{' '}
                <strong style={{ fontStyle: 'normal', color: '#DC586D' }}>{stats ? fmt(stats.girls) : '…'}</strong> girls, served by{' '}
                <strong style={{ fontStyle: 'normal', color: '#22c55e' }}>{stats ? fmt(stats.staff) : '…'}</strong> dedicated teaching staff across 5 academic departments.
              </div>

              {/* 2×2 stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '14px 12px', borderBottom: '1px solid #f1f5f9' }}>
                {[
                  { icon: '👥', label: 'STUDENTS',       value: stats ? fmt(stats.students) : '…', sub: stats ? `${fmt(stats.boys)}♂ · ${fmt(stats.girls)}♀` : null, bg: '#2176FF10', border: '#2176FF25', color: '#2176FF' },
                  { icon: '👨‍🏫', label: 'TEACHING STAFF', value: stats ? fmt(stats.staff) : '…',    sub: null, bg: '#22c55e10', border: '#22c55e25', color: '#22c55e' },
                  { icon: '🏫', label: 'CLASSES',         value: stats ? fmt(stats.classes) : '…',  sub: null, bg: '#7c3aed10', border: '#7c3aed25', color: '#7c3aed' },
                  { icon: '🏢', label: 'DEPARTMENTS',     value: '5',                                sub: null, bg: '#d9770610', border: '#d9770625', color: '#d97706' },
                ].map(cell => (
                  <div key={cell.label} style={{ background: cell.bg, border: `1px solid ${cell.border}`, borderRadius: 14, padding: '16px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 20 }}>{cell.icon}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: cell.color, fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1, marginTop: 6 }}>{cell.value}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{cell.label}</div>
                    {cell.sub && <div style={{ fontSize: 10, color: '#b8bfc8', marginTop: 2 }}>{cell.sub}</div>}
                  </div>
                ))}
              </div>

              {/* Bottom info row */}
              <div style={{ display: 'flex' }}>
                {[{ icon: '📚', label: 'CURRICULUM', value: '844 & CBC' }, { icon: '⚖️', label: 'GENDER', value: 'Mixed' }, { icon: '🏛', label: 'ESTABLISHED', value: '1984' }].map((item, i) => (
                  <div key={item.label} style={{ flex: 1, textAlign: 'center', padding: '12px 6px', borderRight: i < 2 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ fontSize: 18 }}>{item.icon}</div>
                    <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', fontFamily: 'Space Grotesk, sans-serif', marginTop: 2 }}>{item.value}</div>
                  </div>
                ))}
              </div>

            </div>
          </main>
        </div>
      </div>

      {/* ── Backdrop ─────────────────────────────────────────────────────────── */}
      {selected && (
        <div
          onClick={closePanel}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)', zIndex: 40 }}
        />
      )}

      {/* ── Glassmorphic login panel ─────────────────────────────────────────── */}
      {selected && selectedMeta && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 50, width: '100%', maxWidth: 380, padding: '0 24px' }}>
          <div
            className="panel-in"
            style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(40px) saturate(180%)', border: '1px solid rgba(255,255,255,0.8)', borderRadius: 24, padding: 32, position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}
          >
            {/* Close */}
            <button onClick={closePanel} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6b7280' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}
            >
              <X size={18} />
            </button>

            {/* Avatar */}
            <div style={{ width: 64, height: 64, borderRadius: 16, background: selectedMeta.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', boxShadow: `0 8px 24px ${selectedMeta.glow}`, color: 'white', fontSize: 22, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif' }}>
              {getInitials(selected.full_name)}
            </div>

            {/* Name + role pill */}
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>{selected.full_name}</div>
              <span style={{ display: 'inline-block', marginTop: 6, background: `${selectedMeta.color}15`, color: selectedMeta.color, border: `1px solid ${selectedMeta.color}40`, borderRadius: 100, padding: '4px 14px', fontSize: 13, fontWeight: 600 }}>
                {selectedLabel}
              </span>
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid #f1f5f9', margin: '24px 0' }} />

            {/* Form */}
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Email address</label>
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@school.ac.ke"
                  style={{ width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#111827', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                  onFocus={e => { e.target.style.borderColor = selectedMeta.color }}
                  onBlur={e => { e.target.style.borderColor = '#e5e7eb' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{ width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 44px 12px 16px', fontSize: 14, color: '#111827', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                    onFocus={e => { e.target.style.borderColor = selectedMeta.color }}
                    onBlur={e => { e.target.style.borderColor = '#e5e7eb' }}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center' }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 12, padding: '10px 16px', fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span>⚠️</span><span>{error}</span>
                </div>
              )}

              <button
                type="submit" disabled={loading}
                style={{ width: '100%', padding: '14px 0', borderRadius: 16, fontWeight: 600, fontSize: 15, color: 'white', background: selectedMeta.gradient, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, boxShadow: `0 4px 20px ${selectedMeta.glow}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'Space Grotesk, sans-serif', transition: 'opacity 0.15s' }}
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? 'Signing in...' : `Sign in as ${selectedLabel}`}
              </button>

              <button type="button" onClick={closePanel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '4px 0' }}>
                ← Back
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
