'use client'

import { useState } from 'react'

const C = { surface: '#0f0f1e', border: 'rgba(99,102,241,0.18)', text: '#e2e8f0', muted: '#475569', accent: '#6366f1', accentL: '#818cf8', green: '#4ade80', red: '#f87171' }
const MONO = '"JetBrains Mono", monospace'

const COUNTIES = ['Baringo','Bomet','Bungoma','Busia','Elgeyo Marakwet','Embu','Garissa','Homa Bay','Isiolo','Kajiado','Kakamega','Kericho','Kiambu','Kilifi','Kirinyaga','Kisii','Kisumu','Kitui','Kwale','Laikipia','Lamu','Machakos','Makueni','Mandera','Marsabit','Meru','Migori','Mombasa','Murang\'a','Nairobi','Nakuru','Nandi','Narok','Nyamira','Nyandarua','Nyeri','Samburu','Siaya','Taita Taveta','Tana River','Tharaka Nithi','Trans Nzoia','Turkana','Uasin Gishu','Vihiga','Wajir','West Pokot']

type FormData = {
  name: string; county: string; sub_county: string; knec_code: string
  student_count: string; contact_name: string; contact_phone: string; contact_email: string
  admin_email: string; admin_password: string; subscription_days: string
}

const INIT: FormData = { name: '', county: '', sub_county: '', knec_code: '', student_count: '', contact_name: '', contact_phone: '', contact_email: '', admin_email: '', admin_password: '', subscription_days: '365' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  )
}

const INPUT_STYLE: React.CSSProperties = { width: '100%', background: '#07071180', border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, fontFamily: MONO, fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box' }

export default function OnboardPage() {
  const [form,    setForm]    = useState<FormData>(INIT)
  const [loading, setLoading] = useState(false)
  const [msg,     setMsg]     = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [created, setCreated] = useState<{ school_id: string; short_code: string } | null>(null)

  function set(k: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    setCreated(null)

    const r = await fetch('/api/super/schools', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name:              form.name.trim(),
        county:            form.county,
        sub_county:        form.sub_county,
        knec_code:         form.knec_code.trim(),
        student_count:     parseInt(form.student_count) || 0,
        contact_name:      form.contact_name.trim(),
        contact_phone:     form.contact_phone.trim(),
        contact_email:     form.contact_email.trim(),
        admin_email:       form.admin_email.trim().toLowerCase(),
        admin_password:    form.admin_password,
        subscription_days: parseInt(form.subscription_days) || 365,
      }),
    })

    const d = await r.json().catch(() => ({}))
    setLoading(false)

    if (r.ok) {
      setMsg({ type: 'ok', text: `School "${form.name}" created successfully!` })
      setCreated({ school_id: d.school_id, short_code: d.short_code })
      setForm(INIT)
    } else {
      setMsg({ type: 'err', text: d.error ?? 'Failed to create school' })
    }
  }

  return (
    <div style={{ fontFamily: MONO, color: C.text }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: C.accentL, margin: 0 }}>Onboard School</h1>
        <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0', letterSpacing: '0.1em' }}>CREATE NEW TENANT</p>
      </div>

      {msg && (
        <div style={{ background: msg.type === 'ok' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)', border: `1px solid ${msg.type === 'ok' ? C.green : C.red}30`, borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 12, color: msg.type === 'ok' ? C.green : C.red }}>
          {msg.text}
        </div>
      )}

      {created && (
        <div style={{ background: 'rgba(99,102,241,0.12)', border: `1px solid ${C.accent}30`, borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, letterSpacing: '0.1em' }}>CREATED TENANT</div>
          <div style={{ fontSize: 12, color: C.text }}>ID: <span style={{ color: C.accentL }}>{created.school_id}</span></div>
          <div style={{ fontSize: 12, color: C.text, marginTop: 4 }}>Short Code: <span style={{ color: C.accentL, fontWeight: 700, fontSize: 18 }}>{created.short_code}</span></div>
        </div>
      )}

      <form onSubmit={submit} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Field label="School Name *">
            <input required value={form.name} onChange={set('name')} style={INPUT_STYLE} placeholder="e.g. Nairobi Secondary School" />
          </Field>
          <Field label="County *">
            <select required value={form.county} onChange={set('county')} style={{ ...INPUT_STYLE }}>
              <option value="">Select county…</option>
              {COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Sub-County">
            <input value={form.sub_county} onChange={set('sub_county')} style={INPUT_STYLE} placeholder="Optional" />
          </Field>
          <Field label="KNEC Code">
            <input value={form.knec_code} onChange={set('knec_code')} style={INPUT_STYLE} placeholder="e.g. 12345678" />
          </Field>
          <Field label="Student Count *">
            <input required type="number" min="1" value={form.student_count} onChange={set('student_count')} style={INPUT_STYLE} placeholder="e.g. 1200" />
          </Field>
          <Field label="Subscription Days">
            <input type="number" min="1" max="730" value={form.subscription_days} onChange={set('subscription_days')} style={INPUT_STYLE} />
          </Field>
        </div>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>Contact Person</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <Field label="Name">
              <input value={form.contact_name} onChange={set('contact_name')} style={INPUT_STYLE} placeholder="Principal name" />
            </Field>
            <Field label="Phone">
              <input value={form.contact_phone} onChange={set('contact_phone')} style={INPUT_STYLE} placeholder="+254…" />
            </Field>
            <Field label="Email">
              <input type="email" value={form.contact_email} onChange={set('contact_email')} style={INPUT_STYLE} placeholder="principal@school.ac.ke" />
            </Field>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>Admin Login Credentials</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Admin Email *">
              <input required type="email" value={form.admin_email} onChange={set('admin_email')} style={INPUT_STYLE} placeholder="admin@school.ac.ke" />
            </Field>
            <Field label="Temporary Password *">
              <input required type="password" minLength={8} value={form.admin_password} onChange={set('admin_password')} style={INPUT_STYLE} placeholder="Min 8 chars" />
            </Field>
          </div>
        </div>

        <button type="submit" disabled={loading} style={{ padding: '11px 28px', borderRadius: 8, border: 'none', background: loading ? C.muted : C.accent, color: '#fff', fontFamily: MONO, fontWeight: 700, fontSize: 13, cursor: loading ? 'wait' : 'pointer', letterSpacing: '0.06em' }}>
          {loading ? 'CREATING…' : 'CREATE SCHOOL →'}
        </button>
      </form>
    </div>
  )
}
