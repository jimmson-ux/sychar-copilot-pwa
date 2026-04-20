'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type AttStatus = 'Present' | 'Absent' | 'Late' | 'Leave'

interface StaffRecord {
  id: string
  full_name: string
  sub_role: string
  department: string | null
  employment_type: string | null
}

interface AttRow {
  staff_id: string
  status: AttStatus
  check_in_time: string
  notes: string
}

const STATUS_COLORS: Record<AttStatus, { bg: string; color: string }> = {
  Present: { bg: '#16a34a', color: 'white' },
  Absent: { bg: '#dc2626', color: 'white' },
  Late: { bg: '#d97706', color: 'white' },
  Leave: { bg: '#6b7280', color: 'white' },
}

const ROLE_LABELS: Record<string, string> = {
  principal: 'Principal', deputy_principal: 'Deputy Principal',
  dean_of_studies: 'Dean of Studies', dean_of_students: 'Dean of Students',
  class_teacher: 'Class Teacher', hod_sciences: 'HOD Sciences',
  hod_mathematics: 'HOD Mathematics', hod_languages: 'HOD Languages',
  hod_humanities: 'HOD Humanities', hod_applied_sciences: 'HOD Applied Sciences',
  bursar: 'Bursar', accountant: 'Accountant', storekeeper: 'Storekeeper',
  guidance_counselling: 'Guidance & Counselling', qaso: 'Quality Assurance Officer',
}

export default function StaffAttendancePage() {
  const [staff, setStaff] = useState<StaffRecord[]>([])
  const [attendance, setAttendance] = useState<Record<string, AttRow>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schoolId, setSchoolId] = useState('')
  const [filter, setFilter] = useState<'all' | 'teaching' | 'non-teaching'>('all')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null)

  const TEACHING_ROLES = ['principal','deputy_principal','dean_of_studies','dean_of_students','class_teacher','hod_sciences','hod_mathematics','hod_languages','hod_humanities','hod_applied_sciences','hod_games_sports','hod_subjects','hod_pathways','bom_teacher']

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: me } = await supabase.from('staff_records').select('school_id').eq('user_id', user.id).single()
    if (!me) return
    setSchoolId(me.school_id)
    const { data: school } = await supabase.from('schools').select('features').eq('id', me.school_id).single()
    setFeatureEnabled(school?.features?.staff_attendance ?? false)
    if (!school?.features?.staff_attendance) { setLoading(false); return }

    const [staffRes, attRes] = await Promise.all([
      supabase.from('staff_records').select('id, full_name, sub_role, department, employment_type').eq('school_id', me.school_id).eq('is_active', true).order('full_name'),
      supabase.from('staff_attendance').select('*').eq('school_id', me.school_id).eq('date', date),
    ])
    setStaff(staffRes.data ?? [])
    const attMap: Record<string, AttRow> = {}
    for (const row of (attRes.data ?? [])) {
      attMap[row.staff_id] = { staff_id: row.staff_id, status: row.status, check_in_time: row.check_in_time ?? '', notes: row.notes ?? '' }
    }
    setAttendance(attMap)
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  function setStatus(staffId: string, status: AttStatus) {
    setAttendance(prev => ({ ...prev, [staffId]: { ...prev[staffId], staff_id: staffId, status, check_in_time: prev[staffId]?.check_in_time ?? '', notes: prev[staffId]?.notes ?? '' } }))
  }

  function setCheckIn(staffId: string, time: string) {
    setAttendance(prev => ({ ...prev, [staffId]: { ...prev[staffId], staff_id: staffId, status: prev[staffId]?.status ?? 'Present', check_in_time: time, notes: prev[staffId]?.notes ?? '' } }))
  }

  function setNotes(staffId: string, notes: string) {
    setAttendance(prev => ({ ...prev, [staffId]: { ...prev[staffId], staff_id: staffId, status: prev[staffId]?.status ?? 'Absent', check_in_time: prev[staffId]?.check_in_time ?? '', notes } }))
  }

  async function submitRegister() {
    setSaving(true)
    const supabase = createClient()
    const rows = Object.values(attendance).map(a => ({
      school_id: schoolId,
      staff_id: a.staff_id,
      date,
      status: a.status,
      check_in_time: a.check_in_time || null,
      notes: a.notes || null,
    }))
    const { error } = await supabase.from('staff_attendance').upsert(rows, { onConflict: 'school_id,staff_id,date' })
    setSaving(false)
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setMsg({ ok: true, text: `Register submitted for ${date}` })
  }

  if (featureEnabled === false) {
    return (
      <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ background: 'white', border: '2px dashed #e5e7eb', borderRadius: 20, padding: '40px 48px', textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 8px', fontFamily: 'Space Grotesk, sans-serif' }}>Staff Attendance — Add-on Required</h2>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>Contact Sychar to enable this feature for your school.</p>
        </div>
      </div>
    )
  }

  const filteredStaff = staff.filter(s => {
    if (filter === 'teaching') return TEACHING_ROLES.includes(s.sub_role)
    if (filter === 'non-teaching') return !TEACHING_ROLES.includes(s.sub_role)
    return true
  })

  const summary = {
    present: Object.values(attendance).filter(a => a.status === 'Present').length,
    absent: Object.values(attendance).filter(a => a.status === 'Absent').length,
    late: Object.values(attendance).filter(a => a.status === 'Late').length,
    leave: Object.values(attendance).filter(a => a.status === 'Leave').length,
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>Staff Attendance Register</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Nkoroi Mixed Senior Secondary School</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, outline: 'none' }}
          />
          <button
            onClick={submitRegister}
            disabled={saving}
            style={{ background: '#0891b2', color: 'white', border: 'none', borderRadius: 10, padding: '9px 20px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving...' : 'Submit Register'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Present', value: summary.present, color: '#16a34a' },
          { label: 'Absent', value: summary.absent, color: '#dc2626' },
          { label: 'Late', value: summary.late, color: '#d97706' },
          { label: 'On Leave', value: summary.leave, color: '#6b7280' },
        ].map(c => (
          <div key={c.label} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, padding: '12px 16px', borderTop: `3px solid ${c.color}` }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color, fontFamily: 'Space Grotesk, sans-serif' }}>{c.value}</div>
            <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {msg && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: msg.ok ? '#f0fdf4' : '#fef2f2', color: msg.ok ? '#16a34a' : '#dc2626', border: `1px solid ${msg.ok ? '#bbf7d0' : '#fecaca'}`, fontSize: 13 }}>
          {msg.text}
        </div>
      )}

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'teaching', 'non-teaching'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 16px', borderRadius: 100, border: '1px solid #e5e7eb', background: filter === f ? '#111827' : 'white', color: filter === f ? 'white' : '#374151', fontSize: 12, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' }}>
            {f === 'all' ? 'All Staff' : f === 'teaching' ? 'Teaching' : 'Non-Teaching'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>Loading staff list...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredStaff.map(s => {
            const att = attendance[s.id]
            const status = att?.status
            return (
              <div key={s.id} style={{
                background: 'white', border: '1px solid #f1f5f9', borderRadius: 12,
                padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                borderLeft: status ? `4px solid ${STATUS_COLORS[status].bg}` : '4px solid #f1f5f9',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{s.full_name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{ROLE_LABELS[s.sub_role] ?? s.sub_role}{s.department ? ` · ${s.department}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['Present', 'Late', 'Absent', 'Leave'] as AttStatus[]).map(st => (
                      <button
                        key={st}
                        onClick={() => setStatus(s.id, st)}
                        style={{
                          padding: '5px 12px', borderRadius: 8, border: `1px solid ${STATUS_COLORS[st].bg}`,
                          background: status === st ? STATUS_COLORS[st].bg : 'white',
                          color: status === st ? STATUS_COLORS[st].color : STATUS_COLORS[st].bg,
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                  {(status === 'Present' || status === 'Late') && (
                    <input
                      type="time"
                      value={att?.check_in_time ?? ''}
                      onChange={e => setCheckIn(s.id, e.target.value)}
                      style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, outline: 'none' }}
                      placeholder="Check-in"
                    />
                  )}
                  {(status === 'Absent' || status === 'Late' || status === 'Leave') && (
                    <input
                      value={att?.notes ?? ''}
                      onChange={e => setNotes(s.id, e.target.value)}
                      placeholder="Notes..."
                      style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, outline: 'none', minWidth: 120 }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
