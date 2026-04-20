'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface SubjectPerf {
  subject: string
  average: number
  count: number
}

interface SchemeRow {
  id: string
  teacher_id: string
  subject_name: string
  class_name: string
  status: string
  hod_comment: string | null
  created_at: string
}

interface RequisitionRow {
  id: string
  department: string
  title: string
  items: { name: string; qty: number; unit?: string }[]
  estimated_cost: number | null
  currency: string
  status: string
  academic_year: string | null
  term: number | null
  created_at: string
  notes: string | null
}

interface ComplianceRow {
  teacher_id: string
  teacherName: string
  compliance_score: number
  scheme_submitted: boolean
  lesson_plan_submitted: boolean
  record_of_work_current: boolean
}

interface StaffRow {
  id: string
  full_name: string
  department: string | null
  sub_role: string
}

interface OverviewData {
  department: string
  deptSubjects: string[]
  departmentPerformance: SubjectPerf[]
  pendingSchemes: SchemeRow[]
  allSchemes: SchemeRow[]
  teacherCompliance: ComplianceRow[]
  deptStaff: StaffRow[]
  labEquipmentNote: string | null
  currentTerm: string
  currentYear: string
}

// ── Sub-role to department label ───────────────────────────────────────────

const SUB_ROLE_LABELS: Record<string, string> = {
  hod_sciences:        'Sciences',
  hod_mathematics:     'Mathematics',
  hod_languages:       'Languages',
  hod_humanities:      'Humanities',
  hod_applied_sciences:'Applied Sciences',
  hod_games_sports:    'Games & Sports',
}

// ── Status pipeline ────────────────────────────────────────────────────────

const STATUS_STEPS = ['pending','approved','fulfilled','received','closed']

// ── UI primitives ──────────────────────────────────────────────────────────

function Shimmer({ h = 60 }: { h?: number }) {
  return (
    <div style={{
      height: h, borderRadius: 8, marginBottom: 8,
      background: 'linear-gradient(90deg,#e5e7eb 25%,#f3f4f6 50%,#e5e7eb 75%)',
      backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite',
    }} />
  )
}

function Badge({ label, color }: { label: string; color: 'green' | 'amber' | 'red' | 'blue' | 'gray' }) {
  const s: Record<string, React.CSSProperties> = {
    green: { background: '#d1fae5', color: '#065f46' },
    amber: { background: '#fef3c7', color: '#92400e' },
    red:   { background: '#fee2e2', color: '#991b1b' },
    blue:  { background: '#dbeafe', color: '#1e40af' },
    gray:  { background: '#f3f4f6', color: '#374151' },
  }
  return (
    <span style={{ ...s[color], padding: '2px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function Btn({ onClick, disabled, children, variant = 'primary' }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode; variant?: 'primary' | 'secondary'
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: variant === 'secondary'
          ? hover ? '#f3f4f6' : '#fff'
          : hover ? 'linear-gradient(135deg,#7c3aed,#6d28d9)' : 'linear-gradient(135deg,#8b5cf6,#7c3aed)',
        color: variant === 'secondary' ? '#374151' : '#fff',
        border: variant === 'secondary' ? '1px solid #d1d5db' : 'none',
        borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'all 0.15s',
      }}
    >{children}</button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24, marginBottom: 24 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 14 }}>{title}</h2>
      {children}
    </section>
  )
}

function StatusTracker({ status }: { status: string }) {
  const idx = STATUS_STEPS.indexOf(status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {STATUS_STEPS.map((step, i) => (
        <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 10, height: 10, borderRadius: 9999,
            background: i < idx ? '#10b981' : i === idx ? '#8b5cf6' : '#e5e7eb',
            border: i === idx ? '2px solid #7c3aed' : 'none',
          }} />
          {i < STATUS_STEPS.length - 1 && (
            <div style={{ width: 20, height: 2, background: i < idx ? '#10b981' : '#e5e7eb' }} />
          )}
        </div>
      ))}
      <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>{status}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function HodDashboard() {
  const [subRole, setSubRole]         = useState<string>('')
  const [overview, setOverview]       = useState<OverviewData | null>(null)
  const [loading, setLoading]         = useState(true)

  const [requisitions, setRequisitions] = useState<RequisitionRow[]>([])
  const [reqLoading, setReqLoading]   = useState(true)

  // Scheme reject modal
  const [rejectSchemeId, setRejectSchemeId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [schemeBusy, setSchemeBusy]   = useState<string | null>(null)

  // New requisition modal
  const [showReqModal, setShowReqModal] = useState(false)
  const [reqTitle, setReqTitle]       = useState('')
  const [reqItems, setReqItems]       = useState('')
  const [reqCost, setReqCost]         = useState('')
  const [reqNotes, setReqNotes]       = useState('')
  const [reqBusy, setReqBusy]         = useState(false)

  // ── Resolve sub_role ──────────────────────────────────────────────────────

  useEffect(() => {
    async function resolveSubRole() {
      const supabase = getSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('staff_records').select('sub_role').eq('user_id', user.id).single()
      setSubRole((data as { sub_role?: string } | null)?.sub_role ?? '')
    }
    resolveSubRole()
  }, [])

  // ── Fetch overview ────────────────────────────────────────────────────────

  const fetchOverview = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/hod/overview')
    if (res.ok) setOverview(await res.json())
    setLoading(false)
  }, [])

  const fetchRequisitions = useCallback(async () => {
    setReqLoading(true)
    const res = await fetch('/api/hod/requisitions')
    if (res.ok) { const j = await res.json(); setRequisitions(j.requisitions ?? []) }
    setReqLoading(false)
  }, [])

  useEffect(() => {
    if (!subRole) return
    fetchOverview()
    fetchRequisitions()
  }, [subRole, fetchOverview, fetchRequisitions])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleSchemeApprove = async (id: string) => {
    setSchemeBusy(id)
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('schemes_of_work_new').update({
      status: 'approved',
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
    }).eq('id', id)
    setSchemeBusy(null)
    fetchOverview()
  }

  const handleSchemeReject = async () => {
    if (!rejectSchemeId) return
    setSchemeBusy(rejectSchemeId)
    const supabase = getSupabaseClient()
    await supabase.from('schemes_of_work_new').update({
      status: 'rejected',
      hod_comment: rejectReason.trim() || 'Returned for revision',
    }).eq('id', rejectSchemeId)
    setSchemeBusy(null)
    setRejectSchemeId(null)
    setRejectReason('')
    fetchOverview()
  }

  const handleCreateRequisition = async () => {
    if (!reqTitle.trim() || !reqItems.trim()) return
    setReqBusy(true)
    let parsedItems: { name: string; qty: number }[] = []
    try {
      // Expect one item per line: "Name, qty"
      parsedItems = reqItems.trim().split('\n').map(line => {
        const parts = line.split(',')
        return { name: parts[0]?.trim() ?? line.trim(), qty: parseInt(parts[1]?.trim() ?? '1', 10) || 1 }
      })
    } catch {
      parsedItems = [{ name: reqItems.trim(), qty: 1 }]
    }
    await fetch('/api/hod/requisitions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: reqTitle.trim(),
        items: parsedItems,
        estimated_cost: reqCost ? parseFloat(reqCost) : undefined,
        notes: reqNotes.trim() || undefined,
      }),
    })
    setReqBusy(false)
    setShowReqModal(false)
    setReqTitle('')
    setReqItems('')
    setReqCost('')
    setReqNotes('')
    fetchRequisitions()
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const deptLabel = overview?.department ?? SUB_ROLE_LABELS[subRole] ?? 'Department'
  const isLabRole = subRole === 'hod_sciences' || subRole === 'hod_applied_sciences'

  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: '28px 20px', fontFamily: 'system-ui,sans-serif' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 4 }}>
          HOD Dashboard — {deptLabel}
        </h1>
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {overview && ` · Term ${overview.currentTerm} · ${overview.currentYear}`}
        </p>
      </div>

      {/* Department Performance */}
      <Section title="Department Performance — Subject Averages">
        {loading ? <Shimmer h={100} /> : (overview?.departmentPerformance ?? []).length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No performance data for this term.</p>
          : overview!.departmentPerformance.map(p => {
            const col = p.average >= 60 ? '#10b981' : p.average >= 40 ? '#f59e0b' : '#ef4444'
            return (
              <div key={p.subject} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{p.subject}</span>
                  <span style={{ fontSize: 13, color: col, fontWeight: 700 }}>{p.average}% <span style={{ color: '#9ca3af', fontWeight: 400 }}>({p.count} students)</span></span>
                </div>
                <div style={{ background: '#f3f4f6', borderRadius: 9999, height: 10 }}>
                  <div style={{ height: 10, borderRadius: 9999, width: `${p.average}%`, background: col, transition: 'width 0.4s' }} />
                </div>
              </div>
            )
          })
        }
      </Section>

      {/* Schemes Approval Queue */}
      <Section title="Schemes of Work — Pending Approval">
        {loading ? <Shimmer h={80} /> : (overview?.pendingSchemes ?? []).length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No schemes awaiting approval.</p>
          : overview!.pendingSchemes.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.subject_name} — {s.class_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Submitted {new Date(s.created_at).toLocaleDateString('en-GB')}</div>
                {s.hod_comment && <div style={{ fontSize: 11, color: '#b45309' }}>Previous comment: {s.hod_comment}</div>}
              </div>
              <Badge label="Submitted" color="amber" />
              <Btn onClick={() => handleSchemeApprove(s.id)} disabled={schemeBusy === s.id}>Approve</Btn>
              <Btn variant="secondary" onClick={() => { setRejectSchemeId(s.id); setRejectReason('') }} disabled={schemeBusy === s.id}>
                Reject
              </Btn>
            </div>
          ))
        }
      </Section>

      {/* Requisitions */}
      <Section title="Requisitions">
        <div style={{ marginBottom: 12 }}>
          <Btn onClick={() => setShowReqModal(true)}>+ New Requisition</Btn>
        </div>
        {reqLoading ? <Shimmer h={80} /> : requisitions.length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No requisitions yet.</p>
          : requisitions.map(r => (
            <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {r.academic_year && `${r.academic_year}`}{r.term && ` · Term ${r.term}`}
                    {r.estimated_cost && ` · Est: ${r.currency} ${r.estimated_cost.toLocaleString()}`}
                  </div>
                  {r.notes && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.notes}</div>}
                </div>
                <Badge
                  label={r.status}
                  color={r.status === 'approved' || r.status === 'received' ? 'green' : r.status === 'declined' ? 'red' : r.status === 'fulfilled' ? 'blue' : r.status === 'closed' ? 'gray' : 'amber'}
                />
              </div>
              <StatusTracker status={r.status} />
              {(r.items as { name: string; qty: number }[]).length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#374151' }}>
                  Items: {(r.items as { name: string; qty: number }[]).map(i => `${i.name} ×${i.qty}`).join(', ')}
                </div>
              )}
            </div>
          ))
        }
      </Section>

      {/* Teacher Compliance */}
      <Section title="My Teachers — Compliance Scores">
        {loading ? <Shimmer h={80} /> : (overview?.teacherCompliance ?? []).length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No compliance data available.</p>
          : overview!.teacherCompliance.map(c => {
            const pct = Math.round(c.compliance_score)
            const col = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
            const badge = pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red'
            return (
              <div key={c.teacher_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.teacherName}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {c.scheme_submitted && <Badge label="Scheme ✓" color="green" />}
                    {c.lesson_plan_submitted && <Badge label="Plan ✓" color="green" />}
                    {c.record_of_work_current && <Badge label="ROW ✓" color="green" />}
                    {!c.scheme_submitted && <Badge label="Scheme ✗" color="red" />}
                    {!c.lesson_plan_submitted && <Badge label="Plan ✗" color="red" />}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Badge label={`${pct}%`} color={badge as 'green' | 'amber' | 'red'} />
                  <div style={{ background: '#e5e7eb', borderRadius: 9999, height: 4, width: 80, marginTop: 4 }}>
                    <div style={{ height: 4, borderRadius: 9999, width: `${pct}%`, background: col }} />
                  </div>
                </div>
              </div>
            )
          })
        }
      </Section>

      {/* Lab Equipment Panel — sciences HODs only */}
      {isLabRole && (
        <Section title="Lab Equipment">
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 28 }}>🔬</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
                {overview?.labEquipmentNote ?? 'Request lab consumables and equipment via the Requisitions panel above.'}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                Use the <strong>New Requisition</strong> button to submit AIE forms for chemicals, glassware, and biological specimens.
                Principal and Admin Deputy will be notified for approval.
              </div>
              <div style={{ marginTop: 10 }}>
                <Btn onClick={() => setShowReqModal(true)}>+ Request Lab Items</Btn>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Reject Scheme Modal */}
      {rejectSchemeId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, marginTop: 0 }}>Reject Scheme — Add Reason</h3>
            <textarea
              value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Briefly explain what needs to be revised…"
              style={{ width: '100%', minHeight: 90, border: '1px solid #d1d5db', borderRadius: 8, padding: 10, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
              <Btn variant="secondary" onClick={() => setRejectSchemeId(null)}>Cancel</Btn>
              <Btn onClick={handleSchemeReject} disabled={schemeBusy === rejectSchemeId}>
                {schemeBusy === rejectSchemeId ? 'Rejecting…' : 'Confirm Reject'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* New Requisition Modal */}
      {showReqModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 480, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, marginTop: 0 }}>New Requisition</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                value={reqTitle} onChange={e => setReqTitle(e.target.value)}
                placeholder="Requisition title (e.g. Term 1 Lab Supplies)"
                style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
              />
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Items (one per line: Name, Qty)</label>
                <textarea
                  value={reqItems} onChange={e => setReqItems(e.target.value)}
                  placeholder={"Hydrochloric Acid, 5\nTest Tubes, 30\nBunsen Burners, 10"}
                  style={{ width: '100%', minHeight: 90, border: '1px solid #d1d5db', borderRadius: 8, padding: 10, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginTop: 4 }}
                />
              </div>
              <input
                type="number" value={reqCost} onChange={e => setReqCost(e.target.value)}
                placeholder="Estimated cost (KES)"
                style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
              />
              <input
                value={reqNotes} onChange={e => setReqNotes(e.target.value)}
                placeholder="Additional notes (optional)"
                style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <Btn variant="secondary" onClick={() => setShowReqModal(false)}>Cancel</Btn>
              <Btn onClick={handleCreateRequisition} disabled={reqBusy || !reqTitle.trim() || !reqItems.trim()}>
                {reqBusy ? 'Submitting…' : 'Submit Requisition'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
