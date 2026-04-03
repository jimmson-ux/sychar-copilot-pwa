'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { saveAttendanceDraft, getCachedStudentsByClass, addToSyncQueue } from '@/lib/db'

interface Student {
  id: string
  full_name: string
  admission_number: string
}

interface AttendanceTabProps {
  token: string
  className: string
  teacherId: string
  schoolId: string
}

type AttendanceStatus = 'present' | 'absent' | 'late' | null

export default function AttendanceTab({ token, className, teacherId, schoolId }: AttendanceTabProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({})
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if (!className) return
    setLoading(true)

    async function load() {
      try {
        const cached = await getCachedStudentsByClass(className)
        if (cached.length > 0) {
          setStudents(cached.map(s => ({ id: s.id, full_name: s.full_name, admission_number: s.admission_number })))
          setLoading(false)
        }
      } catch { /* ignore */ }

      try {
        const res = await fetch(`/api/teacher/students?token=${encodeURIComponent(token)}&className=${encodeURIComponent(className)}`)
        const data = await res.json()
        setStudents(data.students ?? [])
      } catch { /* use cached */ }

      setLoading(false)
    }

    load()
  }, [className, token])

  const autoSave = useCallback(async () => {
    if (Object.keys(attendance).length === 0) return
    try {
      for (const [studentId, status] of Object.entries(attendance)) {
        if (status) {
          await saveAttendanceDraft({
            id: `draft-att-${teacherId}-${studentId}-${date}`,
            student_id: studentId,
            date,
            status,
            class_name: className,
            teacher_id: teacherId,
            synced: false,
          })
        }
      }
      setLastSaved(new Date())
    } catch { /* ignore */ }
  }, [attendance, teacherId, date, className])

  useEffect(() => {
    autoSaveRef.current = setInterval(autoSave, 30000)
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current) }
  }, [autoSave])

  function setStatus(studentId: string, status: AttendanceStatus) {
    setAttendance(prev => ({ ...prev, [studentId]: status }))
  }

  function markAllPresent() {
    const all: Record<string, AttendanceStatus> = {}
    students.forEach(s => { all[s.id] = 'present' })
    setAttendance(all)
  }

  async function handleSubmit() {
    setSaving(true)
    const records = Object.entries(attendance)
      .filter(([, status]) => status !== null)
      .map(([studentId, status]) => ({
        school_id: schoolId,
        student_id: studentId,
        date,
        status,
        class_name: className,
        teacher_id: teacherId,
      }))

    if (records.length === 0) {
      alert('Please mark attendance for at least one student')
      setSaving(false)
      return
    }

    await addToSyncQueue('attendance', records)

    if (isOnline) {
      try {
        const res = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, records }),
        })
        if (!res.ok) throw new Error('Failed')
      } catch {
        // Will sync later via queue
      }
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setSaving(false)
  }

  const presentCount = Object.values(attendance).filter(s => s === 'present').length
  const absentCount = Object.values(attendance).filter(s => s === 'absent').length
  const lateCount = Object.values(attendance).filter(s => s === 'late').length
  const markedCount = Object.values(attendance).filter(Boolean).length

  return (
    <div>
      {!isOnline && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 10,
          padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>📱</span>
          <span>Offline — attendance saved locally</span>
        </div>
      )}

      {/* Date selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none' }}
        />
      </div>

      {/* Stats row */}
      {markedCount > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{presentCount}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Present</div>
          </div>
          <div style={{ flex: 1, background: '#fff1f2', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{absentCount}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Absent</div>
          </div>
          <div style={{ flex: 1, background: '#fef9f0', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#d97706' }}>{lateCount}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>Late</div>
          </div>
        </div>
      )}

      {/* Bulk action */}
      <button
        onClick={markAllPresent}
        style={{
          width: '100%', padding: '10px', marginBottom: 16, borderRadius: 10,
          background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >Mark All Present</button>

      {lastSaved && (
        <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
          Draft saved {Math.round((Date.now() - lastSaved.getTime()) / 60000)} min ago
        </p>
      )}

      {/* Students list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#6b7280' }}>Loading students...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {students.map(student => {
            const status = attendance[student.id]
            return (
              <div
                key={student.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {student.full_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{student.admission_number}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {(['present', 'absent', 'late'] as AttendanceStatus[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setStatus(student.id, s)}
                      style={{
                        padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        border: status === s ? 'none' : '1px solid #e5e7eb',
                        background: status === s
                          ? s === 'present' ? '#16a34a' : s === 'absent' ? '#dc2626' : '#d97706'
                          : 'white',
                        color: status === s ? 'white' : '#6b7280',
                        textTransform: 'capitalize',
                      }}
                    >{s === 'present' ? 'P' : s === 'absent' ? 'A' : 'L'}</button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {saved && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
          padding: '12px 16px', marginBottom: 16, textAlign: 'center',
          fontSize: 14, fontWeight: 600, color: '#16a34a',
        }}>
          ✓ Attendance saved{!isOnline ? ' (will sync when online)' : ''}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={saving || markedCount === 0}
        style={{
          width: '100%', padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 700,
          background: markedCount > 0 ? '#1e40af' : '#d1d5db',
          color: markedCount > 0 ? 'white' : '#9ca3af',
          border: 'none', cursor: markedCount > 0 ? 'pointer' : 'not-allowed',
        }}
      >
        {saving ? 'Saving...' : `Submit Attendance (${markedCount}/${students.length})`}
      </button>
    </div>
  )
}
