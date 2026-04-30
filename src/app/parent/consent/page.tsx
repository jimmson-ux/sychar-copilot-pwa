'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const G  = '#16a34a'
const GL = '#15803d'

function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('parent_token')
}

export default function ConsentPage() {
  const router   = useRouter()
  const [agreed,   setAgreed]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [summary,  setSummary]  = useState('Loading consent information…')

  useEffect(() => {
    if (!getToken()) {
      router.replace('/parent')
      return
    }
    // Load consent summary from server
    fetch('/api/parent/consent', {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(d => {
        const consent = d as { hasConsent?: boolean }
        if (consent.hasConsent) {
          router.replace('/parent/dashboard')
        } else if (!consent.hasConsent) {
          setSummary(
            'We process your child\'s school data (marks, attendance, fees, discipline) to provide the Sychar Parent Portal. You may withdraw consent at any time by contacting privacy@sychar.co.ke. Your data is held only as long as you maintain consent. This processing is governed by the Kenya Data Protection Act 2019.'
          )
        }
      })
      .catch(() => setSummary('We process your child\'s school data to provide the Sychar Parent Portal.'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAccept() {
    const token = getToken()
    if (!token || !agreed) return
    setLoading(true)
    try {
      const res = await fetch('/api/parent/consent', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ version: 'v1.0' }),
      })
      if (res.ok) {
        router.replace('/parent/dashboard')
      } else {
        setLoading(false)
      }
    } catch {
      setLoading(false)
    }
  }

  async function handleDecline() {
    const token = getToken()
    if (token) {
      await fetch('/api/parent/consent/withdraw', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    localStorage.removeItem('parent_token')
    localStorage.removeItem('parent_school_id')
    localStorage.removeItem('parent_student_ids')
    router.replace('/parent')
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', background: '#f0fdf4' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: G, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 28 }}>🔒</span>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#14532d', margin: 0 }}>Data Processing Consent</h1>
          <p style={{ fontSize: 13, color: '#4b7a5e', margin: '4px 0 0' }}>Kenya Data Protection Act 2019</p>
        </div>

        <div style={{ background: 'white', borderRadius: 20, padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#166534', marginTop: 0, marginBottom: 12 }}>
            Sychar Parent Portal — v1.0
          </h2>

          <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, marginBottom: 20 }}>
            {summary}
          </p>

          {/* Checkbox */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 24 }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: 2, width: 18, height: 18, accentColor: G, flexShrink: 0 }}
            />
            <span style={{ fontSize: 14, color: '#374151' }}>
              I understand and agree to the processing of my child&apos;s school data as described above.
            </span>
          </label>

          <button
            onClick={handleAccept}
            disabled={!agreed || loading}
            style={{
              width: '100%', padding: '14px', marginBottom: 12,
              background: (!agreed || loading) ? '#86efac' : G,
              color: 'white', border: 'none', borderRadius: 12,
              fontSize: 16, fontWeight: 700,
              cursor: (!agreed || loading) ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Saving…' : 'Continue to Dashboard'}
          </button>

          <button
            onClick={handleDecline}
            style={{
              width: '100%', padding: '12px', background: 'transparent',
              color: '#6b7280', border: '1.5px solid #d1d5db',
              borderRadius: 12, fontSize: 14, cursor: 'pointer',
            }}
          >
            Decline &amp; Sign Out
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 16 }}>
          Questions? Email <span style={{ color: GL }}>privacy@sychar.co.ke</span>
        </p>
      </div>
    </div>
  )
}
