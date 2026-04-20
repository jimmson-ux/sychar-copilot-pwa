'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { formatDate } from '@/lib/roles'

type GateTab = 'pending' | 'out' | 'history'
type GateStatus = 'Pending' | 'Approved' | 'Rejected' | 'Exited' | 'Returned'

interface GatePass {
  id: string
  student_id: string
  reason: string
  expected_return: string | null
  status: GateStatus
  requested_at: string
  approved_at: string | null
  exited_at: string | null
  returned_at: string | null
  approved_by: string | null
  requested_by_name: string
  students: { full_name: string; class_name: string } | null
}

interface Student {
  id: string
  full_name: string
  class_name: string
}

function elapsed(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

const STATUS_COLOR: Record<GateStatus, string> = {
  Pending: '#d97706', Approved: '#2176FF', Rejected: '#dc2626',
  Exited: '#7C3AED', Returned: '#16a34a',
}

export default function GatePassPage() {
  const [tab, setTab] = useState<GateTab>('pending')
  const [passes, setPasses] = useState<GatePass[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const [userId, setUserId] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [students, setStudents] = useState<Student[]>([])
  const [stuSearch, setStuSearch] = useState('')
  const [selStudent, setSelStudent] = useState<Student | null>(null)
  const [reason, setReason] = useState('')
  const [expectedReturn, setExpectedReturn] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data: staff } = await supabase
      .from('staff_records').select('sub_role, school_id').eq('user_id', user.id).single()
    if (!staff) return
    setUserRole(staff.sub_role)
    setSchoolId(staff.school_id)

    // Check feature flag
    const { data: school } = await supabase.from('schools').select('features').eq('id', staff.school_id).single()
    setFeatureEnabled(school?.features?.gate_pass ?? false)
    if (!school?.features?.gate_pass) { setLoading(false); return }

    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('gate_passes')
      .select('*, students(full_name, class_name)')
      .eq('school_id', staff.school_id)
      .gte('requested_at', `${today}T00:00:00`)
      .order('requested_at', { ascending: false })
    setPasses((data as unknown as GatePass[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!showNew || !schoolId) return
    const supabase = createClient()
    supabase.from('students').select('id, full_name, class_name')
      .eq('school_id', schoolId).eq('is_active', true).limit(500)
      .then(({ data }) => setStudents(data ?? []))
  }, [showNew, schoolId])

  async function approve(id: string) {
    const supabase = createClient()
    await supabase.from('gate_passes').update({ status: 'Approved', approved_at: new Date().toISOString(), approved_by: userId }).eq('id', id)
    load()
  }

  async function reject(id: string) {
    const supabase = createClient()
    await supabase.from('gate_passes').update({ status: 'Rejected' }).eq('id', id)
    load()
  }

  async function markExited(id: string) {
    const supabase = createClient()
    await supabase.from('gate_passes').update({ status: 'Exited', exited_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function markReturned(id: string) {
    const supabase = createClient()
    await supabase.from('gate_passes').update({ status: 'Returned', returned_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function submitNew() {
    if (!selStudent || !reason) return
    setSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase.from('gate_passes').insert({
      school_id: schoolId,
      student_id: selStudent.id,
      reason,
      expected_return: expectedReturn || null,
      status: 'Pending',
      requested_at: new Date().toISOString(),
      requested_by_name: 'Staff',
    })
    setSubmitting(false)
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setMsg({ ok: true, text: 'Gate pass request submitted' })
    setShowNew(false); setSelStudent(null); setReason(''); setExpectedReturn('')
    load()
  }

  if (featureEnabled === false) {
    return (
      <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{
          background: 'white', border: '2px dashed #e5e7eb', borderRadius: 20,
          padding: '40px 48px', textAlign: 'center', maxWidth: 400,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 8px', fontFamily: 'Space Grotesk, sans-serif' }}>
            Gate Pass — Add-on Required
          </h2>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>
            The Gate Pass module is a paid add-on. Contact Sychar to enable this feature for your school.
          </p>
        </div>
      </div>
    )
  }

  const pending = passes.filter(p => p.status === 'Pending')
  const out = passes.filter(p => p.status === 'Approved' || p.status === 'Exited')
  const history = passes.filter(p => p.status === 'Returned' || p.status === 'Rejected')

  const canApprove = ['principal', 'deputy_principal', 'dean_of_students'].includes(userRole)
  const filteredStu = stuSearch.trim()
    ? students.filter(s => s.full_name.toLowerCase().includes(stuSearch.toLowerCase()) || s.class_name.toLowerCase().includes(stuSearch.toLowerCase())).slice(0, 10)
    : []

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
            Gate Pass System
          </h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Today's gate pass activity</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{ background: '#0891b2', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
        >
          + New Pass
        </button>
      </div>

      {msg && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: msg.ok ? '#f0fdf4' : '#fef2f2', color: msg.ok ? '#16a34a' : '#dc2626', border: `1px solid ${msg.ok ? '#bbf7d0' : '#fecaca'}`, fontSize: 13 }}>
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f8fafc', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {([
          { key: 'pending', label: `Pending (${pending.length})` },
          { key: 'out', label: `Currently Out (${out.length})` },
          { key: 'history', label: "Today's History" },
        ] as { key: GateTab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: tab === t.key ? 'white' : 'transparent',
            color: tab === t.key ? '#111827' : '#6b7280',
            fontWeight: tab === t.key ? 600 : 400, fontSize: 13,
            boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>Loading...</div>
      ) : (
        <>
          {/* PENDING */}
          {tab === 'pending' && (
            pending.length === 0 ? (
              <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: 40, textAlign: 'center', color: '#6b7280' }}>No pending requests</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pending.map(p => (
                  <div key={p.id} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 14, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
                          {p.students?.full_name ?? '—'} <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>{p.students?.class_name}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#374151', marginBottom: 2 }}>{p.reason}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>Requested {elapsed(p.requested_at)} ago</div>
                      </div>
                      {canApprove && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => approve(p.id)} style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Approve</button>
                          <button onClick={() => reject(p.id)} style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Reject</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* CURRENTLY OUT */}
          {tab === 'out' && (
            out.length === 0 ? (
              <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: 40, textAlign: 'center', color: '#6b7280' }}>No students currently out</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {out.map(p => (
                  <div key={p.id} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 14, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', borderLeft: '4px solid #7C3AED' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
                          {p.students?.full_name ?? '—'} <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>{p.students?.class_name}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#374151', marginBottom: 2 }}>{p.reason}</div>
                        {p.exited_at && (
                          <div style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>Out for {elapsed(p.exited_at)}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {p.status === 'Approved' && !p.exited_at && (
                          <button onClick={() => markExited(p.id)} style={{ background: '#7C3AED', color: 'white', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Mark Exited</button>
                        )}
                        {p.exited_at && !p.returned_at && (
                          <button onClick={() => markReturned(p.id)} style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Mark Returned</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* HISTORY */}
          {tab === 'history' && (
            history.length === 0 ? (
              <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: 40, textAlign: 'center', color: '#6b7280' }}>No completed passes today</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.map(p => (
                  <div key={p.id} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[p.status], flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{p.students?.full_name ?? '—'} <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 12 }}>{p.students?.class_name}</span></div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{p.reason}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[p.status] }}>{p.status}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{formatDate(p.requested_at)}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* New Gate Pass modal */}
      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, width: '90%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 20px', fontFamily: 'Space Grotesk, sans-serif', fontSize: 18 }}>New Gate Pass Request</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Student</label>
                {selStudent ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid #2176FF', background: '#eff6ff' }}>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#111827' }}>{selStudent.full_name} <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 12 }}>{selStudent.class_name}</span></span>
                    <button onClick={() => setSelStudent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 18 }}>×</button>
                  </div>
                ) : (
                  <>
                    <input style={inp} placeholder="Search student name or class..." value={stuSearch} onChange={e => setStuSearch(e.target.value)} />
                    {filteredStu.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 10, maxHeight: 180, overflowY: 'auto' }}>
                        {filteredStu.map(s => (
                          <div key={s.id} onClick={() => { setSelStudent(s); setStuSearch('') }} style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                            <strong>{s.full_name}</strong> — {s.class_name}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Reason</label>
                <input style={inp} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for leaving school" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Expected Return Time (optional)</label>
                <input style={inp} type="datetime-local" value={expectedReturn} onChange={e => setExpectedReturn(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowNew(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button onClick={submitNew} disabled={submitting || !selStudent || !reason} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#0891b2', color: 'white', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 14, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
