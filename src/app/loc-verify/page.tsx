'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import SycharLogo from '@/components/SycharLogo'

type Status = 'requesting' | 'sending' | 'success' | 'error' | 'expired'

function LocationVerifyContent() {
  const params = useSearchParams()
  const token = params.get('t')
  const [status, setStatus] = useState<Status>('requesting')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [distance, setDistance] = useState<number | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Invalid verification link.')
      return
    }

    if (!('geolocation' in navigator)) {
      setStatus('error')
      setMessage('Location not supported on this device. Please use a smartphone.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setStatus('sending')
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/verify-attendance-gps`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              },
              body: JSON.stringify({
                token,
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              }),
            }
          )
          const data = await res.json()

          if (data.success) {
            setStatus('success')
            setMessage(data.message)
            setName(data.name)
            setDistance(data.distance)
          } else {
            setStatus(data.error?.includes('expired') ? 'expired' : 'error')
            setMessage(data.error || 'Verification failed.')
          }
        } catch {
          setStatus('error')
          setMessage('Network error. Please check your connection.')
        }
      },
      (err) => {
        setStatus('error')
        setMessage(
          err.code === 1
            ? 'Location access denied. Please allow location and try again.'
            : 'Could not get your location. Please try again.'
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }, [token])

  const icons: Record<Status, string> = {
    requesting: '📍',
    sending: '⏳',
    success: '✅',
    error: '❌',
    expired: '⏰',
  }

  const titles: Record<Status, string> = {
    requesting: 'Getting your location...',
    sending: 'Confirming attendance...',
    success: `Welcome, ${name}!`,
    error: 'Verification failed',
    expired: 'Link expired',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #faf5ff 0%, #ede9fe 50%, #fce7f3 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <SycharLogo size={56} showWordmark={true} />

      <div style={{
        marginTop: 32,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(20px)',
        borderRadius: 20,
        padding: '32px 24px',
        textAlign: 'center',
        maxWidth: 340,
        width: '100%',
        border: '1px solid rgba(255,255,255,0.6)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>
          {icons[status]}
        </div>

        <h2 style={{
          fontSize: 20, fontWeight: 700,
          color: '#1e1b4b', marginBottom: 8,
        }}>
          {titles[status]}
        </h2>

        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
          {message || (status === 'requesting'
            ? 'Please allow location access when prompted.'
            : status === 'sending'
            ? 'Sending your coordinates to the school system...'
            : ''
          )}
        </p>

        {status === 'success' && distance !== null && (
          <div style={{
            marginTop: 16,
            padding: '10px 16px',
            background: distance <= 300
              ? 'rgba(34,197,94,0.1)'
              : 'rgba(245,158,11,0.1)',
            borderRadius: 12,
            fontSize: 13,
            color: distance <= 300 ? '#16a34a' : '#d97706',
            fontWeight: 500,
          }}>
            📏 {distance}m from school
          </div>
        )}

        {(status === 'error' || status === 'expired') && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 12, color: '#9ca3af' }}>
              SMS &quot;IN&quot; to your school AT number to get a new link
            </p>
          </div>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
        Nkoroi Mixed Day Senior Secondary School<br />
        Powered by Sychar Copilot
      </p>
    </div>
  )
}

export default function LocationVerifyPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #faf5ff 0%, #ede9fe 50%, #fce7f3 100%)',
      }}>
        <SycharLogo size={56} showWordmark={true} />
      </div>
    }>
      <LocationVerifyContent />
    </Suspense>
  )
}
