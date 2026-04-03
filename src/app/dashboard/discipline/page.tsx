'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient, SCHOOL_ID } from '@/lib/supabase'
import { formatDate } from '@/lib/roles'
import { SkeletonTable } from '@/components/ui/Skeleton'

interface Incident {
  id: string
  incident_type: string
  severity: string
  incident_date: string
  description: string | null
  action_taken: string | null
  parent_notified: boolean
  dean_reviewed: boolean
  status: string | null
  student_id: string
  student_name: string
  class_name: string
}

const SEVERITIES = ['all', 'minor', 'moderate', 'serious', 'critical']

const SEVERITY_COLOR: Record<string, { bg: string; text: string }> = {
  minor:    { bg: '#dcfce7', text: '#16a34a' },
  moderate: { bg: '#fef9c3', text: '#a16207' },
  serious:  { bg: '#fee2e2', text: '#dc2626' },
  critical: { bg: '#ede9fe', text: '#7c3aed' },
}

const INCIDENT_TYPES = [
  'Fighting', 'Bullying', 'Theft', 'Truancy', 'Insubordination',
  'Drug/Alcohol', 'Vandalism', 'Cheating', 'Harassment', 'Other',
]

const FORM_DEFAULT = {
  student_id: '', incident_type: 'Fighting', severity: 'minor',
  incident_date: new Date().toISOString().split('T')[0],
  description: '', action_taken: '', parent_notified: false,
}

export default function DisciplinePage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [students, setStudents] = useState<{ id: string; full_name: string; class_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [form, setForm] = useState(FORM_DEFAULT)

  useEffect(() => {
    loadIncidents()
    loadStudents()
  }, [])

  async function loadIncidents() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('discipline_records')
      .select('id, incident_type, severity, incident_date, description, action_taken, parent_notified, dean_reviewed, status, student_id, class_name, students(full_name)')
      .eq('school_id', SCHOOL_ID)
      .order('incident_date', { ascending: false })
      .limit(200)

    setIncidents((data ?? []).map((d: {
      id: string
      incident_type: string
      severity: string
      incident_date: string
      description: string | null
      action_taken: string | null
      parent_notified: boolean
      dean_reviewed: boolean
      status: string | null
      student_id: string
      class_name: string
      students: { full_name: string } | { full_name: string }[] | null
    }) => ({
      ...d,
      student_name: Array.isArray(d.students) ? (d.students[0]?.full_name ?? 'Unknown') : ((d.students as { full_name: string } | null)?.full_name ?? 'Unknown'),
    })))
    setLoading(false)
  }

  async function loadStudents() {
    const supabase = createClient()
    const { data } = await supabase
      .from('students')
      .select('id, full_name, class_name')
      .eq('school_id', SCHOOL_ID)
      .eq('is_active', true)
      .order('full_name')
    setStudents(data ?? [])
  }

  async function saveIncident() {
    if (!form.student_id) return showToast('Please select a student.')
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const student = students.find(s => s.id === form.student_id)

    const { error } = await supabase.from('discipline_records').insert({
      school_id: SCHOOL_ID,
      student_id: form.student_id,
      class_name: student?.class_name ?? '',
      incident_type: form.incident_type,
      severity: form.severity,
      incident_date: form.incident_date,
      description: form.description || null,
      action_taken: form.action_taken || null,
      parent_notified: form.parent_notified,
      logged_by: user?.id ?? '',
      logged_via: 'pwa',
      dean_reviewed: false,
      status: 'pending',
    })

    setSaving(false)
    if (error) return showToast('Error saving. Please try again.')
    showToast('Incident logged.')
    setShowModal(false)
    setForm(FORM_DEFAULT)
    loadIncidents()
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // Count students with 2+ incidents
  const studentCounts = incidents.reduce<Record<string, number>>((acc, i) => {
    acc[i.student_id] = (acc[i.student_id] ?? 0) + 1
    return acc
  }, {})
  const flaggedCount = Object.values(studentCounts).filter(c => c >= 2).length

  const filtered = incidents.filter(i => {
    const matchSeverity = severityFilter === 'all' ? true :
      severityFilter === 'flagged' ? (studentCounts[i.student_id] ?? 0) >= 2 :
      i.severity === severityFilter
    const matchSearch = !search || i.student_name.toLowerCase().includes(search.toLowerCase()) ||
      i.incident_type.toLowerCase().includes(search.toLowerCase()) ||
      i.class_name?.toLowerCase().includes(search.toLowerCase())
    return matchSeverity && matchSearch
  })

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 100,
          background: '#16a34a', color: 'white', padding: '10px 18px',
          borderRadius: 10, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>{toast}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
            Discipline Records
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            {incidents.length} incidents on record
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: 'var(--role-primary, #dc2626)', color: 'white',
            border: 'none', borderRadius: 10, padding: '10px 18px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >+ Log Incident</button>
      </div>

      {/* Flagged alert */}
      {flaggedCount > 0 && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 10,
          padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#92400e',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          ⚠️ <strong>{flaggedCount} student{flaggedCount > 1 ? 's' : ''}</strong> flagged with 2+ incidents this term
          <button
            onClick={() => setSeverityFilter('flagged')}
            style={{
              marginLeft: 'auto', background: '#f59e0b', color: 'white',
              border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
            }}
          >View Flagged</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search student, type, class..."
          style={{
            flex: 1, minWidth: 200, maxWidth: 300,
            border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 14px',
            fontSize: 13, outline: 'none', background: 'white',
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[...SEVERITIES, 'flagged'].map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: severityFilter === s ? 'none' : '1px solid #e5e7eb',
                background: severityFilter === s ? 'var(--role-primary, #dc2626)' : 'white',
                color: severityFilter === s ? 'white' : '#374151',
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >{s === 'flagged' ? '🚩 Flagged' : s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? <SkeletonTable rows={8} /> : (
        <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#6b7280', fontSize: 13 }}>
              No incidents match your filters.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Student', 'Incident Type', 'Severity', 'Date', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(inc => {
                  const sc = SEVERITY_COLOR[inc.severity] ?? { bg: '#f3f4f6', text: '#374151' }
                  const isFlagged = (studentCounts[inc.student_id] ?? 0) >= 2
                  return (
                    <tr key={inc.id} style={{ borderBottom: '1px solid #f9fafb' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#111827' }}>
                          {inc.student_name}
                          {isFlagged && <span style={{ marginLeft: 6, fontSize: 11 }}>🚩</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{inc.class_name}</div>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#374151' }}>{inc.incident_type}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                          fontSize: 11, fontWeight: 600,
                          background: sc.bg, color: sc.text, textTransform: 'capitalize',
                        }}>{inc.severity}</span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#6b7280' }}>{formatDate(inc.incident_date)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                            background: inc.dean_reviewed ? '#dcfce7' : '#fef3c7',
                            color: inc.dean_reviewed ? '#16a34a' : '#a16207',
                          }}>{inc.dean_reviewed ? 'Reviewed' : 'Pending'}</span>
                          {inc.parent_notified && (
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#eff6ff', color: '#1d4ed8' }}>
                              Parent ✓
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Log Incident Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560,
            padding: 24, maxHeight: '85vh', overflowY: 'auto',
            animation: 'fadeSlideUp 0.3s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
                Log Discipline Incident
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Student *</label>
                <select
                  value={form.student_id}
                  onChange={e => setForm({ ...form, student_id: e.target.value })}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}
                >
                  <option value="">Select student...</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.full_name} — {s.class_name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Incident Type</label>
                  <select
                    value={form.incident_type}
                    onChange={e => setForm({ ...form, incident_type: e.target.value })}
                    style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}
                  >
                    {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Severity</label>
                  <select
                    value={form.severity}
                    onChange={e => setForm({ ...form, severity: e.target.value })}
                    style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}
                  >
                    {SEVERITIES.filter(s => s !== 'all').map(s => (
                      <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Incident Date</label>
                <input
                  type="date"
                  value={form.incident_date}
                  onChange={e => setForm({ ...form, incident_date: e.target.value })}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe what happened..."
                  rows={3}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: 13, resize: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Action Taken</label>
                <textarea
                  value={form.action_taken}
                  onChange={e => setForm({ ...form, action_taken: e.target.value })}
                  placeholder="What action was taken..."
                  rows={2}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: 13, resize: 'none' }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={form.parent_notified}
                  onChange={e => setForm({ ...form, parent_notified: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ color: '#374151', fontWeight: 500 }}>Parent / Guardian notified</span>
              </label>

              <button
                onClick={saveIncident}
                disabled={saving}
                style={{
                  width: '100%', padding: '12px', borderRadius: 12,
                  background: 'var(--role-primary, #dc2626)', color: 'white',
                  border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1,
                  fontFamily: 'Space Grotesk, sans-serif',
                }}
              >{saving ? 'Saving...' : 'Log Incident'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
