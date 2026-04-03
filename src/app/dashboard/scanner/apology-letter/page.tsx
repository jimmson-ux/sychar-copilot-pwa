'use client'

export const dynamic = 'force-dynamic'


import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { FileText, CheckCircle, AlertTriangle } from 'lucide-react'
import DocumentScanner, { type ScanResult } from '@/components/DocumentScanner'
import GeminiLoadingOverlay from '@/components/GeminiLoadingOverlay'
import { useOCRScanner } from '@/hooks/useOCRScanner'


const ALLOWED_ROLES = [
  'class_teacher', 'dean_of_students', 'deputy_principal', 'principal',
  'dean_of_studies', 'deputy_dean_of_studies',
]

interface FormState {
  student_name: string
  admission_number: string
  class_name: string
  letter_date: string
  offence_committed: string
  tone: string
  teacher_witness: string
  parent_signed: boolean
}

function ConfidenceBanner({ confidence }: { confidence: number | null }) {
  if (confidence === null) return null
  if (confidence > 0.8)
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 mb-4">
        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
        <span className="text-emerald-400 text-xs font-medium">High confidence read</span>
        <span className="text-gray-500 text-xs ml-auto">{Math.round(confidence * 100)}%</span>
      </div>
    )
  if (confidence >= 0.5)
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-orange-500/20 border border-orange-500/30 mb-4">
        <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
        <span className="text-orange-400 text-xs font-medium">Please verify details</span>
        <span className="text-gray-500 text-xs ml-auto">{Math.round(confidence * 100)}%</span>
      </div>
    )
  return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-[#FF0A6C]/20 border border-[#FF0A6C]/30 mb-4">
      <AlertTriangle className="w-4 h-4 text-[#FF0A6C] shrink-0" />
      <span className="text-[#FF0A6C] text-xs font-medium">Low confidence — please check all fields carefully</span>
      <span className="text-gray-500 text-xs ml-auto">{Math.round(confidence * 100)}%</span>
    </div>
  )
}

const inputCls =
  'w-full bg-[#f9fafb] border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-[var(--role-primary,#0891b2)] transition-colors'
const labelCls = 'text-gray-500 text-xs mb-1 block capitalize'

export default function ApologyLetterPage() {
  const router = useRouter()
  const { scan, isScanning } = useOCRScanner()
  const [phase, setPhase] = useState<'idle' | 'review' | 'saving' | 'done'>('idle')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [form, setForm] = useState<FormState>({
    student_name: '', admission_number: '', class_name: '',
    letter_date: '', offence_committed: '', tone: 'genuine',
    teacher_witness: '', parent_signed: false,
  })
  const [saveError, setSaveError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [authorized, setAuthorized] = useState(true)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      createClient().from('staff_records').select('sub_role').eq('user_id', user.id).single()
        .then(({ data }) => {
          if (data && !ALLOWED_ROLES.includes(data.sub_role)) {
            setAuthorized(false)
            router.replace('/dashboard/scanner')
          }
        })
    })
  }, [router])

  async function handleScanComplete(result: ScanResult) {
    const ocr = await scan(result.base64, 'ocr_apology_letter')
    if (!ocr) return
    const d = ocr.data
    setConfidence(ocr.confidence)
    setForm({
      student_name:      String(d.student_name      ?? ''),
      admission_number:  String(d.admission_number  ?? ''),
      class_name:        String((d.class as string)  ?? ''),
      letter_date:       String(d.letter_date       ?? ''),
      offence_committed: String(d.offence_committed ?? ''),
      tone:              String(d.tone              ?? 'genuine'),
      teacher_witness:   String(d.teacher_witness   ?? ''),
      parent_signed:     Boolean(d.parent_signed),
    })
    setPhase('review')
  }

  async function handleSave() {
    setSaveError('')
    setPhase('saving')
    const res = await fetch('/api/scanner/apology-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extractedData: form, userId }),
    })
    const data = await res.json()
    if (data.success) {
      setPhase('done')
    } else {
      setSaveError(data.error || 'Save failed')
      setPhase('review')
    }
  }

  if (!authorized) return null

  return (
    <div className="bg-[#f8fafc] min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-[#FF0A6C]/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-[#FF0A6C]" />
          </div>
          <div>
            <h1 className="text-gray-900 font-display text-xl font-semibold">Apology Letter Scanner</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Photograph or upload a student apology letter. Gemini will extract the details automatically.
            </p>
          </div>
        </div>

        {/* Done state */}
        {phase === 'done' && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 mt-6 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-gray-900 font-medium mb-1">Saved to Discipline Records</p>
            <p className="text-gray-500 text-xs mb-4">
              {form.student_name} — {form.class_name}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setPhase('idle'); setForm({ student_name:'',admission_number:'',class_name:'',letter_date:'',offence_committed:'',tone:'genuine',teacher_witness:'',parent_signed:false }) }}
                className="flex-1 bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] text-white rounded-2xl py-2.5 text-sm font-medium"
              >
                Scan Another
              </button>
              <button
                onClick={() => router.push('/dashboard/scanner')}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-2xl py-2.5 text-sm transition-colors"
              >
                Back to Scanner
              </button>
            </div>
          </div>
        )}

        {/* Scanner */}
        {phase === 'idle' && (
          <div className="relative mt-6">
            <DocumentScanner
              documentType="apology-letter"
              title="Apology Letter"
              onScanComplete={handleScanComplete}
            />
            <GeminiLoadingOverlay isVisible={isScanning} task="ocr_apology_letter" />
          </div>
        )}

        {/* Review form */}
        {(phase === 'review' || phase === 'saving') && (
          <div className="mt-6">
            <ConfidenceBanner confidence={confidence} />

            <div className="bg-white border border-gray-100 rounded-3xl p-6">
              <h2 className="text-gray-900 font-display font-semibold mb-4">Extracted Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Student Name</label>
                  <input className={inputCls} value={form.student_name}
                    onChange={(e) => setForm({ ...form, student_name: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Admission Number</label>
                  <input className={inputCls} value={form.admission_number}
                    onChange={(e) => setForm({ ...form, admission_number: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Class</label>
                  <input className={inputCls} value={form.class_name}
                    onChange={(e) => setForm({ ...form, class_name: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Letter Date</label>
                  <input type="date" className={inputCls} value={form.letter_date}
                    onChange={(e) => setForm({ ...form, letter_date: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Offence Committed</label>
                  <textarea className={`${inputCls} resize-none`} rows={3} value={form.offence_committed}
                    onChange={(e) => setForm({ ...form, offence_committed: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Tone</label>
                  <select className={inputCls} value={form.tone}
                    onChange={(e) => setForm({ ...form, tone: e.target.value })}>
                    <option value="genuine">Genuine</option>
                    <option value="reluctant">Reluctant</option>
                    <option value="unclear">Unclear</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Teacher Witness</label>
                  <input className={inputCls} value={form.teacher_witness}
                    onChange={(e) => setForm({ ...form, teacher_witness: e.target.value })} />
                </div>
                <div className="sm:col-span-2 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="parent_signed"
                    checked={form.parent_signed}
                    onChange={(e) => setForm({ ...form, parent_signed: e.target.checked })}
                    className="w-4 h-4 rounded accent-[#FF0A6C]"
                  />
                  <label htmlFor="parent_signed" className="text-gray-600 text-sm cursor-pointer">
                    Parent / Guardian has signed
                  </label>
                </div>
              </div>

              {saveError && (
                <div className="mt-4 p-3 bg-[#FF0A6C]/10 border border-[#FF0A6C]/30 rounded-xl text-[#FF0A6C] text-xs">
                  {saveError}
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSave}
                  disabled={phase === 'saving'}
                  className="flex-1 bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] text-white rounded-2xl py-3 text-sm font-medium shadow-[0_0_15px_rgba(255,10,108,0.3)] disabled:opacity-50 transition-opacity"
                >
                  {phase === 'saving' ? 'Saving...' : 'Save to Discipline Records'}
                </button>
                <button
                  onClick={() => setPhase('idle')}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-2xl py-3 text-sm transition-colors"
                >
                  Rescan
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
