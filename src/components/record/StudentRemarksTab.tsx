'use client'
import { useState, useEffect } from 'react'

interface Student {
  id: string
  full_name: string
  admission_number: string
}

interface StudentRemarksTabProps {
  token: string
  className: string
  subjectName: string
  teacherId: string
  schoolId: string
  students: Student[]
}

const COMPETENCIES = [
  { key: 'communication', label: 'Communication' },
  { key: 'critical_thinking', label: 'Critical Thinking' },
  { key: 'creativity', label: 'Creativity' },
  { key: 'collaboration', label: 'Collaboration' },
  { key: 'character', label: 'Character' },
]

const QUICK_TAGS = [
  { value: 'positive', label: 'Positive', color: '#16a34a', bg: '#f0fdf4' },
  { value: 'excellent', label: 'Excellent', color: '#0891b2', bg: '#f0f9ff' },
  { value: 'needs_improvement', label: 'Needs Improvement', color: '#d97706', bg: '#fef9f0' },
]

export default function StudentRemarksTab({ token, className, subjectName, teacherId, schoolId, students }: StudentRemarksTabProps) {
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [competencies, setCompetencies] = useState<Record<string, number>>({})
  const [remarks, setRemarks] = useState('')
  const [quickTag, setQuickTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = students.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase())
  )

  function setCompetency(key: string, value: number) {
    setCompetencies(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (!selectedStudent) return
    setSaving(true)

    try {
      const body = {
        token,
        school_id: schoolId,
        student_id: selectedStudent.id,
        teacher_id: teacherId,
        class_name: className,
        subject: subjectName,
        competency_communication: competencies.communication ?? null,
        competency_critical_thinking: competencies.critical_thinking ?? null,
        competency_creativity: competencies.creativity ?? null,
        competency_collaboration: competencies.collaboration ?? null,
        competency_character: competencies.character ?? null,
        subject_remarks: remarks || null,
        quick_tag: quickTag || null,
      }

      const res = await fetch('/api/student-remarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setSaved(true)
        setCompetencies({})
        setRemarks('')
        setQuickTag('')
        setTimeout(() => setSaved(false), 3000)
      } else {
        alert('Failed to save remarks')
      }
    } catch {
      alert('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Student selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
          Select Student
        </label>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search student..."
          style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }}
        />
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          {filtered.slice(0, 10).map(s => (
            <button
              key={s.id}
              onClick={() => { setSelectedStudent(s); setSearch(s.full_name) }}
              style={{
                width: '100%', padding: '10px 14px', border: 'none', background: selectedStudent?.id === s.id ? '#f0f9ff' : 'white',
                borderBottom: '1px solid #f3f4f6', textAlign: 'left', cursor: 'pointer', fontSize: 13,
                color: selectedStudent?.id === s.id ? '#0891b2' : '#111827',
              }}
            >
              {s.full_name} <span style={{ color: '#9ca3af', fontSize: 11 }}>· {s.admission_number}</span>
            </button>
          ))}
        </div>
      </div>

      {selectedStudent && (
        <>
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0c4a6e' }}>{selectedStudent.full_name}</div>
            <div style={{ fontSize: 12, color: '#0369a1' }}>{className} · {subjectName}</div>
          </div>

          {/* Quick tags */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Quick Tag</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {QUICK_TAGS.map(tag => (
                <button
                  key={tag.value}
                  onClick={() => setQuickTag(quickTag === tag.value ? '' : tag.value)}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                    border: quickTag === tag.value ? 'none' : `1px solid ${tag.color}30`,
                    background: quickTag === tag.value ? tag.color : tag.bg,
                    color: quickTag === tag.value ? 'white' : tag.color,
                    cursor: 'pointer',
                  }}
                >{tag.label}</button>
              ))}
            </div>
          </div>

          {/* Competencies */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Competency Scores (1–5)
            </label>
            {COMPETENCIES.map(comp => (
              <div key={comp.key} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#374151' }}>{comp.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0891b2' }}>
                    {competencies[comp.key] ? `${competencies[comp.key]}/5` : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setCompetency(comp.key, n)}
                      style={{
                        flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                        border: competencies[comp.key] === n ? 'none' : '1px solid #e5e7eb',
                        background: competencies[comp.key] === n ? '#0891b2' : 'white',
                        color: competencies[comp.key] === n ? 'white' : '#6b7280',
                        cursor: 'pointer',
                      }}
                    >{n}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Remarks */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Subject Remarks <span style={{ fontWeight: 400, color: '#9ca3af' }}>(max 300 chars)</span>
            </label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value.slice(0, 300))}
              placeholder="Teacher's remarks about this student..."
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
                borderRadius: 10, fontSize: 13, resize: 'none', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right' }}>{remarks.length}/300</div>
          </div>

          {saved && (
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
              padding: '12px', marginBottom: 12, textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#16a34a',
            }}>✓ Remarks saved successfully</div>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 700,
              background: '#1e40af', color: 'white', border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >{saving ? 'Saving...' : 'Save Remarks'}</button>
        </>
      )}

      {!selectedStudent && (
        <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af', fontSize: 13 }}>
          Select a student above to enter remarks
        </div>
      )}
    </div>
  )
}
