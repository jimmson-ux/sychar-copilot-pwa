'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface StaffOption { id: string; full_name: string; sub_role: string }

interface Visitor {
  id: string
  full_name: string | null
  visitor_name: string | null
  id_number: string | null
  phone: string | null
  purpose: string
  visitor_type: string
  company: string | null
  vehicle_reg: string | null
  expected_duration_minutes: number
  check_in_time: string
  check_out_time: string | null
  overstay_alerted: boolean
  banned: boolean
  ban_reason: string | null
  staff_records: { full_name: string } | null
}

const VISITOR_TYPES = ['parent', 'supplier', 'official', 'contractor', 'other']

function elapsed(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}

const BADGE: Record<string, { bg: string; color: string; label: string }> = {
  active:    { bg: '#dcfce7', color: '#15803d', label: 'On Premises' },
  checked_out: { bg: '#f1f5f9', color: '#475569', label: 'Checked Out' },
  overstay:  { bg: '#fef3c7', color: '#d97706', label: 'Overstay' },
  banned:    { bg: '#fee2e2', color: '#dc2626', label: 'Banned' },
}

function getStatus(v: Visitor): keyof typeof BADGE {
  if (v.banned)           return 'banned'
  if (v.check_out_time)   return 'checked_out'
  const elapsed_m = Math.floor((Date.now() - new Date(v.check_in_time).getTime()) / 60000)
  if (elapsed_m > v.expected_duration_minutes) return 'overstay'
  return 'active'
}

export default function VisitorLogPage() {
  const [tab, setTab]               = useState<'today' | 'checkin'>('today')
  const [visitors, setVisitors]     = useState<Visitor[]>([])
  const [staff, setStaff]           = useState<StaffOption[]>([])
  const [loading, setLoading]       = useState(true)
  const [role, setRole]             = useState('')
  const [actionId, setActionId]     = useState<string | null>(null)
  const [banModal, setBanModal]     = useState<{ id: string; name: string } | null>(null)
  const [banReason, setBanReason]   = useState('')
  const [toast, setToast]           = useState('')
  const [form, setForm] = useState({
    visitorName: '', idNumber: '', phone: '', purpose: '',
    hostStaffId: '', visitorType: 'other', company: '', vehicleReg: '',
    expectedDurationMinutes: 60,
  })
  const [saving, setSaving] = useState(false)

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const loadVisitors = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/visitors')
    if (r.ok) {
      const d = await r.json()
      setVisitors(d.visitors ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadVisitors()
    // Load role and staff list
    ;(async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: st } = await sb.from('staff_records').select('sub_role, school_id').eq('user_id', user.id).single()
      if (st) {
        setRole((st as { sub_role: string }).sub_role)
        const schoolId = (st as { school_id: string }).school_id
        const { data: staffList } = await sb
          .from('staff_records')
          .select('id, full_name, sub_role')
          .eq('school_id', schoolId)
          .eq('is_active', true)
          .order('full_name')
        setStaff((staffList ?? []) as StaffOption[])
      }
    })()
  }, [loadVisitors])

  async function checkout(id: string) {
    setActionId(id)
    const r = await fetch(`/api/visitors/${id}/checkout`, { method: 'PATCH' })
    setActionId(null)
    if (r.ok) {
      flash('Visitor checked out.')
      loadVisitors()
    } else {
      const e = await r.json()
      flash(e.error ?? 'Checkout failed.')
    }
  }

  async function banVisitor() {
    if (!banModal || !banReason.trim()) return
    setActionId(banModal.id)
    const r = await fetch(`/api/visitors/${banModal.id}/ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: banReason.trim() }),
    })
    setActionId(null)
    setBanModal(null)
    setBanReason('')
    if (r.ok) {
      flash('Visitor banned and flagged for future visits.')
      loadVisitors()
    } else {
      const e = await r.json()
      flash(e.error ?? 'Failed to ban visitor.')
    }
  }

  async function checkin() {
    if (!form.visitorName.trim() || !form.purpose.trim()) {
      return flash('Name and purpose are required.')
    }
    setSaving(true)
    const r = await fetch('/api/visitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorName:             form.visitorName.trim(),
        idNumber:                form.idNumber || undefined,
        phone:                   form.phone    || undefined,
        purpose:                 form.purpose.trim(),
        hostStaffId:             form.hostStaffId || undefined,
        visitorType:             form.visitorType,
        company:                 form.company  || undefined,
        vehicleReg:              form.vehicleReg || undefined,
        expectedDurationMinutes: form.expectedDurationMinutes,
      }),
    })
    setSaving(false)
    if (r.status === 403) {
      const e = await r.json()
      if (e.banned) return flash(`Visitor is BANNED: ${e.reason}`)
      return flash(e.error ?? 'Forbidden.')
    }
    if (!r.ok) {
      const e = await r.json()
      return flash(e.error ?? 'Check-in failed.')
    }
    flash('Visitor checked in successfully.')
    setForm({ visitorName: '', idNumber: '', phone: '', purpose: '', hostStaffId: '', visitorType: 'other', company: '', vehicleReg: '', expectedDurationMinutes: 60 })
    setTab('today')
    loadVisitors()
  }

  const active   = visitors.filter(v => !v.check_out_time && !v.banned).length
  const out      = visitors.filter(v => !!v.check_out_time).length
  const bannedCt = visitors.filter(v => v.banned).length

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui,sans-serif' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50, background: '#1e293b', color: 'white', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', maxWidth: 320 }}>{toast}</div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Visitor Log</h1>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
          {new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'On Premises', value: active, color: '#15803d', bg: '#dcfce7' },
          { label: 'Checked Out', value: out,    color: '#475569', bg: '#f1f5f9' },
          { label: 'Total Today', value: visitors.length, color: '#2176FF', bg: '#dbeafe' },
          { label: 'Banned',      value: bannedCt, color: '#dc2626', bg: '#fee2e2' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '14px 20px', flex: 1, minWidth: 110 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: s.color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {([['today', '📋 Today\'s Log'], ['checkin', '➕ Check In Visitor']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            background: tab === t ? '#2176FF' : '#f3f4f6',
            color:      tab === t ? 'white'   : '#374151',
          }}>{label}</button>
        ))}
        <button onClick={loadVisitors} style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', color: '#374151', cursor: 'pointer', fontSize: 12 }}>
          ↺ Refresh
        </button>
      </div>

      {tab === 'today' && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading visitors…</div>
          ) : visitors.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No visitors logged today.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Name', 'ID / Phone', 'Purpose', 'Host', 'Type', 'Check-in', 'Duration', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visitors.map(v => {
                  const status = getStatus(v)
                  const badge  = BADGE[status]
                  const name   = v.visitor_name ?? v.full_name ?? '—'
                  const isOut  = !!v.check_out_time
                  return (
                    <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '11px 14px', fontWeight: 600, color: '#111827' }}>
                        {name}
                        {v.company && <div style={{ fontSize: 11, color: '#6b7280' }}>{v.company}</div>}
                      </td>
                      <td style={{ padding: '11px 14px', color: '#374151' }}>
                        <div>{v.id_number ?? '—'}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{v.phone ?? ''}</div>
                      </td>
                      <td style={{ padding: '11px 14px', color: '#374151', maxWidth: 160 }}>{v.purpose}</td>
                      <td style={{ padding: '11px 14px', color: '#6b7280', fontSize: 12 }}>
                        {v.staff_records?.full_name ?? '—'}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, background: '#e0e7ff', color: '#3730a3', borderRadius: 12, padding: '2px 8px', fontWeight: 500, textTransform: 'capitalize' }}>
                          {v.visitor_type}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', color: '#374151', whiteSpace: 'nowrap' }}>
                        {fmtTime(v.check_in_time)}
                        {v.check_out_time && <div style={{ fontSize: 11, color: '#6b7280' }}>Out: {fmtTime(v.check_out_time)}</div>}
                      </td>
                      <td style={{ padding: '11px 14px', color: '#374151', whiteSpace: 'nowrap' }}>
                        {isOut ? '—' : elapsed(v.check_in_time)}
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>Allowed: {v.expected_duration_minutes}m</div>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, background: badge.bg, color: badge.color, borderRadius: 12, padding: '3px 9px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                        {!isOut && !v.banned && (
                          <button
                            onClick={() => checkout(v.id)}
                            disabled={actionId === v.id}
                            style={{ fontSize: 11, background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600, marginRight: 6 }}
                          >
                            {actionId === v.id ? '…' : 'Check Out'}
                          </button>
                        )}
                        {role === 'principal' && !v.banned && (
                          <button
                            onClick={() => setBanModal({ id: v.id, name })}
                            style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}
                          >
                            Ban
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'checkin' && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, maxWidth: 680 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginBottom: 20 }}>New Visitor Check-In</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { label: 'Full Name *', key: 'visitorName', placeholder: 'e.g. John Kamau', type: 'text' },
              { label: 'ID Number',   key: 'idNumber',    placeholder: 'National ID / Passport', type: 'text' },
              { label: 'Phone',       key: 'phone',       placeholder: '07XX XXX XXX', type: 'tel' },
              { label: 'Company / Organisation', key: 'company', placeholder: 'Optional', type: 'text' },
              { label: 'Vehicle Reg', key: 'vehicleReg',  placeholder: 'e.g. KCA 123A', type: 'text' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={(form as Record<string, string | number>)[f.key] as string}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            ))}

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Purpose of Visit *</label>
              <input
                type="text"
                placeholder="e.g. Deliver supplies, Meet HOD, Parent meeting"
                value={form.purpose}
                onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Visitor Type</label>
              <select
                value={form.visitorType}
                onChange={e => setForm(p => ({ ...p, visitorType: e.target.value }))}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
              >
                {VISITOR_TYPES.map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Expected Duration (minutes)</label>
              <input
                type="number" min={15} max={480} step={15}
                value={form.expectedDurationMinutes}
                onChange={e => setForm(p => ({ ...p, expectedDurationMinutes: parseInt(e.target.value) || 60 }))}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Host Staff Member</label>
              <select
                value={form.hostStaffId}
                onChange={e => setForm(p => ({ ...p, hostStaffId: e.target.value }))}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
              >
                <option value="">— No specific host —</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name} ({s.sub_role?.replace(/_/g, ' ')})</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={checkin}
            disabled={saving}
            style={{ marginTop: 20, padding: '11px 28px', background: saving ? '#86efac' : '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Checking in…' : 'Check In Visitor'}
          </button>
        </div>
      )}

      {/* Ban modal */}
      {banModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>Ban Visitor</h3>
            <p style={{ fontSize: 13, color: '#374151', marginBottom: 16 }}>
              This will permanently flag <strong>{banModal.name}</strong> and block future entries by phone/ID.
            </p>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Reason *</label>
            <textarea
              rows={3}
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
              placeholder="State reason for banning…"
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => { setBanModal(null); setBanReason('') }} style={{ padding: '9px 20px', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Cancel</button>
              <button onClick={banVisitor} disabled={!banReason.trim() || !!actionId} style={{ padding: '9px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {actionId ? 'Banning…' : 'Confirm Ban'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
