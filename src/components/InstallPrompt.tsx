'use client'
import { useState, useEffect } from 'react'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    const visits = parseInt(localStorage.getItem('sychar_visits') || '0') + 1
    localStorage.setItem('sychar_visits', visits.toString())

    const dismissed = localStorage.getItem('sychar_install_dismissed')
    const installed = localStorage.getItem('sychar_installed')

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> })
      if (visits >= 2 && !dismissed && !installed) {
        setShowBanner(true)
      }
    }

    if (visits >= 2 && !dismissed && !installed) {
      setShowBanner(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => {
      localStorage.setItem('sychar_installed', 'true')
      setShowBanner(false)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) {
      alert('To install: tap the Share button then "Add to Home Screen"')
      return
    }
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      localStorage.setItem('sychar_installed', 'true')
    }
    setShowBanner(false)
  }

  const handleDismiss = () => {
    localStorage.setItem('sychar_install_dismissed', 'true')
    setShowBanner(false)
  }

  if (!showBanner) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      width: 'calc(100% - 48px)',
      maxWidth: 480,
      background: 'white',
      borderRadius: 16,
      padding: '16px 20px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
      border: '1px solid #f1f5f9',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'linear-gradient(135deg, #1e40af, #22c55e)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'white', fontWeight: 700, fontSize: 20, flexShrink: 0,
      }}>S</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
          Install Sychar Copilot
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
          Add to home screen for quick access
        </div>
      </div>
      <button
        onClick={handleDismiss}
        style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 18, cursor: 'pointer', padding: 4, flexShrink: 0 }}
      >✕</button>
      <button
        onClick={handleInstall}
        style={{
          background: 'linear-gradient(135deg, #1e40af, #22c55e)',
          color: 'white', border: 'none', borderRadius: 10,
          padding: '8px 16px', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >Install</button>
    </div>
  )
}
