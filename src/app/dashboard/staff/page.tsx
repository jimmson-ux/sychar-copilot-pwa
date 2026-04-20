'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useSchoolId } from '@/hooks/useSchoolId'
import { ROLE_LABELS } from '@/lib/roles'
import { SkeletonTable } from '@/components/ui/Skeleton'

interface StaffMember {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  sub_role: string | null
  department: string | null
  subject_specialization: string | null
  assigned_class_name: string | null
  tsc_number: string | null
  photo_url: string | null
  can_login: boolean
}

const LEADERSHIP_ROLES = [
  'principal',
  'deputy_principal',
  'deputy_principal_academics',
  'deputy_principal_discipline',
  'dean_of_studies',
  'deputy_dean_of_studies',
  'dean_of_students',
  'form_principal_form4',
  'form_principal_grade10',
]

const LEADERSHIP_SORT: Record<string, number> = {
  principal: 0,
  deputy_principal: 1,
  deputy_principal_academics: 2,
  deputy_principal_discipline: 3,
  dean_of_studies: 4,
  deputy_dean_of_studies: 5,
  dean_of_students: 6,
  form_principal_form4: 7,
  form_principal_grade10: 8,
}

const HOD_DEPT_ROLES = [
  'hod_sciences',
  'hod_mathematics',
  'hod_languages',
  'hod_humanities',
  'hod_applied_sciences',
  'hod_games_sports',
  'hod_subjects',
]

const DEPT_COLORS: Record<string, string> = {
  hod_sciences: '#16A34A',
  hod_mathematics: '#2176FF',
  hod_languages: '#7C3AED',
  hod_humanities: '#B45309',
  hod_applied_sciences: '#0891B2',
  hod_games_sports: '#EA580C',
  hod_subjects: '#6B7280',
}

const DEPT_LABELS: Record<string, string> = {
  hod_sciences: 'Sciences',
  hod_mathematics: 'Mathematics',
  hod_languages: 'Languages',
  hod_humanities: 'Humanities',
  hod_applied_sciences: 'Applied Sciences',
  hod_games_sports: 'Games & Sports',
  hod_subjects: 'Other',
}

const STREAM_COLORS: Record<string, string> = {
  Champions: '#FDCA40',
  Achievers: '#09D1C7',
  Winners: '#2176FF',
  Victors: '#DC586D',
}

const STREAM_ORDER = ['Champions', 'Achievers', 'Winners', 'Victors']

const FORM_ORDER = ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Grade 9', 'Grade 10']

const TABS = [
  'Leadership',
  'Class Teachers',
  'HOD Pathways',
  'Department HODs',
  'Critical Operations',
  'Support Staff',
]

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function getAvatarColor(name: string): string {
  const colors = ['#0891b2', '#7c3aed', '#dc2626', '#d97706', '#16a34a', '#2563eb']
  return colors[name.charCodeAt(0) % colors.length]
}

function extractForm(className: string | null): string {
  if (!className) return 'Unknown'
  const match = className.match(/^(Form \d|Grade \d+)/)
  return match ? match[1] : 'Unknown'
}

function extractStream(className: string | null): string {
  if (!className) return 'Unknown'
  for (const stream of STREAM_ORDER) {
    if (className.includes(stream)) return stream
  }
  return 'Unknown'
}

// --- Drawer ---
function StaffDrawer({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const color = getAvatarColor(member.full_name)
  const roleLabel = ROLE_LABELS[member.sub_role ?? ''] || member.sub_role || 'Staff'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 300 }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: 370,
          background: 'white', overflowY: 'auto',
          boxShadow: '-4px 0 32px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${color}, ${color}99)`, padding: '28px 20px 24px', textAlign: 'center', position: 'relative', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: 'white', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >✕</button>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 26, margin: '0 auto 12px', border: '3px solid rgba(255,255,255,0.4)' }}>
            {getInitials(member.full_name)}
          </div>
          <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>{member.full_name}</h2>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, margin: '4px 0 0' }}>{roleLabel}</p>
          {member.can_login && (
            <span style={{ display: 'inline-block', marginTop: 8, background: 'rgba(255,255,255,0.25)', color: 'white', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, letterSpacing: '0.05em' }}>
              CAN LOGIN
            </span>
          )}
        </div>

        {/* Details */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {[
            { label: 'Email', value: member.email, icon: '✉' },
            { label: 'Phone', value: member.phone, icon: '📱' },
            { label: 'Department', value: member.department, icon: '🏢' },
            { label: 'Subject Specialization', value: member.subject_specialization, icon: '📚' },
            { label: 'Assigned Class', value: member.assigned_class_name, icon: '🎓' },
            { label: 'TSC Number', value: member.tsc_number, icon: '🪪' },
          ].filter(item => item.value).map(item => (
            <div key={item.label} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</div>
                <div style={{ fontSize: 13, color: '#111827', marginTop: 2 }}>{item.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Leadership Card ---
function LeadershipCard({ member, onClick }: { member: StaffMember; onClick: () => void }) {
  const color = getAvatarColor(member.full_name)
  const isFormPrincipal = member.sub_role === 'form_principal_form4' || member.sub_role === 'form_principal_grade10'
  const roleLabel = ROLE_LABELS[member.sub_role ?? ''] || member.sub_role || 'Staff'

  return (
    <button
      onClick={onClick}
      style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 14, padding: '18px 16px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'box-shadow 0.15s', width: '100%', position: 'relative' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {isFormPrincipal && (
        <span style={{ position: 'absolute', top: 10, right: 10, background: '#FDCA40', color: '#7c4e00', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 20, letterSpacing: '0.05em' }}>
          FORM PRINCIPAL
        </span>
      )}
      <div style={{ width: 60, height: 60, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 20, boxShadow: `0 4px 12px ${color}55` }}>
        {getInitials(member.full_name)}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{member.full_name}</div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{roleLabel}</div>
        {member.email && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{member.email}</div>}
        {member.phone && !member.email && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{member.phone}</div>}
      </div>
    </button>
  )
}

// --- Generic Staff Card ---
function StaffCard({ member, onClick, accentColor }: { member: StaffMember; onClick: () => void; accentColor?: string }) {
  const color = accentColor || getAvatarColor(member.full_name)
  const roleLabel = ROLE_LABELS[member.sub_role ?? ''] || member.sub_role || 'Staff'

  return (
    <button
      onClick={onClick}
      style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'box-shadow 0.15s', width: '100%' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 15 }}>
        {getInitials(member.full_name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.full_name}</div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>{roleLabel}</div>
        {member.subject_specialization && (
          <div style={{ fontSize: 10, color: '#9ca3af' }}>{member.subject_specialization}</div>
        )}
      </div>
      {accentColor && <div style={{ width: 4, height: 36, borderRadius: 4, background: accentColor, flexShrink: 0 }} />}
    </button>
  )
}

// --- Class Teacher Card ---
function ClassTeacherCard({ member, onClick }: { member: StaffMember; onClick: () => void }) {
  const stream = extractStream(member.assigned_class_name)
  const streamColor = STREAM_COLORS[stream] || '#6B7280'

  return (
    <button
      onClick={onClick}
      style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'box-shadow 0.15s', width: '100%' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: streamColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.full_name}</div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>Class Teacher</div>
        {member.assigned_class_name && (
          <div style={{ fontSize: 11, color: '#374151', fontWeight: 500, marginTop: 2 }}>{member.assigned_class_name}</div>
        )}
      </div>
    </button>
  )
}

// --- Prominent Critical Ops Card ---
function CriticalOpsCard({ member, onClick, accent, note }: { member: StaffMember; onClick: () => void; accent: string; note: string }) {
  const roleLabel = ROLE_LABELS[member.sub_role ?? ''] || member.sub_role || 'Staff'
  return (
    <button
      onClick={onClick}
      style={{ background: 'white', border: `2px solid ${accent}33`, borderRadius: 16, padding: '24px 20px', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 16, transition: 'box-shadow 0.15s', width: '100%', alignItems: 'flex-start' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 6px 24px ${accent}33`)}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 20, flexShrink: 0 }}>
        {getInitials(member.full_name)}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{member.full_name}</div>
        <div style={{ fontSize: 12, color: accent, fontWeight: 600, marginTop: 2 }}>{roleLabel}</div>
        {member.email && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{member.email}</div>}
        {member.phone && <div style={{ fontSize: 11, color: '#6b7280' }}>{member.phone}</div>}
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, fontStyle: 'italic' }}>{note}</div>
      </div>
    </button>
  )
}

// --- Search Result Card ---
function SearchResultCard({ member, onClick }: { member: StaffMember; onClick: () => void }) {
  const color = getAvatarColor(member.full_name)
  const roleLabel = ROLE_LABELS[member.sub_role ?? ''] || member.sub_role || 'Staff'
  return (
    <button
      onClick={onClick}
      style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'box-shadow 0.15s', width: '100%' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 15 }}>
        {getInitials(member.full_name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.full_name}</div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>{roleLabel}</div>
        {member.assigned_class_name && <div style={{ fontSize: 10, color: '#9ca3af' }}>{member.assigned_class_name}</div>}
        {member.subject_specialization && <div style={{ fontSize: 10, color: '#9ca3af' }}>{member.subject_specialization}</div>}
      </div>
      <span style={{ background: '#f3f4f6', color: '#374151', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {roleLabel}
      </span>
    </button>
  )
}

export default function StaffPage() {
  const { schoolId } = useSchoolId()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(0)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<StaffMember | null>(null)

  useEffect(() => { if (!schoolId) return; loadStaff() }, [schoolId])

  async function loadStaff() {
    const supabase = createClient()
    const { data } = await supabase
      .from('staff_records')
      .select('id, full_name, email, phone, sub_role, department, subject_specialization, assigned_class_name, tsc_number, photo_url, can_login')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('full_name')
    setStaff(data ?? [])
    setLoading(false)
  }

  const searchActive = search.trim().length > 0
  const q = search.toLowerCase()

  const searchResults = searchActive
    ? staff.filter(s =>
        s.full_name.toLowerCase().includes(q) ||
        (s.subject_specialization && s.subject_specialization.toLowerCase().includes(q)) ||
        (s.assigned_class_name && s.assigned_class_name.toLowerCase().includes(q)) ||
        (s.department && s.department.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q))
      )
    : []

  // Partition staff
  const leadership = staff
    .filter(s => LEADERSHIP_ROLES.includes(s.sub_role ?? ''))
    .sort((a, b) => (LEADERSHIP_SORT[a.sub_role ?? ''] ?? 99) - (LEADERSHIP_SORT[b.sub_role ?? ''] ?? 99))

  const classTeachers = staff.filter(s => {
    if (s.sub_role !== 'class_teacher') return false
    const cn = s.assigned_class_name
    if (!cn || cn.trim() === '') return false
    // Must end with a recognised stream name, not just any word
    const lastWord = cn.trim().split(' ').pop() ?? ''
    return STREAM_ORDER.includes(lastWord)
  })

  const hodPathways = staff.filter(s => s.sub_role === 'hod_pathways')

  const deptHods = staff.filter(s => HOD_DEPT_ROLES.includes(s.sub_role ?? ''))

  const criticalOps = staff.filter(s => s.sub_role === 'guidance_counselling' || s.sub_role === 'qaso')

  const support = staff.filter(s => ['bursar', 'accountant', 'storekeeper', 'bom_teacher'].includes(s.sub_role ?? ''))

  // Group class teachers by form then stream
  const ctByForm: Record<string, Record<string, StaffMember[]>> = {}
  classTeachers.forEach(s => {
    const form = extractForm(s.assigned_class_name)
    const stream = extractStream(s.assigned_class_name)
    if (!ctByForm[form]) ctByForm[form] = {}
    if (!ctByForm[form][stream]) ctByForm[form][stream] = []
    ctByForm[form][stream].push(s)
  })

  const sortedForms = FORM_ORDER.filter(f => ctByForm[f])
  const otherForms = Object.keys(ctByForm).filter(f => !FORM_ORDER.includes(f))
  const allForms = [...sortedForms, ...otherForms]

  // Group dept HODs by role
  const hodByDept: Record<string, StaffMember[]> = {}
  deptHods.forEach(s => {
    const role = s.sub_role ?? 'hod_subjects'
    if (!hodByDept[role]) hodByDept[role] = []
    hodByDept[role].push(s)
  })

  const tabCounts = [
    leadership.length,
    classTeachers.length,
    hodPathways.length,
    deptHods.length,
    criticalOps.length,
    support.length,
  ]

  return (
    <div style={{ padding: '24px 28px', fontFamily: 'Space Grotesk, Inter, sans-serif', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Staff Directory</h1>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>{staff.length} active staff members</p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search staff by name, subject, class, department..."
          style={{ width: '100%', maxWidth: 480, padding: '9px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', background: 'white', boxSizing: 'border-box' }}
        />
      </div>

      {loading ? (
        <SkeletonTable rows={8} />
      ) : searchActive ? (
        // Search results
        <div>
          <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &quot;{search}&quot;</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {searchResults.map(m => <SearchResultCard key={m.id} member={m} onClick={() => setSelected(m)} />)}
          </div>
          {searchResults.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', fontSize: 13 }}>No staff found</div>
          )}
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e5e7eb', overflowX: 'auto' }}>
            {TABS.map((tab, i) => (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                style={{
                  padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === i ? 700 : 500,
                  color: activeTab === i ? '#0891b2' : '#6b7280',
                  borderBottom: activeTab === i ? '2px solid #0891b2' : '2px solid transparent',
                  whiteSpace: 'nowrap', transition: 'color 0.15s',
                }}
              >
                {tab}
                {tabCounts[i] > 0 && (
                  <span style={{ marginLeft: 6, background: activeTab === i ? '#0891b233' : '#f3f4f6', color: activeTab === i ? '#0891b2' : '#9ca3af', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 20 }}>
                    {tabCounts[i]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab 0: Leadership */}
          {activeTab === 0 && (
            <div>
              {leadership.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', fontSize: 13 }}>No leadership staff found</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                  {leadership.map(m => <LeadershipCard key={m.id} member={m} onClick={() => setSelected(m)} />)}
                </div>
              )}
            </div>
          )}

          {/* Tab 1: Class Teachers */}
          {activeTab === 1 && (
            <div>
              {classTeachers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', fontSize: 13 }}>No class teachers found</div>
              ) : (
                allForms.map(form => (
                  <div key={form} style={{ marginBottom: 28 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {form}
                      <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 12 }}>
                        ({Object.values(ctByForm[form]).flat().length})
                      </span>
                    </h2>
                    {STREAM_ORDER
                      .filter(stream => ctByForm[form][stream])
                      .concat(Object.keys(ctByForm[form]).filter(s => !STREAM_ORDER.includes(s)))
                      .map(stream => {
                        const streamColor = STREAM_COLORS[stream] || '#6B7280'
                        const members = ctByForm[form][stream]
                        const classBadge = members[0]?.assigned_class_name || `${form} ${stream}`
                        return (
                          <div key={stream} style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <span style={{ background: streamColor, color: stream === 'Champions' ? '#7c4e00' : 'white', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 20, letterSpacing: '0.04em' }}>
                                {stream.toUpperCase()}
                              </span>
                              <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{classBadge}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                              {members.map(m => <ClassTeacherCard key={m.id} member={m} onClick={() => setSelected(m)} />)}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 2: HOD Pathways */}
          {activeTab === 2 && (
            <div>
              <div style={{ background: '#f5f3ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                <p style={{ fontSize: 12, color: '#6d28d9', margin: 0 }}>
                  HOD Pathways teachers manage career pathways and guidance programs. More can be added by the Principal.
                </p>
              </div>
              {hodPathways.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', fontSize: 13 }}>No HOD Pathways staff found</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {hodPathways.map(m => <StaffCard key={m.id} member={m} onClick={() => setSelected(m)} accentColor="#7C3AED" />)}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Department HODs */}
          {activeTab === 3 && (
            <div>
              {deptHods.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', fontSize: 13 }}>No department HODs found</div>
              ) : (
                HOD_DEPT_ROLES.filter(role => hodByDept[role]).map(role => {
                  const color = DEPT_COLORS[role]
                  const label = DEPT_LABELS[role]
                  return (
                    <div key={role} style={{ marginBottom: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color }} />
                        <h2 style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: 0 }}>{label}</h2>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>({hodByDept[role].length})</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                        {hodByDept[role].map(m => (
                          <button
                            key={m.id}
                            onClick={() => setSelected(m)}
                            style={{ background: 'white', border: `1px solid ${color}33`, borderRadius: 12, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'box-shadow 0.15s', width: '100%' }}
                            onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 4px 16px ${color}33`)}
                            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                          >
                            <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 15 }}>
                              {getInitials(m.full_name)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.full_name}</div>
                              <div style={{ fontSize: 11, color: '#6b7280' }}>{ROLE_LABELS[m.sub_role ?? ''] || m.sub_role}</div>
                              {m.subject_specialization && <div style={{ fontSize: 10, color: '#9ca3af' }}>{m.subject_specialization}</div>}
                            </div>
                            <span style={{ background: `${color}22`, color: color, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Tab 4: Critical Operations */}
          {activeTab === 4 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {criticalOps.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', fontSize: 13, gridColumn: '1/-1' }}>No critical operations staff found</div>
              ) : (
                criticalOps.map(m => {
                  const isGuidance = m.sub_role === 'guidance_counselling'
                  return (
                    <CriticalOpsCard
                      key={m.id}
                      member={m}
                      onClick={() => setSelected(m)}
                      accent={isGuidance ? '#0C6478' : '#384358'}
                      note={isGuidance ? 'Handles confidential student welfare' : 'School quality & compliance oversight'}
                    />
                  )
                })
              )}
            </div>
          )}

          {/* Tab 5: Support Staff */}
          {activeTab === 5 && (
            <div>
              {support.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', fontSize: 13 }}>No support staff found</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {support.map(m => <StaffCard key={m.id} member={m} onClick={() => setSelected(m)} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Drawer */}
      {selected && <StaffDrawer member={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
