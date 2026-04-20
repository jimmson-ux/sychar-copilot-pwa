'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { detectCurriculum, getCurriculumLabels } from '@/lib/curriculumConfig'
import RecordOfWorkTab from '@/components/record/RecordOfWorkTab'
import DisciplineLogTab from '@/components/record/DisciplineLogTab'
import ExamPerformanceTab from '@/components/record/ExamPerformanceTab'
import SchemeOfWorkTab from '@/components/record/SchemeOfWorkTab'
import CounsellorForm from '@/components/record/CounsellorForm'
import MarksEntryTab from '@/components/record/MarksEntryTab'
import AttendanceTab from '@/components/record/AttendanceTab'
import StudentRemarksTab from '@/components/record/StudentRemarksTab'
import TimetableViewTab from '@/components/record/TimetableViewTab'
import DutiesTab from '@/components/record/DutiesTab'

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHOOL_ID = process.env.NEXT_PUBLIC_SCHOOL_ID!
const SESSION_KEY = 'sychar_teacher_session'
const SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeacherSession {
  staffId: string
  teacherName: string
  subjectName: string | null
  subRole: string | null
  departmentCode: string
  department: string
  colorPrimary: string
  colorSecondary: string
  isCounsellor: boolean
  token: string
  verifiedAt: number
}

interface Student {
  id: string
  full_name: string
  admission_number: string | null
  gender: string | null
}

type AppState = 'loading' | 'landing' | 'dept_qr' | 'counsellor_qr' | 'form'

interface DeptQrInfo {
  deptId: string
  department: string
  departmentCode: string
  subjects: string[]
  colorPrimary: string
  colorSecondary: string
}

type TabId = 'marks' | 'attendance' | 'row' | 'remarks' | 'discipline' | 'timetable' | 'duties' | 'scheme'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'marks',      label: 'Marks',       icon: '📝' },
  { id: 'attendance', label: 'Attend.',      icon: '✅' },
  { id: 'row',        label: 'Record',       icon: '📖' },
  { id: 'remarks',    label: 'Remarks',      icon: '💬' },
  { id: 'discipline', label: 'Discipline',   icon: '⚠️' },
  { id: 'timetable',  label: 'Timetable',    icon: '📅' },
  { id: 'duties',     label: 'Duties',       icon: '🔔' },
  { id: 'scheme',     label: 'Scheme',       icon: '📋' },
]

// ─── Session helpers ──────────────────────────────────────────────────────────

function loadSession(): TeacherSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as TeacherSession
    if (Date.now() - s.verifiedAt > SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return s
  } catch { return null }
}

function saveSession(s: TeacherSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s))
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export default function RecordPageWrapper() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#fff' }} />}>
      <RecordPage />
    </Suspense>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function RecordPage() {
  const searchParams = useSearchParams()
  const prefilledClass = searchParams.get('class') ?? ''
  const legacyToken    = searchParams.get('token') ?? ''
  const deptQrToken    = searchParams.get('dept') ?? ''

  const [appState, setAppState] = useState<AppState>('loading')
  const [session, setSession] = useState<TeacherSession | null>(null)
  const [deptQrInfo, setDeptQrInfo] = useState<DeptQrInfo | null>(null)
  const [activeClass, setActiveClass] = useState(prefilledClass)
  const [activeTab, setActiveTab] = useState<TabId>('marks')
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<string[]>([])

  // ── On mount: check localStorage session or QR dept token ──────────────────
  useEffect(() => {
    if (deptQrToken) {
      fetch(`/api/validate-token?dept=${encodeURIComponent(deptQrToken)}`)
        .then(r => r.json())
        .then(d => {
          if (!d.valid) { setAppState('landing'); return }
          if (d.mode === 'counsellor_qr') {
            setAppState('counsellor_qr')
            return
          }
          const saved = loadSession()
          if (saved && saved.departmentCode === d.departmentCode) {
            setSession(saved)
            setAppState('form')
          } else {
            setDeptQrInfo({
              deptId:         d.deptId,
              department:     d.department,
              departmentCode: d.departmentCode,
              subjects:       d.subjects ?? [],
              colorPrimary:   d.colorPrimary,
              colorSecondary: d.colorSecondary,
            })
            setAppState('dept_qr')
          }
        })
        .catch(() => setAppState('landing'))
      return
    }

    const saved = loadSession()
    if (saved) {
      setSession(saved)
      setAppState('form')
    } else {
      setAppState('landing')
    }
  }, [deptQrToken])

  // ── Load classes when session is set ────────────────────────────────────────
  useEffect(() => {
    if (!session || session.isCounsellor) return
    const tok = session.token || legacyToken
    fetch(`/api/teacher/classes?staffId=${encodeURIComponent(session.staffId)}&token=${encodeURIComponent(tok)}`)
      .then(r => r.json())
      .then(d => {
        const cls: string[] = d.classes ?? []
        setClasses(cls)
        if (!activeClass && cls.length > 0) setActiveClass(cls[0])
      })
      .catch(() => {})
  }, [session, activeClass, legacyToken])

  // ── Load students when class changes ────────────────────────────────────────
  useEffect(() => {
    if (!activeClass || !session || session.isCounsellor) return
    const activeToken = session.token || legacyToken
    fetch(`/api/teacher/students?token=${encodeURIComponent(activeToken)}&className=${encodeURIComponent(activeClass)}`)
      .then(r => r.json())
      .then(d => setStudents(d.students ?? []))
      .catch(() => setStudents([]))
  }, [activeClass, session, legacyToken])

  function handleVerified(s: TeacherSession) {
    saveSession(s)
    setSession(s)
    setAppState('form')
  }

  function handleSwitch() {
    clearSession()
    setSession(null)
    setClasses([])
    setStudents([])
    setActiveClass(prefilledClass)
    setAppState('landing')
  }

  if (appState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (appState === 'counsellor_qr') {
    return <CounsellorQrRedirect />
  }

  if (appState === 'dept_qr' && deptQrInfo) {
    return (
      <DeptQrLanding
        deptInfo={deptQrInfo}
        prefilledClass={prefilledClass}
        onVerified={handleVerified}
      />
    )
  }

  if (appState === 'landing') {
    return <LandingScreen onVerified={handleVerified} prefilledClass={prefilledClass} />
  }

  if (!session) return null

  // ── Counsellor view ─────────────────────────────────────────────────────────
  if (session.isCounsellor) {
    const gradient = `linear-gradient(135deg, ${session.colorPrimary}, ${session.colorSecondary})`
    return (
      <div className="min-h-screen bg-white text-gray-900">
        <div style={{ background: gradient }} className="px-5 pt-7 pb-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1 text-teal-100">
            Guidance & Counselling
          </p>
          <h1 className="text-2xl font-bold text-white mb-1">{session.teacherName}</h1>
          <p className="text-sm text-teal-100">Welfare Assessment Portal</p>
          <button onClick={handleSwitch} className="mt-2 text-xs text-teal-200 underline">
            Not you? Switch
          </button>
        </div>
        <div className="max-w-xl mx-auto px-4 py-5">
          <CounsellorForm counsellorId={session.staffId} schoolId={SCHOOL_ID} />
        </div>
      </div>
    )
  }

  // ── Teacher view ─────────────────────────────────────────────────────────────
  const curriculumType = detectCurriculum(activeClass)
  const labels = getCurriculumLabels(curriculumType)
  const gradient = `linear-gradient(135deg, ${session.colorPrimary}, ${session.colorSecondary})`
  const textColor = '#ffffff'
  const activeToken = session.token || legacyToken

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <div style={{ background: gradient }} className="px-5 pt-7 pb-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest mb-1"
           style={{ color: 'rgba(255,255,255,0.7)' }}>
          {session.department} · Teacher Portal
        </p>
        <h1 className="text-2xl font-bold mb-0.5" style={{ color: textColor }}>
          {session.subjectName ?? 'Teacher Portal'}
        </h1>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>{session.teacherName}</p>
        <button
          onClick={handleSwitch}
          className="mt-1.5 text-xs underline"
          style={{ color: 'rgba(255,255,255,0.6)' }}
        >
          Not you? Tap to switch
        </button>
      </div>

      {/* Class selector */}
      {classes.length > 1 && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Class</label>
          <div className="flex flex-wrap gap-2">
            {classes.map(cls => (
              <button
                key={cls}
                onClick={() => setActiveClass(cls)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  activeClass === cls
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                }`}
              >
                {cls}
              </button>
            ))}
          </div>
          {activeClass && (
            <p className="text-xs text-gray-400 mt-1.5">
              {curriculumType === 'CBC' ? 'CBC curriculum' : '8-4-4 curriculum'}
              {students.length > 0 && ` · ${students.length} students`}
            </p>
          )}
        </div>
      )}

      {/* Tabs — scrollable horizontal */}
      <div style={{ overflowX: 'auto', borderBottom: '1px solid #e5e7eb', background: 'white', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', minWidth: 'max-content' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 14px',
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                borderBottom: activeTab === tab.id ? `2px solid ${session.colorPrimary}` : '2px solid transparent',
                color: activeTab === tab.id ? session.colorPrimary : '#9ca3af',
                transition: 'color 0.15s',
                minWidth: 64,
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-xl mx-auto px-4 py-5">
        {activeTab === 'marks' && (
          <MarksEntryTab
            token={activeToken}
            className={activeClass}
            subjectName={session.subjectName ?? ''}
            teacherId={session.staffId}
            schoolId={SCHOOL_ID}
          />
        )}
        {activeTab === 'attendance' && (
          <AttendanceTab
            token={activeToken}
            className={activeClass}
            teacherId={session.staffId}
            schoolId={SCHOOL_ID}
          />
        )}
        {activeTab === 'row' && (
          <RecordOfWorkTab
            token={activeToken}
            className={activeClass}
            subjectName={session.subjectName ?? ''}
            labels={labels}
          />
        )}
        {activeTab === 'remarks' && (
          <StudentRemarksTab
            token={activeToken}
            className={activeClass}
            subjectName={session.subjectName ?? ''}
            teacherId={session.staffId}
            schoolId={SCHOOL_ID}
            students={students.map(s => ({
              id: s.id,
              full_name: s.full_name,
              admission_number: s.admission_number ?? '',
            }))}
          />
        )}
        {activeTab === 'discipline' && (
          <DisciplineLogTab
            token={activeToken}
            className={activeClass}
          />
        )}
        {activeTab === 'timetable' && (
          <TimetableViewTab
            token={activeToken}
            teacherId={session.staffId}
            schoolId={SCHOOL_ID}
          />
        )}
        {activeTab === 'duties' && (
          <DutiesTab
            token={activeToken}
            teacherId={session.staffId}
            schoolId={SCHOOL_ID}
          />
        )}
        {activeTab === 'scheme' && (
          <SchemeOfWorkTab
            token={activeToken}
            className={activeClass}
            subjectName={session.subjectName ?? ''}
            labels={labels}
            curriculumType={curriculumType}
          />
        )}
      </div>

      <p className="text-center text-xs text-gray-400 pb-8 px-4">
        Sychar Copilot · {activeClass} · {session.subjectName}
      </p>
    </div>
  )
}

// ─── Counsellor QR Redirect ───────────────────────────────────────────────────

function CounsellorQrRedirect() {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://project-o7htk.vercel.app'
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) {
          clearInterval(interval)
          window.location.href = `${APP_URL}/login`
        }
        return n - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [APP_URL])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mx-auto mb-5"
             style={{ background: 'linear-gradient(135deg, #0C6478, #46DFB1)' }}>
          🩺
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Counsellor Portal</h2>
        <p className="text-gray-600 text-sm mb-4">
          This portal is for the school counsellor only.
          Please log into the main app to access welfare features.
        </p>
        <p className="text-gray-400 text-xs">Redirecting to login in {countdown}...</p>
        <a href={`${APP_URL}/login`}
           className="mt-4 inline-block text-sm text-teal-600 underline font-medium">
          Go to login now
        </a>
      </div>
    </div>
  )
}

// ─── Dept QR Landing ──────────────────────────────────────────────────────────

function DeptQrLanding({
  deptInfo, prefilledClass, onVerified,
}: {
  deptInfo: DeptQrInfo
  prefilledClass: string
  onVerified: (s: TeacherSession) => void
}) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  const gradient = `linear-gradient(135deg, ${deptInfo.colorPrimary}, ${deptInfo.colorSecondary})`
  const canEnter = fullName.trim().length >= 2 && phone.replace(/\D/g, '').length >= 9 && !verifying

  async function handleEnter() {
    if (!canEnter) return
    setVerifying(true); setError('')

    try {
      const res = await fetch('/api/department-codes/verify-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), fullName: fullName.trim(), deptId: deptInfo.deptId }),
      })
      const d = await res.json()

      if (!d.valid) {
        setError(d.error ?? 'Verification failed.')
        setVerifying(false)
        return
      }

      onVerified({
        staffId:        d.staffId,
        teacherName:    d.teacherName,
        subjectName:    d.subjectName,
        subRole:        d.subRole,
        departmentCode: d.departmentCode,
        department:     d.department,
        colorPrimary:   d.colorPrimary,
        colorSecondary: d.colorSecondary,
        isCounsellor:   false,
        token:          d.token,
        verifiedAt:     Date.now(),
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div style={{ background: gradient }} className="px-5 pt-8 pb-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/70 mb-1">
          {deptInfo.department} Department
        </p>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Sychar Copilot
        </h1>
        <p className="text-sm text-white/80 mt-1">Nkoroi Mixed Day Secondary School</p>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-sm">
          <p className="text-sm font-semibold text-gray-700 mb-5 text-center">
            Enter your details to continue
          </p>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => { setFullName(e.target.value); setError('') }}
              placeholder="e.g. Jane Wanjiku Kamau"
              autoComplete="name"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Phone number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => { setPhone(e.target.value); setError('') }}
              placeholder="e.g. 0712345678"
              autoComplete="tel"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={e => { if (e.key === 'Enter' && canEnter) handleEnter() }}
            />
            <p className="text-xs text-gray-400 mt-1.5 text-center">
              Use the phone number registered with the school
            </p>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleEnter}
            disabled={!canEnter}
            className="w-full py-4 rounded-xl text-white font-bold text-base transition-all"
            style={{
              background: canEnter ? gradient : '#94a3b8',
              cursor: canEnter ? 'pointer' : 'not-allowed',
            }}
          >
            {verifying ? 'Verifying...' : 'Enter'}
          </button>

          {prefilledClass && (
            <p className="text-xs text-gray-400 text-center mt-4">
              Recording for: <strong>{prefilledClass}</strong>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Landing Screen ───────────────────────────────────────────────────────────

function LandingScreen({
  onVerified,
  prefilledClass,
}: {
  onVerified: (s: TeacherSession) => void
  prefilledClass: string
}) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  const canEnter = fullName.trim().length >= 2 && phone.replace(/\D/g, '').length >= 9 && code.trim().length >= 2 && !verifying

  async function handleEnter() {
    if (!canEnter) return
    setVerifying(true)
    setError('')

    try {
      const res = await fetch('/api/department-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:          phone.trim(),
          fullName:       fullName.trim(),
          departmentCode: code.trim().toUpperCase(),
        }),
      })

      const d = await res.json()

      if (!d.valid) {
        setError(d.error ?? 'Invalid department code.')
        setVerifying(false)
        return
      }

      onVerified({
        staffId:        d.staffId,
        teacherName:    d.teacherName,
        subjectName:    d.subjectName ?? null,
        subRole:        d.subRole ?? null,
        departmentCode: d.departmentCode,
        department:     d.department,
        colorPrimary:   d.colorPrimary,
        colorSecondary: d.colorSecondary,
        isCounsellor:   d.isCounsellor ?? false,
        token:          d.token ?? '',
        verifiedAt:     Date.now(),
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-3"
               style={{ background: 'linear-gradient(135deg, #09D1C7, #2176FF)' }}>
            S
          </div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Sychar Copilot
          </h1>
          <p className="text-sm text-gray-500 mt-1 text-center">Nkoroi Mixed Day Secondary School</p>
        </div>

        <div className="w-full border-t border-gray-200 mb-6" />

        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Full name</label>
          <input
            type="text"
            value={fullName}
            onChange={e => { setFullName(e.target.value); setError('') }}
            placeholder="e.g. Jane Wanjiku Kamau"
            autoComplete="name"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Phone number</label>
          <input
            type="tel"
            value={phone}
            onChange={e => { setPhone(e.target.value); setError('') }}
            placeholder="e.g. 0712345678"
            autoComplete="tel"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1.5">Use the phone number registered with the school</p>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Department Code</label>
          <input
            type="text"
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setError('') }}
            placeholder="e.g. 05M"
            maxLength={10}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm font-mono tracking-widest text-center uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={e => { if (e.key === 'Enter' && canEnter) handleEnter() }}
          />
          <p className="text-xs text-gray-400 mt-1.5 text-center">
            Ask your HOD or Dean of Studies for your department code
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={handleEnter}
          disabled={!canEnter}
          className="w-full py-4 rounded-xl text-white font-bold text-base transition-all"
          style={{
            background: canEnter ? 'linear-gradient(135deg, #0f172a, #1e3a5f)' : '#94a3b8',
            cursor: canEnter ? 'pointer' : 'not-allowed',
          }}
        >
          {verifying ? 'Verifying...' : 'Enter'}
        </button>

        {prefilledClass && (
          <p className="text-xs text-gray-400 text-center mt-4">
            You will record for: <strong>{prefilledClass}</strong>
          </p>
        )}
      </div>
    </div>
  )
}
