'use client'

export const dynamic = 'force-dynamic'


import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Receipt, CheckCircle, AlertTriangle, Search } from 'lucide-react'
import DocumentScanner, { type ScanResult } from '@/components/DocumentScanner'
import GeminiLoadingOverlay from '@/components/GeminiLoadingOverlay'
import { useOCRScanner } from '@/hooks/useOCRScanner'


const ALLOWED_ROLES = ['bursar', 'deputy_principal', 'principal']

interface FormState {
  amount_paid: string
  payment_date: string
  reference_number: string
  mpesa_transaction_id: string
  paid_by_name: string
  term: string
  payment_method: string
}

interface StudentMatch {
  id: string
  name: string
  admission_number: string | null
  class_name: string | null
}

const inputCls = 'w-full bg-[#f9fafb] border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-[var(--role-primary,#0891b2)] transition-colors'
const labelCls = 'text-gray-500 text-xs mb-1 block'

export default function FeeReceiptPage() {
  const router = useRouter()
  const { scan, isScanning } = useOCRScanner()
  const [phase, setPhase] = useState<'idle' | 'review' | 'saving' | 'done'>('idle')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [receiptType, setReceiptType] = useState('')
  const [form, setForm] = useState<FormState>({
    amount_paid: '', payment_date: '', reference_number: '',
    mpesa_transaction_id: '', paid_by_name: '', term: '', payment_method: '',
  })
  const [suggestedStudent, setSuggestedStudent] = useState<StudentMatch | null>(null)
  const [confirmedStudent, setConfirmedStudent] = useState<StudentMatch | null>(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [searchResults, setSearchResults] = useState<StudentMatch[]>([])
  const [saveError, setSaveError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

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
    const ocr = await scan(result.base64, 'ocr_fee_receipt')
    if (!ocr) return
    const d = ocr.data
    setConfidence(ocr.confidence)
    setReceiptType(String(d.receipt_type ?? ''))
    setForm({
      amount_paid:          String(d.amount_paid          ?? ''),
      payment_date:         String(d.payment_date         ?? ''),
      reference_number:     String(d.reference_number     ?? ''),
      mpesa_transaction_id: String(d.mpesa_transaction_id ?? ''),
      paid_by_name:         String(d.paid_by_name         ?? ''),
      term:                 String(d.term                 ?? ''),
      payment_method:       String(d.receipt_type === 'mpesa' ? 'M-Pesa' : d.receipt_type === 'bank_deposit' ? 'Bank' : 'Cash'),
    })

    // Try to match student
    const admNo = String(d.admission_number ?? '')
    const name  = String(d.student_name ?? '')
    if (admNo || name) {
      const query = admNo
        ? createClient().from('students').select('id, name, admission_number, class_name').eq('admission_number', admNo)
        : createClient().from('students').select('id, name, admission_number, class_name').ilike('name', `%${name}%`)
      const { data: students } = await query.limit(1)
      if (students?.[0]) setSuggestedStudent(students[0] as StudentMatch)
    }
    setPhase('review')
  }

  async function searchStudents(q: string) {
    setStudentSearch(q)
    if (q.length < 2) { setSearchResults([]); return }
    const { data } = await createClient()
      .from('students').select('id, name, admission_number, class_name')
      .or(`name.ilike.%${q}%,admission_number.ilike.%${q}%`).limit(8)
    setSearchResults((data ?? []) as StudentMatch[])
  }

  async function handleSave() {
    setSaveError('')
    setPhase('saving')
    const student = confirmedStudent ?? suggestedStudent
    const res = await fetch('/api/scanner/fee-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extractedData: { ...form, receiptType }, studentId: student?.id ?? null, studentName: student?.name ?? form.paid_by_name, userId }),
    })
    const data = await res.json()
    if (data.success) setPhase('done')
    else { setSaveError(data.error || 'Save failed'); setPhase('review') }
  }

  const receiptTypeBadge = () => {
    const map: Record<string, string> = { mpesa: 'M-Pesa', bank_deposit: 'Bank Deposit', school_receipt: 'School Receipt' }
    const label = map[receiptType] ?? receiptType
    if (!label) return null
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#00E1FD]/20 text-[#00E1FD] ml-2">
        {label}
      </span>
    )
  }

  return (
    <div className="bg-[#f8fafc] min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-gray-900 font-display text-xl font-semibold flex items-center">
              Fee Receipt Scanner {receiptTypeBadge()}
            </h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Upload a bank deposit receipt, cash receipt, or M-Pesa confirmation screenshot.
            </p>
          </div>
        </div>

        {phase === 'done' && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 mt-6 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-gray-900 font-medium mb-1">
              Payment recorded for {(confirmedStudent?.name ?? suggestedStudent?.name ?? form.paid_by_name) || 'Student'}
            </p>
            <p className="text-gray-500 text-xs mb-4">KES {form.amount_paid} — {form.term}</p>
            <div className="flex gap-3">
              <button onClick={() => { setPhase('idle'); setSuggestedStudent(null); setConfirmedStudent(null) }}
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
            <DocumentScanner documentType="fee-receipt" title="Fee Receipt" onScanComplete={handleScanComplete} />
            <GeminiLoadingOverlay isVisible={isScanning} task="ocr_fee_receipt" />
          </div>
        )}

        {(phase === 'review' || phase === 'saving') && (
          <div className="mt-6 space-y-4">
            {confidence !== null && (
              <div className={`flex items-center gap-2 p-3 rounded-xl ${confidence > 0.8 ? 'bg-emerald-500/20 border border-emerald-500/30' : confidence >= 0.5 ? 'bg-orange-500/20 border border-orange-500/30' : 'bg-[#FF0A6C]/20 border border-[#FF0A6C]/30'}`}>
                <span className={`text-xs font-medium ${confidence > 0.8 ? 'text-emerald-400' : confidence >= 0.5 ? 'text-orange-400' : 'text-[#FF0A6C]'}`}>
                  {confidence > 0.8 ? 'High confidence read' : confidence >= 0.5 ? 'Please verify details' : 'Low confidence — check all fields carefully'}
                </span>
                <span className="text-gray-500 text-xs ml-auto">{Math.round(confidence * 100)}%</span>
              </div>
            )}

            {/* Student matching */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6">
              <h2 className="text-gray-900 font-display font-semibold mb-4">Student Match</h2>
              {suggestedStudent && !confirmedStudent ? (
                <div className="flex items-center justify-between bg-[#f9fafb] rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-gray-900 text-sm font-medium">{suggestedStudent.name}</p>
                      <p className="text-gray-500 text-xs">{suggestedStudent.class_name} · {suggestedStudent.admission_number}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmedStudent(suggestedStudent)}
                      className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg hover:bg-emerald-500/30 transition-colors">
                      Confirm
                    </button>
                    <button onClick={() => setSuggestedStudent(null)}
                      className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
                      Change
                    </button>
                  </div>
                </div>
              ) : confirmedStudent ? (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-gray-900 text-sm font-medium">{confirmedStudent.name}</p>
                      <p className="text-gray-500 text-xs">{confirmedStudent.class_name} · {confirmedStudent.admission_number}</p>
                    </div>
                  </div>
                  <button onClick={() => setConfirmedStudent(null)}
                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors">
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex items-center gap-2 bg-[#f9fafb] border border-gray-200 rounded-xl px-4 py-2.5">
                    <Search className="w-4 h-4 text-gray-500 shrink-0" />
                    <input
                      className="flex-1 bg-transparent text-gray-900 text-sm focus:outline-none placeholder:text-gray-400"
                      placeholder="Search student by name or admission number..."
                      value={studentSearch}
                      onChange={(e) => searchStudents(e.target.value)}
                    />
                  </div>
                  {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl z-10 shadow-xl overflow-hidden">
                      {searchResults.map((s) => (
                        <button key={s.id} onClick={() => { setConfirmedStudent(s); setStudentSearch(''); setSearchResults([]) }}
                          className="block w-full text-left px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 border-b border-gray-100/50 last:border-0">
                          <span className="text-gray-900">{s.name}</span>
                          <span className="text-gray-500 ml-2 text-xs">{s.class_name} · {s.admission_number}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payment details */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6">
              <h2 className="text-gray-900 font-display font-semibold mb-4">Payment Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Amount Paid (KES)</label>
                  <input type="number" className={inputCls} value={form.amount_paid}
                    onChange={(e) => setForm({ ...form, amount_paid: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Payment Date</label>
                  <input type="date" className={inputCls} value={form.payment_date}
                    onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Reference Number</label>
                  <input className={inputCls} value={form.reference_number}
                    onChange={(e) => setForm({ ...form, reference_number: e.target.value })} />
                </div>
                {receiptType === 'mpesa' && (
                  <div>
                    <label className={labelCls}>M-Pesa Transaction ID</label>
                    <input className={inputCls} value={form.mpesa_transaction_id}
                      onChange={(e) => setForm({ ...form, mpesa_transaction_id: e.target.value })} />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Paid By (Name)</label>
                  <input className={inputCls} value={form.paid_by_name}
                    onChange={(e) => setForm({ ...form, paid_by_name: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Term</label>
                  <select className={inputCls} value={form.term}
                    onChange={(e) => setForm({ ...form, term: e.target.value })}>
                    <option value="">Select term</option>
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Payment Method</label>
                  <select className={inputCls} value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                    <option value="M-Pesa">M-Pesa</option>
                    <option value="Bank">Bank</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
              </div>
            </div>

            {saveError && (
              <div className="p-3 bg-[#FF0A6C]/10 border border-[#FF0A6C]/30 rounded-xl text-[#FF0A6C] text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {saveError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleSave} disabled={phase === 'saving'}
                className="flex-1 bg-gradient-to-r from-teal-600 to-teal-500 text-white rounded-2xl py-3 text-sm font-medium hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 transition-all">
                {phase === 'saving' ? 'Recording...' : 'Record Payment'}
              </button>
              <button onClick={() => setPhase('idle')}
                className="border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-2xl px-6 py-3 text-sm transition-colors">
                Rescan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
