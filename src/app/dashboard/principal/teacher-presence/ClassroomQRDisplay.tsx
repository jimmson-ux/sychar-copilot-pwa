'use client'

// ClassroomQRDisplay — principal view of all teacher presence + room QR management.
// Two tabs: Live Presence (auto-refreshes every 30s) | Room QR Codes (generate/print).

import { useState, useEffect, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface TeacherPresence {
  teacher_id: string
  full_name: string
  initials: string | null
  total_lessons: number
  checked_in_count: number
  missed_count: number
  avg_compliance: number | null
  current_lesson: {
    class_name: string
    subject: string
    period_number: number
    start_time: string
    end_time: string
    room_name: string | null
    status: 'pending' | 'checked_in' | 'missed' | 'completed' | 'overridden'
    checkin_time: string | null
  } | null
  last_heartbeat: { timestamp: string; within_geofence: boolean } | null
}

interface PresenceSummary {
  total: number
  checked_in: number
  missed: number
  no_lesson: number
}

interface RoomQR {
  id: string
  room_name: string
  qr_url: string
}

const STATUS_COLORS: Record<string, string> = {
  checked_in: 'bg-green-100 text-green-800',
  missed:     'bg-red-100 text-red-800',
  completed:  'bg-blue-100 text-blue-800',
  overridden: 'bg-yellow-100 text-yellow-800',
  pending:    'bg-gray-100 text-gray-600',
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ClassroomQRDisplay() {
  const [tab, setTab]           = useState<'presence' | 'rooms'>('presence')
  const [presence, setPresence] = useState<TeacherPresence[]>([])
  const [summary, setSummary]   = useState<PresenceSummary | null>(null)
  const [rooms, setRooms]       = useState<RoomQR[]>([])
  const [loading, setLoading]   = useState(true)
  const [newRoom, setNewRoom]   = useState('')
  const [creating, setCreating] = useState(false)
  const [overrideModal, setOverrideModal] = useState<{
    teacher_id: string
    full_name: string
    timetable_entry_id?: string
  } | null>(null)
  const [overrideReason, setOverrideReason] = useState('')

  const loadPresence = useCallback(async () => {
    const res  = await fetch('/api/attendance/teacher-presence')
    const data = await res.json() as { presence?: TeacherPresence[]; summary?: PresenceSummary }
    if (res.ok) {
      setPresence(data.presence ?? [])
      setSummary(data.summary ?? null)
    }
    setLoading(false)
  }, [])

  const loadRooms = useCallback(async () => {
    const res  = await fetch('/api/timetable/room-qr')
    const data = await res.json() as { rooms?: RoomQR[] }
    if (res.ok) setRooms(data.rooms ?? [])
  }, [])

  useEffect(() => {
    loadPresence()
    loadRooms()
    const interval = setInterval(loadPresence, 30_000)
    return () => clearInterval(interval)
  }, [loadPresence, loadRooms])

  const createRoom = async () => {
    if (!newRoom.trim()) return
    setCreating(true)
    const res = await fetch('/api/timetable/room-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_name: newRoom.trim() }),
    })
    if (res.ok) {
      setNewRoom('')
      await loadRooms()
    }
    setCreating(false)
  }

  const submitOverride = async () => {
    if (!overrideModal || !overrideReason.trim()) return
    await fetch('/api/attendance/teacher-override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timetable_entry_id: overrideModal.timetable_entry_id,
        date:   new Date().toISOString().slice(0, 10),
        reason: overrideReason.trim(),
      }),
    })
    setOverrideModal(null)
    setOverrideReason('')
    await loadPresence()
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Teacher Attendance</h1>
        <button onClick={loadPresence} className="text-sm text-blue-600 hover:underline">
          Refresh
        </button>
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Total', value: summary.total, color: 'bg-gray-100 text-gray-800' },
            { label: 'Checked In', value: summary.checked_in, color: 'bg-green-100 text-green-800' },
            { label: 'Missed', value: summary.missed, color: 'bg-red-100 text-red-800' },
            { label: 'No Lesson', value: summary.no_lesson, color: 'bg-yellow-100 text-yellow-800' },
          ].map(s => (
            <div key={s.label} className={`rounded-lg p-3 text-center ${s.color}`}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        {(['presence', 'rooms'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'presence' ? 'Live Presence' : 'Room QR Codes'}
          </button>
        ))}
      </div>

      {/* ── Live Presence Tab ──────────────────────────────────────────────── */}
      {tab === 'presence' && (
        <div>
          {loading && (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          )}
          {!loading && presence.length === 0 && (
            <p className="text-center text-gray-500 py-8">No teaching staff found.</p>
          )}
          <div className="space-y-3">
            {presence.map(teacher => (
              <div key={teacher.teacher_id} className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                      {teacher.initials ?? teacher.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{teacher.full_name}</p>
                      <p className="text-xs text-gray-500">
                        {teacher.checked_in_count}/{teacher.total_lessons} lessons ·{' '}
                        {teacher.missed_count > 0 && (
                          <span className="text-red-600">{teacher.missed_count} missed</span>
                        )}
                        {teacher.avg_compliance != null && (
                          <span className="ml-1">{teacher.avg_compliance}% compliance</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {teacher.current_lesson && (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[teacher.current_lesson.status] ?? STATUS_COLORS.pending}`}>
                      {teacher.current_lesson.status.replace('_', ' ')}
                    </span>
                  )}
                </div>

                {teacher.current_lesson && (
                  <div className="mt-3 bg-gray-50 rounded-lg p-3 text-sm">
                    <p className="font-medium text-gray-700">
                      {teacher.current_lesson.subject} · {teacher.current_lesson.class_name}
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {teacher.current_lesson.start_time} – {teacher.current_lesson.end_time}
                      {teacher.current_lesson.room_name && ` · ${teacher.current_lesson.room_name}`}
                    </p>
                    {teacher.current_lesson.status === 'missed' && (
                      <button
                        onClick={() => setOverrideModal({
                          teacher_id: teacher.teacher_id,
                          full_name:  teacher.full_name,
                        })}
                        className="mt-2 text-xs text-orange-600 underline"
                      >
                        Mark as excused
                      </button>
                    )}
                  </div>
                )}

                {teacher.last_heartbeat && (
                  <p className="mt-2 text-xs text-gray-400">
                    Last ping{' '}
                    {new Date(teacher.last_heartbeat.timestamp).toLocaleTimeString('en-KE', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                    {' · '}
                    {teacher.last_heartbeat.within_geofence ? 'on campus' : 'off campus'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Room QR Tab ────────────────────────────────────────────────────── */}
      {tab === 'rooms' && (
        <div>
          <div className="flex gap-2 mb-4">
            <input
              value={newRoom}
              onChange={e => setNewRoom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createRoom()}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Room name, e.g. Science Lab 1"
            />
            <button
              disabled={creating || !newRoom.trim()}
              onClick={createRoom}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {creating ? '…' : 'Generate'}
            </button>
          </div>

          {rooms.length === 0 && (
            <p className="text-center text-gray-500 py-8 text-sm">
              No room QR codes yet. Enter a room name above to generate one.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {rooms.map(room => (
              <div key={room.id} className="bg-white rounded-xl border p-4 text-center">
                <p className="font-medium text-gray-800 mb-3">{room.room_name}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(room.qr_url)}&size=150x150`}
                  alt={`QR for ${room.room_name}`}
                  className="mx-auto rounded"
                  width={150}
                  height={150}
                />
                <a
                  href={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(room.qr_url)}&size=400x400`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-xs text-blue-600 hover:underline"
                >
                  Print / Download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Override Modal ─────────────────────────────────────────────────── */}
      {overrideModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5">
            <h2 className="font-semibold text-gray-800 mb-1">Excuse Absence</h2>
            <p className="text-sm text-gray-500 mb-3">{overrideModal.full_name}</p>
            <textarea
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Reason (e.g. Staff meeting, Off-sick, Games)"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setOverrideModal(null); setOverrideReason('') }}
                className="flex-1 py-2 border rounded-lg text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                disabled={!overrideReason.trim()}
                onClick={submitOverride}
                className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
