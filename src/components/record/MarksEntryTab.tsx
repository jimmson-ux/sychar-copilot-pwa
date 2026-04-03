'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { getDB, saveMarkDraft, getCachedStudentsByClass, cacheStudents, addToSyncQueue } from '@/lib/db'

interface Student {
  id: string
  full_name: string
  admission_number: string
}

interface Mark {
  studentId: string
  score: string
}

interface MarksEntryTabProps {
  token: string
  className: string
  subjectName: string
  teacherId: string
  schoolId: string
}

const EXAM_TYPES = ['CAT', 'Opener', 'Mid-term', 'End-term', 'Mock']

export default function MarksEntryTab({ token, className, subjectName, teacherId, schoolId }: MarksEntryTabProps) {
  const [students, setStudents] = useState<Student[]>([])
  const [marks, setMarks] = useState<Record<string, string>>({})
  const [examType, setExamType] = useState('CAT')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Monitor online status
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

  // Load students
  useEffect(() => {
    if (!className) return
    setLoading(true)

    async function load() {
      // Try IndexedDB cache first
      try {
        const cached = await getCachedStudentsByClass(className)
        if (cached.length > 0) {
          setStudents(cached.map(s => ({ id: s.id, full_name: s.full_name, admission_number: s.admission_number })))
          setLoading(false)
        }
      } catch { /* ignore */ }

      // Fetch fresh from API
      try {
        const res = await fetch(`/api/teacher/students?token=${encodeURIComponent(token)}&className=${encodeURIComponent(className)}`)
        const data = await res.json()
        const fresh = data.students ?? []
        setStudents(fresh)

        // Cache for offline use
        await cacheStudents(fresh.map((s: Student) => ({
          id: s.id,
          full_name: s.full_name,
          admission_number: s.admission_number ?? '',
          class_name: className,
          stream_name: '',
          gender: '',
        })))
      } catch { /* use cached */ }

      setLoading(false)
    }

    load()
  }, [className, token])

  // Auto-save every 30 seconds
  const autoSave = useCallback(async () => {
    if (!hasChanges) return
    try {
      const db = await getDB()
      for (const [studentId, score] of Object.entries(marks)) {
        if (score !== '') {
          await db.put('marks_drafts', {
            id: `draft-${teacherId}-${studentId}-${examType}`,
            student_id: studentId,
            subject: subjectName,
            score: parseFloat(score) || 0,
            exam_type: examType,
            class_name: className,
            teacher_id: teacherId,
            created_at: new Date().toISOString(),
            synced: false,
          })
        }
      }
      setLastSaved(new Date())
      setHasChanges(false)
    } catch { /* ignore */ }
  }, [marks, hasChanges, teacherId, subjectName, examType, className])

  useEffect(() => {
    autoSaveRef.current = setInterval(autoSave, 30000)
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current) }
  }, [autoSave])

  function setMark(studentId: string, score: string) {
    setMarks(prev => ({ ...prev, [studentId]: score }))
    setHasChanges(true)
  }

  function markAllAbsent() {
    const absent: Record<string, string> = {}
    students.forEach(s => { absent[s.id] = '0' })
    setMarks(absent)
    setHasChanges(true)
  }

  async function handleSubmit() {
    setSaving(true)
    const entries = Object.entries(marks).filter(([, score]) => score !== '')

    if (entries.length === 0) {
      alert('Please enter at least one score')
      setSaving(false)
      return
    }

    const records = entries.map(([studentId, score]) => ({
      school_id: schoolId,
      student_id: studentId,
      subject: subjectName,
      score: parseFloat(score),
      max_score: 100,
      exam_type: examType,
      class_name: className,
      teacher_id: teacherId,
      created_at: new Date().toISOString(),
    }))

    if (isOnline) {
      try {
        const res = await fetch('/api/exam/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, records }),
        })
        if (res.ok) {
          setSaved(true)
          setMarks({})
          setHasChanges(false)
          setTimeout(() => setSaved(false), 3000)
        } else {
          throw new Error('Failed to save')
        }
      } catch {
        // Save to queue for later sync
        await addToSyncQueue('marks', records)
        setSaved(true)
        setMarks({})
        setTimeout(() => setSaved(false), 3000)
      }
    } else {
      // Offline: save to IndexedDB
      for (const record of records) {
        await saveMarkDraft({
          id: `draft-${record.student_id}-${Date.now()}`,
          student_id: record.student_id,
          subject: record.subject,
          score: record.score,
          exam_type: record.exam_type,
          class_name: record.class_name,
          teacher_id: record.teacher_id ?? '',
          created_at: record.created_at,
          synced: false,
        })
      }
      await addToSyncQueue('marks', records)
      setSaved(true)
      setMarks({})
      setTimeout(() => setSaved(false), 3000)
    }

    setSaving(false)
  }

  const filtered = students.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.admission_number && s.admission_number.toLowerCase().includes(search.toLowerCase()))
  )

  const markedCount = Object.values(marks).filter(v => v !== '').length

  return (
    <div>
      {/* Offline indicator */}
      {!isOnline && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 10,
          padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>📱</span>
          <span>Offline — marks saved locally, will sync when connected</span>
        </div>
      )}

      {/* Auto-save indicator */}
      {lastSaved && (
        <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
          Draft saved {Math.round((Date.now() - lastSaved.getTime()) / 60000)} min ago
        </p>
      )}

      {/* Exam type selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
          Exam Type
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {EXAM_TYPES.map(type => (
            <button
              key={type}
              onClick={() => setExamType(type)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: examType === type ? 'none' : '1px solid #e5e7eb',
                background: examType === type ? '#1e40af' : 'white',
                color: examType === type ? 'white' : '#374151',
                cursor: 'pointer',
              }}
            >{type}</button>
          ))}
        </div>
      </div>

      {/* Search + Bulk action */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search student..."
          style={{
            flex: 1, padding: '8px 12px', border: '1px solid #e5e7eb',
            borderRadius: 10, fontSize: 13, outline: 'none',
          }}
        />
        <button
          onClick={markAllAbsent}
          style={{
            padding: '8px 12px', fontSize: 12, fontWeight: 600,
            background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
            borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >Score all 0</button>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
          <span>Progress</span>
          <span>{markedCount}/{students.length} students marked</span>
        </div>
        <div style={{ background: '#f3f4f6', borderRadius: 4, height: 6 }}>
          <div style={{
            background: '#22c55e', borderRadius: 4, height: 6,
            width: students.length > 0 ? `${(markedCount / students.length) * 100}%` : '0%',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Students list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#6b7280' }}>Loading students...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 13 }}>
          {search ? 'No students match your search' : 'No students found for this class'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {filtered.map(student => (
            <div
              key={student.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: marks[student.id] ? '#f0fdf4' : 'white',
                border: `1px solid ${marks[student.id] ? '#bbf7d0' : '#e5e7eb'}`,
                borderRadius: 10, padding: '10px 14px',
              }}
            >
              {marks[student.id] && <span style={{ color: '#22c55e', fontSize: 16 }}>✓</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {student.full_name}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{student.admission_number}</div>
              </div>
              <input
                type="number"
                value={marks[student.id] ?? ''}
                onChange={e => setMark(student.id, e.target.value)}
                placeholder="—"
                min={0}
                max={100}
                style={{
                  width: 64, padding: '6px 10px', border: '1px solid #e5e7eb',
                  borderRadius: 8, fontSize: 14, fontWeight: 700, textAlign: 'center',
                  outline: 'none', background: 'white',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Success message */}
      {saved && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
          padding: '12px 16px', marginBottom: 16, textAlign: 'center',
          fontSize: 14, fontWeight: 600, color: '#16a34a',
        }}>
          ✓ Marks saved successfully{!isOnline ? ' (will sync when online)' : ''}
        </div>
      )}

      {/* Submit button */}
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
        {saving ? 'Saving...' : `Save Marks (${markedCount} students)`}
      </button>
    </div>
  )
}
