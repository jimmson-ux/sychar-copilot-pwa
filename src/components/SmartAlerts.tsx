'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Alert {
  id: string
  type: 'warning' | 'critical' | 'info'
  icon: string
  message: string
  link: string
  dismissible: boolean
  role?: string[]
}

interface SmartAlertsProps {
  userRole: string
  schoolId: string
}

export default function SmartAlerts({ userRole, schoolId }: SmartAlertsProps) {
  const router = useRouter()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    const savedDismissed = JSON.parse(localStorage.getItem('sychar_dismissed_alerts') || '[]')
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const valid = savedDismissed.filter((d: { id: string; at: number }) => d.at > cutoff).map((d: { id: string; at: number }) => d.id)
    setDismissed(new Set(valid))

    fetchAlerts()
  }, [schoolId, userRole])

  async function fetchAlerts() {
    try {
      const res = await fetch(`/api/dashboard/alerts?schoolId=${schoolId}&role=${userRole}`)
      if (!res.ok) return
      const data = await res.json()
      setAlerts(data.alerts ?? [])
    } catch {
      // Network error — show no alerts
    }
  }

  function dismiss(id: string) {
    const savedDismissed = JSON.parse(localStorage.getItem('sychar_dismissed_alerts') || '[]')
    savedDismissed.push({ id, at: Date.now() })
    localStorage.setItem('sychar_dismissed_alerts', JSON.stringify(savedDismissed))
    setDismissed(prev => new Set([...prev, id]))
  }

  const visible = alerts.filter(a => !dismissed.has(a.id))
  const shown = expanded ? visible : visible.slice(0, 3)

  if (visible.length === 0) return null

  return (
    <div className="mb-6 space-y-2">
      {shown.map(alert => (
        <div
          key={alert.id}
          style={{
            background: alert.type === 'critical' ? '#fff1f2' : alert.type === 'warning' ? '#fef9f0' : '#f0f9ff',
            borderLeft: `4px solid ${alert.type === 'critical' ? '#ef4444' : alert.type === 'warning' ? '#f59e0b' : '#3b82f6'}`,
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 18, flexShrink: 0 }}>{alert.icon}</span>
          <p style={{ flex: 1, fontSize: 13, color: '#374151', margin: 0 }}>{alert.message}</p>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => router.push(alert.link)}
              style={{
                background: 'none', border: '1px solid #d1d5db',
                borderRadius: 8, padding: '4px 10px', fontSize: 11,
                cursor: 'pointer', color: '#374151', whiteSpace: 'nowrap',
              }}
            >View</button>
            {alert.dismissible && (
              <button
                onClick={() => dismiss(alert.id)}
                style={{
                  background: 'none', border: 'none', color: '#9ca3af',
                  fontSize: 16, cursor: 'pointer', padding: 2,
                }}
              >✕</button>
            )}
          </div>
        </div>
      ))}
      {visible.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none', border: 'none', color: '#6b7280',
            fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          {expanded ? 'Show less' : `View all ${visible.length} alerts`}
        </button>
      )}
    </div>
  )
}
