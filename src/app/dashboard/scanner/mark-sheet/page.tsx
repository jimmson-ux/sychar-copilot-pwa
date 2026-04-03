'use client'

export const dynamic = 'force-dynamic'


import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Table2, CheckCircle, AlertTriangle, Search } from 'lucide-react'
import DocumentScanner, { type ScanResult } from '@/components/DocumentScanner'
import GeminiLoadingOverlay from '@/components/GeminiLoadingOverlay'
import { useOCRScanner } from '@/hooks/useOCRScanner'


const ALLOWED_ROLES = ['class_teacher', 'hod_subjects', 'hod_pathways', 'deputy_principal', 'principal']

interface OCRStudent {
  name: string
  admission_no: string | null
  score: number | null
  grade: string | null
  remarks: string | null
}

interface DBStudent {
  id: string
  name: string
  admission_number: string | null
}

interface MatchRow {
  ocrStudent: OCRStudent
  dbStudentId: string | null
  dbStudentName: string | null
  score: number | string
  matchStatus: 'matched' | 'partial' | 'unmatched'
}

function normalise(s: string) {
  return s.toLowerCase().replace(/[^a-z\s]/g, '').trim()
}

function similarity(a: string, b: string): number {
  const na = normalise(a).split(' ')
  const nb = normalise(b).split(' ')
  const matches = na.filter((w) => nb.includes(w)).length
  return matches / Math.max(na.length, nb.length)
}

function matchStudents(ocrStudents: OCRStudent[], dbStudents: DBStudent[]): MatchRow[] {
  return ocrStudents.map((ocr) => {
    // Try exact admission number match
    if (ocr.admission_no) {
      const exact = dbStudents.find(
        (s) => s.admission_number?.toLowerCase() === ocr.admission_no?.toLowerCase()
      )
      if (exact)
        return { ocrStudent: ocr, dbStudentId: exact.id, dbStudentName: exact.name, score: ocr.score ?? '', matchStatus: 'matched' }
    }
    // Try name similarity
    let best: DBStudent | null = null
    let bestScore = 0
    for (const s of dbStudents) {
      const sim = similarity(ocr.name, s.name)
      if (sim > bestScore) { bestScore = sim; best = s }
    }
    if (best && bestScore >= 0.7)
      return { ocrStudent: ocr, dbStudentId: best.id, dbStudentName: best.name, score: ocr.score ?? '', matchStatus: 'partial' }

    return { ocrStudent: ocr, dbStudentId: null, dbStudentName: null, score: ocr.score ?? '', matchStatus: 'unmatched' }
  })
}

const inputCls = 'bg-[#f9fafb] border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-[var(--role-primary,#0891b2)] transition-colors'

export default function MarkSheetPage() {
  const router = useRouter()
  const { scan, isScanning } = useOCRScanner()
  const [phase, setPhase] = useState<'idle' | 'review' | 'saving' | 'done'>('idle')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [subjectName, setSubjectName] = useState('')
  const [className, setClassName] = useState('')
  const [examType, setExamType] = useState('')
  const [term, setTerm] = useState('')
  const [rows, setRows] = useState<MatchRow[]>([])
  const [saveResult, setSaveResult] = useState<{ saved: number; skipped: number } | null>(null)
  const [saveError, setSaveError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<Record<number, string>>({})
  const [searchResults, setSearchResults] = useState<Record<number, DBStudent[]>>({})

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      createClient().from('staff_records').select('sub_role').eq('user_id', user.id).single()
        .then(({ data }) => {
          if (data && !ALLOWED_ROLES.includes(data.sub_role)) router.replace('/dashboard/scanner')
        })
    })
  }, [router])

  async function handleScanComplete(result: ScanResult) {
    const ocr = await scan(result.base64, 'ocr_grade_sheet')
    if (!ocr) return
    const d = ocr.data
    setConfidence(ocr.confidence)
    const ocrStudents: OCRStudent[] = Array.isArray(d.students)
      ? (d.students as OCRStudent[])
      : []
    const detectedClass = String(d.class_name ?? '')
    setSubjectName(String(d.subject_name ?? ''))
    setClassName(detectedClass)
    setExamType(String(d.exam_type ?? ''))
    setTerm(String(d.term ?? ''))

    // Fetch DB students matching class
    const { data: dbStudents } = await createClient()
      .from('students')
      .select('id, name, admission_number')
      .ilike('class_name', `%${detectedClass}%`)
      .limit(100)

    setRows(matchStudents(ocrStudents, dbStudents ?? []))
    setPhase('review')
  }

  async function searchStudents(rowIdx: number, q: string) {
    setSearchQuery({ ...searchQuery, [rowIdx]: q })
    if (q.length < 2) { setSearchResults({ ...searchResults, [rowIdx]: [] }); return }
    const { data } = await createClient().from('students').select('id, name, admission_number')
      .or(`name.ilike.%${q}%,admission_number.ilike.%${q}%`).limit(8)
    setSearchResults({ ...searchResults, [rowIdx]: data ?? [] })
  }

  function linkStudent(rowIdx: number, student: DBStudent) {
    setRows(rows.map((r, i) =>
      i === rowIdx
        ? { ...r, dbStudentId: student.id, dbStudentName: student.name, matchStatus: 'matched' }
        : r
    ))
    setSearchQuery({ ...searchQuery, [rowIdx]: '' })
    setSearchResults({ ...searchResults, [rowIdx]: [] })
  }

  async function handleSave() {
    setSaveError('')
    setPhase('saving')
    const toSave = rows.filter((r) => r.matchStatus === 'matched')
    const res = await fetch('/api/scanner/mark-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        students: toSave.map((r) => ({
          studentId: r.dbStudentId,
          studentName: r.ocrStudent.name,
          admissionNo: r.ocrStudent.admission_no,
          score: Number(r.score),
        })),
        subjectName, className, examType, term, userId,
        skipped: rows.length - toSave.length,
      }),
    })
    const data = await res.json()
    if (data.success) {
      setSaveResult({ saved: data.saved, skipped: data.skipped })
      setPhase('done')
    } else {
      setSaveError(data.error || 'Save failed')
      setPhase('review')
    }
  }

  const matchedCount = rows.filter((r) => r.matchStatus === 'matched').length

  const statusBadge = (status: MatchRow['matchStatus']) => {
    if (status === 'matched')
      return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-500">Matched</span>
    if (status === 'partial')
      return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-orange-500/20 text-orange-500">Partial</span>
    return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-[#FF0A6C]/20 text-[#FF0A6C]">Not found</span>
  }

  return (
    <div className="bg-[#f8fafc] min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-[#2D27FF]/10 flex items-center justify-center">
            <Table2 className="w-5 h-5 text-[#2D27FF]" />
          </div>
          <div>
            <h1 className="text-gray-900 font-display text-xl font-semibold">Mark Sheet Scanner</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Upload a photo of your physical mark book page. Gemini will extract all student scores.
            </p>
          </div>
        </div>

        {phase === 'done' && saveResult && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 mt-6 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-gray-900 font-medium mb-1">Scores Saved</p>
            <p className="text-gray-500 text-xs mb-4">
              {saveResult.saved} scores saved · {saveResult.skipped} skipped (unmatched)
            </p>
            <div className="flex gap-3">
              <button onClick={() => setPhase('idle')}
                className="flex-1 bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] text-white rounded-2xl py-2.5 text-sm font-medium">
                Scan Another
              </button>
              <button onClick={() => router.push('/dashboard/scanner')}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-2xl py-2.5 text-sm transition-colors">
                Back
              </button>
            </div>
          </div>
        )}

        {phase === 'idle' && (
          <div className="relative mt-6">
            <DocumentScanner documentType="mark-sheet" title="Mark Sheet" onScanComplete={handleScanComplete} />
            <GeminiLoadingOverlay isVisible={isScanning} task="ocr_grade_sheet" />
          </div>
        )}

        {(phase === 'review' || phase === 'saving') && (
          <div className="mt-6 space-y-4">
            {confidence !== null && (
              <div className={`flex items-center gap-2 p-3 rounded-xl mb-2 ${confidence > 0.8 ? 'bg-emerald-500/20 border border-emerald-500/30' : confidence >= 0.5 ? 'bg-orange-500/20 border border-orange-500/30' : 'bg-[#FF0A6C]/20 border border-[#FF0A6C]/30'}`}>
                <span className={`text-xs font-medium ${confidence > 0.8 ? 'text-emerald-400' : confidence >= 0.5 ? 'text-orange-400' : 'text-[#FF0A6C]'}`}>
                  {confidence > 0.8 ? 'High confidence read' : confidence >= 0.5 ? 'Please verify details' : 'Low confidence — check all fields carefully'}
                </span>
                <span className="text-gray-500 text-xs ml-auto">{Math.round(confidence * 100)}%</span>
              </div>
            )}

            {/* Subject details */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6">
              <h2 className="text-gray-900 font-display font-semibold mb-4">Subject Details</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Subject', value: subjectName, set: setSubjectName },
                  { label: 'Class', value: className, set: setClassName },
                  { label: 'Exam Type', value: examType, set: setExamType },
                  { label: 'Term', value: term, set: setTerm },
                ].map(({ label, value, set }) => (
                  <div key={label}>
                    <label className="text-gray-500 text-xs mb-1 block">{label}</label>
                    <input className={inputCls + ' w-full'} value={value}
                      onChange={(e) => set(e.target.value)} placeholder={label} />
                  </div>
                ))}
              </div>
            </div>

            {/* Comparison table */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6 overflow-x-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-gray-900 font-display font-semibold">
                  Student Scores <span className="text-gray-500 font-normal text-sm ml-2">({rows.length} students)</span>
                </h2>
                <span className="text-xs text-gray-400">{matchedCount} matched</span>
              </div>
              <table className="w-full text-xs sm:text-sm min-w-[640px]">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-100">
                    <th className="py-3 text-left font-semibold">#</th>
                    <th className="py-3 text-left font-semibold">OCR Name</th>
                    <th className="py-3 text-left font-semibold">System Match</th>
                    <th className="py-3 text-left font-semibold">Adm No</th>
                    <th className="py-3 text-left font-semibold">Score</th>
                    <th className="py-3 text-left font-semibold">Status</th>
                    <th className="py-3 text-left font-semibold">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100/50 hover:bg-gray-50">
                      <td className="py-2.5 text-gray-500">{i + 1}</td>
                      <td className="py-2.5 text-gray-300">{row.ocrStudent.name}</td>
                      <td className="py-2.5 text-gray-300">{row.dbStudentName ?? '—'}</td>
                      <td className="py-2.5 text-gray-500">{row.ocrStudent.admission_no ?? '—'}</td>
                      <td className="py-2.5">
                        <input
                          type="number"
                          className="w-16 bg-[#f9fafb] border border-gray-200 rounded-lg px-2 py-1 text-gray-900 text-xs focus:outline-none focus:border-[var(--role-primary,#0891b2)]"
                          value={String(row.score)}
                          onChange={(e) => setRows(rows.map((r, ri) => ri === i ? { ...r, score: e.target.value } : r))}
                        />
                      </td>
                      <td className="py-2.5">{statusBadge(row.matchStatus)}</td>
                      <td className="py-2.5">
                        {row.matchStatus !== 'matched' && (
                          <div className="relative">
                            <div className="flex items-center gap-1">
                              <Search className="w-3 h-3 text-gray-600 shrink-0" />
                              <input
                                className="w-28 bg-[#f9fafb] border border-gray-200 rounded-lg px-2 py-1 text-gray-900 text-xs focus:outline-none focus:border-[#2D27FF]"
                                placeholder="Search..."
                                value={searchQuery[i] ?? ''}
                                onChange={(e) => searchStudents(i, e.target.value)}
                              />
                            </div>
                            {(searchResults[i] ?? []).length > 0 && (
                              <div className="absolute top-full left-0 mt-1 bg-[#1f2333] border border-gray-700 rounded-xl z-10 w-48 shadow-xl">
                                {searchResults[i].map((s) => (
                                  <button key={s.id} onClick={() => linkStudent(i, s)}
                                    className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/10">
                                    {s.name} {s.admission_number ? `(${s.admission_number})` : ''}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {saveError && (
              <div className="p-3 bg-[#FF0A6C]/10 border border-[#FF0A6C]/30 rounded-xl text-[#FF0A6C] text-xs">
                {saveError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSave} disabled={phase === 'saving' || matchedCount === 0}
                className="flex-1 bg-gradient-to-r from-teal-600 to-teal-500 text-white rounded-2xl py-3 text-sm font-medium hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 transition-all">
                {phase === 'saving' ? 'Saving...' : `Save ${matchedCount} of ${rows.length} Scores`}
              </button>
              <button onClick={() => setPhase('idle')}
                className="border border-gray-700 text-gray-300 hover:bg-white/5 rounded-2xl px-6 py-3 text-sm transition-colors">
                Rescan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
