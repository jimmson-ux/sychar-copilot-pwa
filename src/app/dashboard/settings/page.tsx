'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSchoolId } from '@/hooks/useSchoolId'
import { useNotificationFeedback } from '@/hooks/useNotificationFeedback'
import type { FeedbackType } from '@/lib/notification-feedback'

// ── Security card: TOTP setup + push subscription ─────────────────────────────
function SecurityCard() {
  const [totpState,   setTotpState]   = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [qrUrl,       setQrUrl]       = useState<string | null>(null)
  const [totpSecret,  setTotpSecret]  = useState<string | null>(null)
  const [pushState,   setPushState]   = useState<'idle' | 'requesting' | 'done' | 'denied' | 'error'>('idle')

  async function setupTOTP() {
    setTotpState('loading')
    const r = await fetch('/api/auth/totp/setup', { method: 'POST' }).catch(() => null)
    if (!r || !r.ok) { setTotpState('error'); return }
    const d = await r.json() as { qrCodeUrl?: string; secret?: string }
    setQrUrl(d.qrCodeUrl ?? null)
    setTotpSecret(d.secret ?? null)
    setTotpState('done')
  }

  async function registerPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushState('error'); return
    }
    setPushState('requesting')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setPushState('denied'); return }

      const reg = await navigator.serviceWorker.ready
      const keyRes = await fetch('/api/auth/push/subscribe')
      const { vapidPublicKey } = await keyRes.json() as { vapidPublicKey: string }
      if (!vapidPublicKey) { setPushState('error'); return }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      const res = await fetch('/api/auth/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subscription: sub.toJSON() }),
      })
      setPushState(res.ok ? 'done' : 'error')
    } catch {
      setPushState('error')
    }
  }

  return (
    <div style={{ background: 'white', borderRadius: 18, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #fef9c3', background: '#fefce8' }}>
        <h2 style={{ fontWeight: 700, color: '#1f2937', margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🔒</span> Account Security
        </h2>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '3px 0 0' }}>
          Passwordless login methods — TOTP authenticator &amp; push approval
        </p>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* TOTP Section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>Authenticator App (TOTP)</p>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '3px 0 0' }}>
                Set up Google Authenticator or Authy for 2FA login.
              </p>
            </div>
            <button
              onClick={setupTOTP}
              disabled={totpState === 'loading'}
              style={{
                flexShrink: 0, padding: '8px 14px', border: 'none', borderRadius: 8,
                background: totpState === 'done' ? '#16a34a' : '#1e40af',
                color: 'white', fontSize: 12, fontWeight: 600, cursor: totpState === 'loading' ? 'not-allowed' : 'pointer',
                opacity: totpState === 'loading' ? 0.7 : 1,
              }}
            >
              {totpState === 'loading' ? 'Generating…'
                : totpState === 'done' ? '✓ Done'
                : 'Set Up TOTP'}
            </button>
          </div>

          {totpState === 'error' && (
            <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>Failed to generate TOTP. Please try again.</p>
          )}

          {totpState === 'done' && qrUrl && (
            <div style={{ marginTop: 14, padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e5e7eb' }}>
              <p style={{ fontSize: 12, color: '#374151', margin: '0 0 10px', fontWeight: 600 }}>
                Scan this QR code in Google Authenticator or Authy:
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`}
                alt="TOTP QR code"
                style={{ width: 180, height: 180, display: 'block', marginBottom: 10 }}
              />
              {totpSecret && (
                <div>
                  <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px' }}>Manual entry code:</p>
                  <code style={{ fontSize: 12, background: '#f3f4f6', padding: '4px 8px', borderRadius: 6, letterSpacing: 2, userSelect: 'all' }}>
                    {totpSecret}
                  </code>
                </div>
              )}
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 10, margin: '10px 0 0' }}>
                After scanning, test the code at <a href="/totp" style={{ color: '#1e40af' }}>/totp</a>. Your secret is now saved.
              </p>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid #f3f4f6' }} />

        {/* Push Section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>Magic Push Approval</p>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '3px 0 0' }}>
                Register this device to approve login requests from other devices via push notification.
              </p>
            </div>
            <button
              onClick={registerPush}
              disabled={pushState === 'requesting'}
              style={{
                flexShrink: 0, padding: '8px 14px', border: 'none', borderRadius: 8,
                background: pushState === 'done' ? '#16a34a' : pushState === 'denied' ? '#dc2626' : '#7c3aed',
                color: 'white', fontSize: 12, fontWeight: 600, cursor: pushState === 'requesting' ? 'not-allowed' : 'pointer',
                opacity: pushState === 'requesting' ? 0.7 : 1,
              }}
            >
              {pushState === 'requesting' ? 'Enabling…'
                : pushState === 'done'    ? '✓ Registered'
                : pushState === 'denied'  ? 'Permission denied'
                : 'Enable Push'}
            </button>
          </div>
          {pushState === 'denied' && (
            <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>
              Browser blocked notifications. Open browser settings to allow notifications for this site.
            </p>
          )}
          {pushState === 'error' && (
            <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>Failed to register. Ensure this device supports push notifications.</p>
          )}
          {pushState === 'done' && (
            <p style={{ fontSize: 12, color: '#16a34a', marginTop: 8 }}>
              ✓ This device will now receive login approval requests.
            </p>
          )}
        </div>

      </div>
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

interface WelfareSettings {
  shareWellnessNudgesWithParents: boolean
  welfareVisibleToDeanStudents: boolean
  welfareVisibleToGerald: boolean
}

function Toggle({
  enabled, onChange, label, description,
}: { enabled: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '16px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '3px 0 0' }}>{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        style={{
          position: 'relative', display: 'inline-flex', height: 24, width: 44,
          flexShrink: 0, borderRadius: 99, border: '2px solid transparent',
          background: enabled ? '#14b8a6' : '#d1d5db',
          cursor: 'pointer', transition: 'background 0.2s', outline: 'none',
        }}
        aria-pressed={enabled}
      >
        <span
          style={{
            display: 'inline-block', height: 20, width: 20, borderRadius: '50%',
            background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            transform: enabled ? 'translateX(20px)' : 'translateX(0)',
            transition: 'transform 0.2s',
            pointerEvents: 'none',
          }}
        />
      </button>
    </div>
  )
}

function InlineToggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      aria-pressed={enabled}
      style={{
        flexShrink: 0, position: 'relative', display: 'inline-flex',
        height: 24, width: 44, borderRadius: 99, border: '2px solid transparent',
        background: enabled ? '#14b8a6' : '#d1d5db',
        cursor: 'pointer', transition: 'background 0.2s', outline: 'none',
      }}
    >
      <span
        style={{
          display: 'inline-block', height: 20, width: 20, borderRadius: '50%',
          background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          transform: enabled ? 'translateX(20px)' : 'translateX(0)',
          transition: 'transform 0.2s', pointerEvents: 'none',
        }}
      />
    </button>
  )
}

function NotificationFeedbackCard() {
  const { settings, update, trigger } = useNotificationFeedback()
  const [testActive, setTestActive] = useState<FeedbackType | null>(null)

  function test(type: FeedbackType) {
    setTestActive(type)
    trigger(type)
    setTimeout(() => setTestActive(null), 1000)
  }

  const TEST_TYPES: { type: FeedbackType; label: string; color: string; bg: string }[] = [
    { type: 'critical',       label: 'Critical', color: '#ef4444', bg: '#fff1f2' },
    { type: 'warning',        label: 'Warning',  color: '#f59e0b', bg: '#fef9f0' },
    { type: 'info',           label: 'Info',     color: '#3b82f6', bg: '#eff6ff' },
    { type: 'message',        label: 'Message',  color: '#8b5cf6', bg: '#f5f3ff' },
    { type: 'login_approval', label: 'Login',    color: '#7c3aed', bg: '#ede9fe' },
    { type: 'success',        label: 'Success',  color: '#16a34a', bg: '#f0fdf4' },
  ]

  return (
    <div style={{ background: 'white', borderRadius: 18, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #eff6ff', background: '#eff6ff' }}>
        <h2 style={{ fontWeight: 700, color: '#1f2937', margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🔔</span> Alert Feedback
        </h2>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '3px 0 0' }}>
          Sound tones &amp; vibration for push alerts and in-app notifications
        </p>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Sound toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>Notification Sounds</p>
            <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>Distinct tones per alert severity via Web Audio</p>
          </div>
          <InlineToggle enabled={settings.soundEnabled} onChange={v => update({ soundEnabled: v })} />
        </div>

        {/* Volume */}
        {settings.soundEnabled && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#374151', margin: '0 0 8px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Volume</span>
              <span style={{ color: '#9ca3af', fontWeight: 400 }}>{Math.round(settings.volume * 100)}%</span>
            </p>
            <input
              type="range" min={0} max={1} step={0.05}
              value={settings.volume}
              onChange={e => update({ volume: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: '#1e40af', cursor: 'pointer' }}
            />
          </div>
        )}

        {/* Haptics toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>Haptic Vibration</p>
            <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>Vibration patterns on Android &amp; supported devices</p>
          </div>
          <InlineToggle enabled={settings.hapticEnabled} onChange={v => update({ hapticEnabled: v })} />
        </div>

        {/* Test buttons */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>
            Test Alert Types
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {TEST_TYPES.map(({ type, label, color, bg }) => (
              <button
                key={type}
                onClick={() => test(type)}
                style={{
                  padding: '7px 4px', border: `1.5px solid ${testActive === type ? color : '#e5e7eb'}`,
                  borderRadius: 8, background: testActive === type ? bg : 'white',
                  color: testActive === type ? color : '#6b7280',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s', transform: testActive === type ? 'scale(0.96)' : 'scale(1)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 11, color: '#b0b8c4', margin: 0, lineHeight: 1.5 }}>
          Sounds use the Web Audio API — no downloads needed. Haptics require a mobile device.
        </p>
      </div>
    </div>
  )
}

const QUICK_LINKS = [
  {
    href: '/dashboard/whatsapp-bot',
    icon: '💬',
    label: 'WhatsApp Bot',
    description: 'Parent messaging, fee queries & announcements',
  },
  {
    href: '/dashboard/qr-management',
    icon: '📲',
    label: 'QR Management',
    description: 'Student QR codes & access management',
  },
  {
    href: '/dashboard/duty-appraisals',
    icon: '📋',
    label: 'Duty Appraisals',
    description: 'Teacher duty tracking & performance appraisals',
  },
  {
    href: '/dashboard/staff',
    icon: '👥',
    label: 'Staff Directory',
    description: 'Browse all active staff by role & department',
  },
]

export default function SettingsPage() {
  const { schoolId } = useSchoolId()
  const [settings, setSettings] = useState<WelfareSettings>({
    shareWellnessNudgesWithParents: false,
    welfareVisibleToDeanStudents:   false,
    welfareVisibleToGerald:         false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/welfare/settings')
      .then(r => r.json())
      .then(d => {
        if (d.shareWellnessNudgesWithParents !== undefined) {
          setSettings({
            shareWellnessNudgesWithParents: d.shareWellnessNudgesWithParents,
            welfareVisibleToDeanStudents:   d.welfareVisibleToDeanStudents,
            welfareVisibleToGerald:         d.welfareVisibleToGerald,
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function saveSettings() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch('/api/welfare/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to save') }
      else { setSaved(true); setTimeout(() => setSaved(false), 3000) }
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '24px 28px', fontFamily: 'Space Grotesk, Inter, sans-serif', boxSizing: 'border-box' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>School-level configuration — Principal & Counsellor only</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
          <div style={{ width: 36, height: 36, border: '4px solid #e5e7eb', borderTopColor: '#14b8a6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,360px)', gap: 24, alignItems: 'start' }}>

          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* School Profile Card */}
            <div style={{ background: 'white', borderRadius: 18, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              {/* Gradient Header */}
              <div style={{ background: 'linear-gradient(135deg, #0d9488, #2563eb)', padding: '24px 24px 20px', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Logo placeholder */}
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', border: '3px solid rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 26, flexShrink: 0 }}>
                    N
                  </div>
                  <div>
                    <h2 style={{ color: 'white', fontWeight: 800, fontSize: 17, margin: 0, lineHeight: 1.3 }}>
                      Nkoroi Mixed Senior Secondary School
                    </h2>
                    <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, margin: '4px 0 0' }}>
                      Ongata Rongai, Kajiado County
                    </p>
                  </div>
                </div>
              </div>

              {/* Profile details */}
              <div style={{ padding: '20px 24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                  {[
                    { label: 'Type', value: 'Mixed Day Senior Secondary' },
                    { label: 'Academic Year', value: '2025/2026' },
                    { label: 'Total Students', value: '--' },
                    { label: 'Total Staff', value: '--' },
                  ].map(item => (
                    <div key={item.label} style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginTop: 3 }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* School ID */}
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>School ID</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 3, fontFamily: 'monospace', letterSpacing: '0.02em' }}>{schoolId || '—'}</div>
                </div>

                <a
                  href="https://wa.me/254700000000"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', padding: '9px 20px', border: '1.5px solid #0d9488', borderRadius: 10, color: '#0d9488', fontSize: 13, fontWeight: 600, textDecoration: 'none', transition: 'background 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#f0fdfa' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
                >
                  Contact Sychar
                </a>
              </div>
            </div>

            {/* Welfare & Wellness Card */}
            <div style={{ background: 'white', borderRadius: 18, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0fdf4', background: '#f0fdf4' }}>
                <h2 style={{ fontWeight: 700, color: '#1f2937', margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🩺</span> Welfare &amp; Wellness
                </h2>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '3px 0 0' }}>
                  Controls who can see welfare data and how parents are engaged
                </p>
              </div>

              <div style={{ padding: '4px 24px 8px' }}>
                <Toggle
                  enabled={settings.shareWellnessNudgesWithParents}
                  onChange={v => setSettings(s => ({ ...s, shareWellnessNudgesWithParents: v }))}
                  label="Send wellness nudges to parents via WhatsApp"
                  description="When enabled, parents receive gentle messages when their child's welfare score is elevated. No clinical details are shared."
                />
                <Toggle
                  enabled={settings.welfareVisibleToDeanStudents}
                  onChange={v => setSettings(s => ({ ...s, welfareVisibleToDeanStudents: v }))}
                  label="Allow Dean of Students to view welfare summary"
                  description="Dean sees only the welfare summary view (no raw notes, no WIS scores). Only activated when principal has flagged the student."
                />
                <div style={{ borderBottom: 'none' }}>
                  <Toggle
                    enabled={settings.welfareVisibleToGerald}
                    onChange={v => setSettings(s => ({ ...s, welfareVisibleToGerald: v }))}
                    label="Allow Deputy Principal (Discipline) access to flagged cases"
                    description="Deputy discipline can see welfare summary only for students principal has already flagged and action is underway."
                  />
                </div>
              </div>

              <div style={{ padding: '0 24px 20px' }}>
                {/* Privacy notice */}
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', margin: '0 0 6px' }}>Privacy Guarantee</p>
                  <ul style={{ margin: 0, padding: '0 0 0 14px', listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[
                      'Raw session notes are never shared outside the counsellor and principal',
                      'WIS scores, KBI tags, and clinical assessments are never sent to parents',
                      'The WhatsApp bot will never reveal welfare details — only general wellness messages',
                      'HODs, class teachers, and external parties have no access to welfare records',
                    ].map(item => (
                      <li key={item} style={{ fontSize: 11, color: '#1d4ed8' }}>{item}</li>
                    ))}
                  </ul>
                </div>

                {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</p>}
                {saved && <p style={{ color: '#16a34a', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Settings saved.</p>}

                <button
                  onClick={saveSettings}
                  disabled={saving}
                  style={{ width: '100%', padding: '11px 0', background: saving ? '#9ca3af' : '#111827', color: 'white', fontWeight: 700, fontSize: 14, border: 'none', borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#374151' }}
                  onMouseLeave={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#111827' }}
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
            {/* Security Card */}
            <SecurityCard />

          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Quick Links */}
            <div style={{ background: 'white', borderRadius: 18, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
                <h2 style={{ fontWeight: 700, color: '#1f2937', margin: 0, fontSize: 15 }}>Quick Links</h2>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '3px 0 0' }}>Jump to key sections of the system</p>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {QUICK_LINKS.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      borderRadius: 12, border: '1px solid #f1f5f9', textDecoration: 'none',
                      background: '#fafafa', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLAnchorElement
                      el.style.background = '#f0fdfa'
                      el.style.borderColor = '#99f6e4'
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLAnchorElement
                      el.style.background = '#fafafa'
                      el.style.borderColor = '#f1f5f9'
                    }}
                  >
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{link.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{link.label}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{link.description}</div>
                    </div>
                    <span style={{ color: '#9ca3af', fontSize: 16, flexShrink: 0 }}>→</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Notification Feedback Card */}
            <NotificationFeedbackCard />

            {/* Voice Bot Card */}
            <div style={{ background: 'white', borderRadius: 18, border: '2px dashed #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontWeight: 700, color: '#9ca3af', margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🔒</span> Voice Bot
                </h2>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>
                  Not activated
                </span>
              </div>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                  The Voice Bot handles incoming calls from parents — answering fee balance queries, attendance reports,
                  and school announcements automatically in Swahili via an interactive voice menu.
                </p>
                <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[
                    'Automatic call answering in Swahili',
                    'Fee balance & attendance queries via keypress menu',
                    'Broadcast voice announcements to all parent phones',
                    'Full call log in this dashboard',
                  ].map(item => (
                    <li key={item} style={{ fontSize: 12, color: '#9ca3af' }}>{item}</li>
                  ))}
                </ul>
                <a
                  href="https://wa.me/254700000000"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: 4, padding: '9px 16px', background: '#f3f4f6', color: '#4b5563', fontSize: 13, fontWeight: 600, borderRadius: 10, textDecoration: 'none', transition: 'background 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#e5e7eb' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#f3f4f6' }}
                >
                  Contact Sychar to activate
                </a>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
