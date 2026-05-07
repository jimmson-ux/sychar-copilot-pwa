'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import StudentPicker, { StudentOption } from '@/components/StudentPicker'
import QRCode from 'react-qr-code'

interface ActivePass {
  id: string
  exit_code: string
  reason: string
  destination: string
  status: string
  exit_time: string
  expected_return: string | null
  actual_return: string | null
  late_alerted: boolean
  students: { full_name: string; class_name: string; admission_number: string | null; photo_url: string | null } | null
}

interface IssuedPass {
  passId: string
  exitCode: string
  exitTime: string
  expectedReturn: string
}

const PASS_TYPES = [
  { key: 'exeat',   icon: '🚶', label: 'Exeat',          desc: 'Parental leave' },
  { key: 'medical', icon: '🏥', label: 'Medical',         desc: 'Hospital / clinic' },
  { key: 'errand',  icon: '📦', label: 'School Errand',   desc: '' },
  { key: 'emergency',icon: '🚨', label: 'Emergency',      desc: '' },
]

const STATUS_BADGE: Record<string, { label: string; color: string; pulse?: boolean }> = {
  approved:    { label: 'Approved',          color: '#2176FF' },
  active:      { label: 'Out of School',     color: '#16a34a', pulse: true },
  overdue:     { label: '⚠️ OVERDUE',        color: '#dc2626', pulse: true },
  returned:    { label: 'Returned ✓',        color: '#9ca3af' },
  late_return: { label: 'Late Return',       color: '#d97706' },
}

function elapsed(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ${m % 60}m ago`
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-KE', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
}

function isOverdue(pass: ActivePass) {
  if (!pass.expected_return) return false
  return pass.status === 'active' && new Date(pass.expected_return) < new Date()
}

export default function GatePassForm({ schoolId, staffSubRole }: { schoolId: string; staffSubRole: string }) {
  const [step, setStep]           = useState<1 | 2 | 3>(1)
  const [student, setStudent]     = useState<StudentOption | null>(null)
  const [passType, setPassType]   = useState('exeat')
  const [destination, setDest]    = useState('')
  const [reason, setReason]       = useState('')
  const [exitDate, setExitDate]   = useState(new Date().toISOString().split('T')[0])
  const [exitTime, setExitTime]   = useState('')
  const [retDate, setRetDate]     = useState(new Date().toISOString().split('T')[0])
  const [retTime, setRetTime]     = useState('')
  const [submitting, setSubmit]   = useState(false)
  const [issued, setIssued]       = useState<IssuedPass | null>(null)
  const [passes, setPasses]       = useState<ActivePass[]>([])
  const [loadingP, setLoadingP]   = useState(true)
  const [err, setErr]             = useState('')
  const subRef = useRef(false)

  const canIssue = ['principal','deputy_principal','deputy_admin','dean','dean_of_studies','security'].includes(staffSubRole)

  useEffect(() => {
    if (!schoolId) return
    loadPasses()
    if (subRef.current) return
    subRef.current = true
    const sb = createClient()
    const ch = sb.channel('gate-passes-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_passes', filter: `school_id=eq.${schoolId}` }, () => loadPasses())
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [schoolId])

  async function loadPasses() {
    setLoadingP(true)
    const res = await fetch('/api/gate-passes?status=active,approved,overdue&date=today')
    if (res.ok) {
      const j = await res.json() as { passes?: ActivePass[]; data?: ActivePass[] }
      setPasses(j.passes ?? j.data ?? [])
    }
    setLoadingP(false)
  }

  function selectStudent(s: StudentOption) {
    setStudent(s)
    setStep(2)
  }

  async function submit() {
    if (!student || !destination.trim() || reason.length < 20) return
    setSubmit(true)
    setErr('')
    const expectedReturn = `${retDate}T${retTime || '17:00'}:00`
    const typeLabel = PASS_TYPES.find(p => p.key === passType)?.label ?? passType
    const res = await fetch('/api/gate-passes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: student.id,
        reason: `[${typeLabel}] ${reason.trim()}`,
        destination: destination.trim(),
        expectedReturn,
        notifyParent: true,
      }),
    })
    const j = await res.json() as { error?: string; passId?: string; exitCode?: string; exitTime?: string }
    setSubmit(false)
    if (!res.ok) { setErr(j.error ?? 'Failed to issue gate pass'); return }
    setIssued({ passId: j.passId ?? '', exitCode: j.exitCode ?? '', exitTime: j.exitTime ?? new Date().toISOString(), expectedReturn })
    setStep(3)
    loadPasses()
  }

  async function markReturn(id: string) {
    await fetch(`/api/gate-passes/${id}/return`, { method: 'PATCH' })
    loadPasses()
  }

  async function alertParent(id: string) {
    await fetch(`/api/gate-passes/${id}/notify-parent`, { method: 'POST' })
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <style>{`
        @keyframes pulse-ring { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @media print { .no-print{display:none!important} .print-only{display:block!important} }
        .print-only{display:none}
      `}</style>

      {/* ─── Gate Pass Form ─── */}
      {canIssue && (
        <div style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>
            Issue Gate Pass
          </h2>

          {/* STEP 1 */}
          <div style={{ marginBottom: step >= 1 ? 20 : 0 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              1. Student
            </label>
            <StudentPicker
              schoolId={schoolId}
              onSelect={selectStudent}
              placeholder="Search student by name or admission no..."
              disabled={step === 3}
            />
            {student && step >= 2 && (
              <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
                {student.photo_url
                  ? <img src={student.photo_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                  : <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>{student.full_name[0]}</div>
                }
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{student.full_name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {student.class_name} {student.stream_name} · {student.admission_no ?? student.admission_number ?? '—'} · {student.gender === 'male' ? 'M' : student.gender === 'female' ? 'F' : student.gender ?? ''}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2 */}
          {step >= 2 && step < 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  2. Pass Type
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                  {PASS_TYPES.map(pt => (
                    <label key={pt.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, border: `2px solid ${passType === pt.key ? '#0891b2' : '#e5e7eb'}`, cursor: 'pointer', background: passType === pt.key ? '#f0f9ff' : 'white', transition: 'all 0.15s' }}>
                      <input type="radio" name="passType" value={pt.key} checked={passType === pt.key} onChange={() => setPassType(pt.key)} style={{ display: 'none' }} />
                      <span style={{ fontSize: 18 }}>{pt.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: passType === pt.key ? '#0e7490' : '#374151' }}>{pt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Destination</label>
                <input style={inp} value={destination} onChange={e => setDest(e.target.value)} placeholder="Where are they going?" />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reason</label>
                <textarea
                  style={{ ...inp, resize: 'vertical', minHeight: 70 }}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Why are they leaving? (min 20 characters)"
                />
                {reason.length > 0 && reason.length < 20 && (
                  <div style={{ fontSize: 11, color: '#d97706', marginTop: 3 }}>{20 - reason.length} more characters needed</div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Exit Date</label>
                  <input style={inp} type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Exit Time</label>
                  <input style={inp} type="time" value={exitTime} onChange={e => setExitTime(e.target.value)} placeholder="Now" />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Expected Return Date</label>
                  <input style={inp} type="date" value={retDate} onChange={e => setRetDate(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Expected Return Time</label>
                  <input style={inp} type="time" value={retTime} onChange={e => setRetTime(e.target.value)} />
                </div>
              </div>

              {err && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13 }}>{err}</div>}

              <button
                onClick={submit}
                disabled={submitting || !destination.trim() || reason.length < 20}
                style={{
                  padding: '12px', borderRadius: 10, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #0891b2, #16a34a)', color: 'white',
                  fontWeight: 700, fontSize: 15, opacity: (submitting || !destination.trim() || reason.length < 20) ? 0.6 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {submitting ? 'Issuing...' : '🎫 Issue Gate Pass'}
              </button>
            </div>
          )}

          {/* STEP 3 — QR Card */}
          {step === 3 && issued && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 16, color: '#16a34a', fontWeight: 700, fontSize: 16 }}>✅ Gate Pass Issued</div>
              <div className="print-card" style={{ border: '2px solid #e5e7eb', borderRadius: 14, padding: 24, display: 'inline-block', minWidth: 240 }}>
                <div style={{ marginBottom: 16 }}>
                  <QRCode value={issued.exitCode} size={180} />
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, letterSpacing: 4, color: '#111827', marginBottom: 12 }}>
                  {issued.exitCode}
                </div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                  <div><strong>Student:</strong> {student?.full_name}</div>
                  <div><strong>Exit:</strong> {fmt(issued.exitTime)}</div>
                  <div><strong>Return:</strong> {fmt(issued.expectedReturn)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
                <button onClick={() => window.print()} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>🖨️ Print</button>
                <button onClick={() => fetch(`/api/gate-passes/${issued.passId}/notify-parent`, { method: 'POST' })} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#0891b2', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>📱 Send to Parent</button>
                <button onClick={() => { setStep(1); setStudent(null); setDest(''); setReason(''); setIssued(null) }} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 13 }}>New Pass</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Active Passes Table ─── */}
      <div className="no-print" style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>
          Active Passes Today
        </h2>
        {loadingP ? (
          <div style={{ color: '#9ca3af', textAlign: 'center', padding: 32, fontSize: 13 }}>Loading...</div>
        ) : passes.length === 0 ? (
          <div style={{ color: '#9ca3af', textAlign: 'center', padding: 32, fontSize: 13 }}>No active passes today</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Code', 'Student', 'Class', 'Exit', 'Destination', 'Exp. Return', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {passes.map(p => {
                  const odRaw = isOverdue(p)
                  const status = odRaw ? 'overdue' : p.status
                  const badge  = STATUS_BADGE[status] ?? { label: status, color: '#9ca3af' }
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{p.exit_code}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#111827' }}>{p.students?.full_name ?? '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#6b7280' }}>{p.students?.class_name ?? '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmt(p.exit_time)}</td>
                      <td style={{ padding: '10px 12px', color: '#374151', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.destination}</td>
                      <td style={{ padding: '10px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmt(p.expected_return)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          background: `${badge.color}18`, color: badge.color,
                        }}>
                          {badge.pulse && <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.color, animation: 'pulse-ring 1.5s ease-in-out infinite', display: 'inline-block' }} />}
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(p.status === 'active' || p.status === 'approved') && (
                            <button onClick={() => markReturn(p.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#16a34a', color: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Mark Return ✓</button>
                          )}
                          {odRaw && (
                            <button onClick={() => alertParent(p.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Alert Parent 🔔</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
