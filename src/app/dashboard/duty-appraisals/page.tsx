'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, SCHOOL_ID } from '@/lib/supabase'
import DutyGradingDashboard from '@/components/DutyGradingDashboard'

interface StaffRow { id: string; full_name: string; sub_role: string }

interface DutyAssignment {
  id: string
  teacher_id: string
  duty_date: string
  duty_type: string
  time_slot: string | null
  post: string | null
  remarks: string | null
  staff_records: { full_name: string } | null
}

const DUTY_TYPES = ['morning','gate','dining','prep','games','evening','weekend','patrol','other']

export default function DutyAppraisalsPage() {
  const [staffId, setStaffId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'appraisals' | 'assign'>('appraisals')
  const router = useRouter()

  useEffect(() => {
    async function fetchStaffId() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: staff } = await supabase
        .from('staff_records').select('id').eq('user_id', user.id).single()
      if (staff?.id) setStaffId(staff.id)
      setLoading(false)
    }
    fetchStaffId()
  }, [router])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#6b7280' }}>
        Loading…
      </div>
    )
  }

  if (!staffId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#dc2626' }}>
        Could not load staff profile.
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['appraisals', 'assign'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              background: tab === t ? '#16a34a' : '#f3f4f6',
              color: tab === t ? 'white' : '#374151',
            }}
          >
            {t === 'appraisals' ? '⭐ Duty Appraisals' : '📌 Assign Duties'}
          </button>
        ))}
      </div>

      {tab === 'appraisals' && (
        <DutyGradingDashboard schoolId={SCHOOL_ID} appraiserId={staffId} />
      )}

      {tab === 'assign' && (
        <DutyAssignPanel schoolId={SCHOOL_ID} />
      )}
    </div>
  )
}

function DutyAssignPanel({ schoolId }: { schoolId: string }) {
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [duties, setDuties] = useState<DutyAssignment[]>([])
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({
    teacher_id: '',
    duty_date: new Date().toISOString().split('T')[0],
    duty_type: 'morning',
    time_slot: '',
    post: '',
    remarks: '',
    notify_whatsapp: false,
  })

  useEffect(() => {
    loadStaff()
    loadDuties()
  }, [])

  async function loadStaff() {
    const { createClient: mkClient } = await import('@supabase/supabase-js')
    const sb = mkClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await sb
      .from('staff_records')
      .select('id, full_name, sub_role')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .not('sub_role', 'in', '(bursar,accountant,storekeeper,qaso)')
      .order('full_name')
    setStaff(data ?? [])
  }

  async function loadDuties() {
    const today = new Date().toISOString().split('T')[0]
    const future = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]
    const res = await fetch(`/api/duties?from=${today}&to=${future}`)
    if (res.ok) {
      const json = await res.json()
      setDuties(json.duties ?? [])
    }
  }

  async function assignDuty() {
    if (!form.teacher_id) return showToast('Select a teacher.')
    if (!form.duty_date)  return showToast('Pick a date.')
    setSaving(true)
    const res = await fetch('/api/duties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacher_id: form.teacher_id,
        duty_date: form.duty_date,
        duty_type: form.duty_type,
        time_slot: form.time_slot || null,
        post: form.post || null,
        remarks: form.remarks || null,
        notify_whatsapp: form.notify_whatsapp,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const e = await res.json()
      return showToast(e.error ?? 'Failed to assign duty.')
    }
    showToast('Duty assigned.')
    setForm(f => ({ ...f, teacher_id: '', time_slot: '', post: '', remarks: '', notify_whatsapp: false }))
    loadDuties()
  }

  async function removeDuty(id: string) {
    setDeletingId(id)
    await fetch(`/api/duties?id=${id}`, { method: 'DELETE' })
    setDeletingId(null)
    setDuties(prev => prev.filter(d => d.id !== id))
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const teacherName = (id: string) => staff.find(s => s.id === id)?.full_name ?? id

  return (
    <div>
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 50,
          background: '#16a34a', color: 'white', padding: '10px 18px',
          borderRadius: 10, fontSize: 13, fontWeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>{toast}</div>
      )}

      {/* Assignment form */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 16 }}>New duty assignment</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Teacher *</label>
            <select
              value={form.teacher_id}
              onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
            >
              <option value="">Select teacher…</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.full_name} ({s.sub_role?.replace(/_/g, ' ')})</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Duty date *</label>
            <input
              type="date" value={form.duty_date}
              onChange={e => setForm(f => ({ ...f, duty_date: e.target.value }))}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Duty type *</label>
            <select
              value={form.duty_type}
              onChange={e => setForm(f => ({ ...f, duty_type: e.target.value }))}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, textTransform: 'capitalize' }}
            >
              {DUTY_TYPES.map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Time slot</label>
            <input
              type="text" placeholder="e.g. 6:00 AM – 7:30 AM"
              value={form.time_slot}
              onChange={e => setForm(f => ({ ...f, time_slot: e.target.value }))}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Post / Location</label>
            <input
              type="text" placeholder="e.g. Main Gate, Block A"
              value={form.post}
              onChange={e => setForm(f => ({ ...f, post: e.target.value }))}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Remarks</label>
            <input
              type="text" placeholder="Optional notes"
              value={form.remarks}
              onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <input
            type="checkbox" id="notify_wa" checked={form.notify_whatsapp}
            onChange={e => setForm(f => ({ ...f, notify_whatsapp: e.target.checked }))}
          />
          <label htmlFor="notify_wa" style={{ fontSize: 13, color: '#374151' }}>
            Notify teacher via WhatsApp
          </label>
        </div>
        <button
          onClick={assignDuty} disabled={saving}
          style={{
            marginTop: 16, padding: '10px 24px', background: saving ? '#86efac' : '#16a34a',
            color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Assigning…' : 'Assign Duty'}
        </button>
      </div>

      {/* Upcoming assignments table */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0 }}>
            Upcoming duty assignments ({duties.length})
          </h2>
        </div>
        {duties.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            No duties assigned yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Date','Teacher','Type','Time slot','Post',''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11,
                    fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {duties.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 16px', color: '#374151', fontWeight: 500 }}>
                    {new Date(d.duty_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '10px 16px', color: '#111827' }}>
                    {d.staff_records?.full_name ?? teacherName(d.teacher_id)}
                  </td>
                  <td style={{ padding: '10px 16px', color: '#374151', textTransform: 'capitalize' }}>
                    {d.duty_type}
                  </td>
                  <td style={{ padding: '10px 16px', color: '#6b7280' }}>{d.time_slot ?? '—'}</td>
                  <td style={{ padding: '10px 16px', color: '#6b7280' }}>{d.post ?? '—'}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <button
                      onClick={() => removeDuty(d.id)}
                      disabled={deletingId === d.id}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
                    >
                      {deletingId === d.id ? '…' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
