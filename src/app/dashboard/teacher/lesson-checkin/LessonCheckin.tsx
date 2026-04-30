'use client'

// LessonCheckin — teacher QR attendance flow.
// States: loading → no_lesson | idle → scanning → checking_in → active | error
// Offline queue: failed check-ins are saved to IndexedDB (Dexie) and retried on reconnect.

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import Dexie, { type Table } from 'dexie'

const QRScanner = dynamic(() => import('./QRScanner'), { ssr: false })

// ── Offline queue ──────────────────────────────────────────────────────────────
interface QueuedCheckin {
  id?: number
  qr_token: string
  lat: number | null
  lng: number | null
  topic_covered: string
  queued_at: string
}

class CheckinDB extends Dexie {
  checkins!: Table<QueuedCheckin>
  constructor() {
    super('TeacherCheckinDB')
    this.version(1).stores({ checkins: '++id, queued_at' })
  }
}
const offlineDb = new CheckinDB()

// ── Types ──────────────────────────────────────────────────────────────────────
interface Lesson {
  entry_id: string
  class_name: string
  subject: string
  period_number: number
  start_time: string
  end_time: string
  room_name: string | null
  next_topic: string | null
}

interface Session {
  id: string
  session_status: 'pending' | 'checked_in' | 'missed' | 'completed' | 'overridden'
  checkin_time: string | null
}

type PageState = 'loading' | 'no_lesson' | 'idle' | 'scanning' | 'checking_in' | 'active' | 'error'

// ── Component ──────────────────────────────────────────────────────────────────
export default function LessonCheckin() {
  const [pageState, setPageState]     = useState<PageState>('loading')
  const [lesson, setLesson]           = useState<Lesson | null>(null)
  const [session, setSession]         = useState<Session | null>(null)
  const [errorMsg, setErrorMsg]       = useState('')
  const [topic, setTopic]             = useState('')
  const [checkoutNote, setCheckoutNote] = useState('')
  const [complianceScore, setComplianceScore] = useState<number | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const getGps = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      )
    })

  // ── Load current lesson ────────────────────────────────────────────────────
  const loadLesson = useCallback(async () => {
    setPageState('loading')
    try {
      const res  = await fetch('/api/timetable/current-lesson')
      const data = await res.json() as { lesson?: Lesson; session?: Session }
      if (data.lesson) {
        setLesson(data.lesson)
        setTopic(data.lesson.next_topic ?? '')
        if (data.session?.session_status === 'checked_in') {
          setSession(data.session)
          setPageState('active')
          startHeartbeat(data.session.id)
        } else {
          setPageState('idle')
        }
      } else {
        setPageState('no_lesson')
      }
    } catch {
      setPageState('error')
      setErrorMsg('Could not load timetable. Check your connection.')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadLesson()
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current) }
  }, [loadLesson])

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  const startHeartbeat = (sessionId: string) => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(async () => {
      const gps = await getGps()
      await fetch('/api/attendance/teacher-heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, lat: gps?.lat, lng: gps?.lng }),
      }).catch(() => {})
    }, 3 * 60 * 1000) // every 3 minutes
  }

  // ── QR scan result ─────────────────────────────────────────────────────────
  const handleScanResult = async (qrText: string) => {
    setPageState('checking_in')
    const gps = await getGps()

    // Extract JWT from URL or raw token
    let token = qrText
    try {
      const url = new URL(qrText)
      token = url.searchParams.get('token') ?? qrText
    } catch { /* raw JWT */ }

    const payload = { qr_token: token, lat: gps?.lat ?? null, lng: gps?.lng ?? null, topic_covered: topic }

    if (!navigator.onLine) {
      await offlineDb.checkins.add({ ...payload, queued_at: new Date().toISOString() })
      setErrorMsg('No internet — check-in queued and will retry when online.')
      setPageState('idle')
      return
    }

    try {
      const res  = await fetch('/api/attendance/teacher-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { session_id?: string; message?: string; error?: string; retryable?: boolean }

      if (!res.ok) {
        const retryable = data.retryable !== false
        setErrorMsg(data.message ?? data.error ?? 'Check-in failed')
        setPageState(retryable ? 'idle' : 'error')
        return
      }

      setSession({ id: data.session_id!, session_status: 'checked_in', checkin_time: new Date().toISOString() })
      setPageState('active')
      startHeartbeat(data.session_id!)
      setErrorMsg('')
    } catch {
      await offlineDb.checkins.add({ ...payload, queued_at: new Date().toISOString() })
      setErrorMsg('Network error — check-in queued.')
      setPageState('idle')
    }
  }

  // ── Retry offline queue when back online ───────────────────────────────────
  useEffect(() => {
    const flush = async () => {
      const queued = await offlineDb.checkins.toArray()
      for (const item of queued) {
        try {
          const res = await fetch('/api/attendance/teacher-checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qr_token: item.qr_token, lat: item.lat, lng: item.lng, topic_covered: item.topic_covered }),
          })
          if (res.ok && item.id != null) await offlineDb.checkins.delete(item.id)
        } catch { /* still offline */ }
      }
    }
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [])

  // ── Checkout ───────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (!session) return
    const gps = await getGps()
    const res = await fetch('/api/attendance/teacher-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id:    session.id,
        topic_covered: topic,
        notes:         checkoutNote,
        lat:           gps?.lat,
        lng:           gps?.lng,
      }),
    })
    const data = await res.json() as { compliance_score?: number }
    if (res.ok) {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      setComplianceScore(data.compliance_score ?? null)
      setPageState('no_lesson')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold text-gray-800 mb-4">Lesson Check-In</h1>

      {/* Loading */}
      {pageState === 'loading' && (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
        </div>
      )}

      {/* No lesson */}
      {pageState === 'no_lesson' && (
        <div className="text-center py-12">
          {complianceScore != null ? (
            <>
              <div className="text-5xl font-bold text-green-600 mb-2">{complianceScore}%</div>
              <p className="text-gray-600">Lesson compliance score</p>
            </>
          ) : (
            <p className="text-gray-500">No lesson scheduled right now.</p>
          )}
          <button
            onClick={loadLesson}
            className="mt-6 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm"
          >
            Refresh
          </button>
        </div>
      )}

      {/* Idle — show lesson card + scan button */}
      {(pageState === 'idle' || pageState === 'checking_in') && lesson && (
        <div>
          <div className="bg-white rounded-xl shadow p-4 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-gray-800">{lesson.subject}</p>
                <p className="text-sm text-gray-500">{lesson.class_name}</p>
              </div>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                Period {lesson.period_number}
              </span>
            </div>
            <div className="mt-2 text-sm text-gray-600 flex gap-4">
              <span>{lesson.start_time} – {lesson.end_time}</span>
              {lesson.room_name && <span>{lesson.room_name}</span>}
            </div>
            {lesson.next_topic && (
              <p className="mt-2 text-sm text-indigo-600 font-medium">{lesson.next_topic}</p>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">Topic to cover today</label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. Quadratic equations — completing the square"
            />
          </div>

          {errorMsg && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <button
            disabled={pageState === 'checking_in'}
            onClick={() => setPageState('scanning')}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-50"
          >
            {pageState === 'checking_in' ? 'Verifying…' : 'Scan Classroom QR'}
          </button>
        </div>
      )}

      {/* Scanning */}
      {pageState === 'scanning' && (
        <div>
          <QRScanner
            active
            onResult={handleScanResult}
            onError={err => { setErrorMsg(err); setPageState('idle') }}
          />
          <button
            onClick={() => setPageState('idle')}
            className="mt-4 w-full py-2 border border-gray-300 rounded-xl text-sm text-gray-600"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Active session */}
      {pageState === 'active' && lesson && session && (
        <div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <div>
              <p className="font-semibold text-green-800">Checked in</p>
              <p className="text-xs text-green-600">
                {session.checkin_time
                  ? new Date(session.checkin_time).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
                  : ''}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-4 mb-4">
            <p className="font-semibold text-gray-800">{lesson.subject} — {lesson.class_name}</p>
            <p className="text-sm text-gray-500 mt-1">{lesson.start_time} – {lesson.end_time}</p>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">Notes (optional)</label>
            <textarea
              value={checkoutNote}
              onChange={e => setCheckoutNote(e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Any notes for the HOD…"
            />
          </div>

          <button
            onClick={handleCheckout}
            className="w-full py-3 bg-gray-800 text-white rounded-xl font-semibold"
          >
            End Lesson
          </button>
        </div>
      )}

      {/* Error (non-retryable) */}
      {pageState === 'error' && (
        <div className="text-center py-12">
          <p className="text-red-600 font-medium mb-2">Check-in not allowed</p>
          <p className="text-sm text-gray-500 mb-6">{errorMsg}</p>
          <button onClick={loadLesson} className="px-4 py-2 border rounded-lg text-sm text-gray-700">
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
