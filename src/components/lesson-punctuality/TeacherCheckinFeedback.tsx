'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface CheckinResult {
  subject_name: string
  class_name: string
  stream_name: string
  period_number: number
  scheduled_time: string
  actual_time: string
  minutes_late: number
  punctuality_status: 'on_time' | 'slightly_late' | 'late' | 'very_late'
}

interface Props {
  result: CheckinResult | null
  onDismiss: () => void
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}

export default function TeacherCheckinFeedback({ result, onDismiss }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!result) return
    timerRef.current = setTimeout(onDismiss, 8000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [result, onDismiss])

  const config = result ? getConfig(result) : null

  return (
    <AnimatePresence>
      {result && config && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 260 }}
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000, width: '90%', maxWidth: 360,
          }}
        >
          <div style={{
            borderRadius: 16, padding: '16px 20px',
            background: config.bg, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            color: config.text, position: 'relative',
          }}>
            <button
              onClick={onDismiss}
              style={{
                position: 'absolute', top: 10, right: 12, background: 'none',
                border: 'none', cursor: 'pointer', color: config.text, fontSize: 18, opacity: 0.7, lineHeight: 1,
              }}
            >×</button>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{config.headline}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              {result.subject_name} · {result.class_name} {result.stream_name}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: config.sub ? 4 : 0 }}>
              Period {result.period_number} · {fmt(result.actual_time)}
            </div>
            {config.sub && (
              <div style={{ fontSize: 13, opacity: 0.75 }}>{config.sub}</div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function getConfig(r: CheckinResult) {
  const scheduled = r.scheduled_time ? fmt(r.scheduled_time) : '—'
  const actual    = fmt(r.actual_time)
  switch (r.punctuality_status) {
    case 'on_time':
      return {
        bg: 'linear-gradient(135deg, #16a34a, #15803d)',
        text: 'white',
        headline: '✅ Lesson Started — On Time',
        sub: "You're right on schedule! ⏱️",
      }
    case 'slightly_late':
      return {
        bg: 'linear-gradient(135deg, #d97706, #b45309)',
        text: 'white',
        headline: `🟡 ${r.minutes_late} Minute${r.minutes_late !== 1 ? 's' : ''} Late`,
        sub: `Scheduled: ${scheduled} · Actual: ${actual}`,
      }
    case 'late':
    case 'very_late':
      return {
        bg: 'linear-gradient(135deg, #dc2626, #b91c1c)',
        text: 'white',
        headline: `🔴 ${r.minutes_late} Minutes Late`,
        sub: 'This will affect your compliance score for today.',
      }
    default:
      return { bg: '#f8fafc', text: '#111827', headline: '✅ Checked In', sub: null }
  }
}
