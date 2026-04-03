'use client'

export const dynamic = 'force-dynamic'


import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { CalendarDays, CheckCircle, AlertTriangle, Plus, Trash2 } from 'lucide-react'
import DocumentScanner, { type ScanResult } from '@/components/DocumentScanner'
import GeminiLoadingOverlay from '@/components/GeminiLoadingOverlay'
import { useOCRScanner } from '@/hooks/useOCRScanner'


const ALLOWED_ROLES = ['bursar', 'principal', 'deputy_principal']

interface FeeItem {
  item_name: string
  amount: string
  due_date: string
  mandatory: boolean
  notes: string
}

const inputCls = 'w-full bg-[#f9fafb] border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-[var(--role-primary,#0891b2)] transition-colors'

export default function FeeSchedulePage() {
  const router = useRouter()
  const { scan, isScanning } = useOCRScanner()
  const [phase, setPhase] = useState<'idle' | 'review' | 'saving' | 'done'>('idle')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [term, setTerm] = useState('')
  const [academicYear, setAcademicYear] = useState('')
  const [formGrade, setFormGrade] = useState('')
  const [items, setItems] = useState<FeeItem[]>([])
  const [saveError, setSaveError] = useState('')
  const [saveCount, setSaveCount] = useState(0)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      createClient().from('staff_records').select('sub_role').eq('user_id', user.id).single()
        .then(({ data }) => {
          if (data && !ALLOWED_ROLES.includes(data.sub_role)) router.replace('/dashboard/scanner')
        })
    })
  }, [router])

  async function handleScanComplete(result: ScanResult) {
    const ocr = await scan(result.base64, 'ocr_fee_schedule')
    if (!ocr) return
    const d = ocr.data
    setConfidence(ocr.confidence)
    setTerm(String(d.term ?? ''))
    setAcademicYear(String(d.academic_year ?? ''))
    setFormGrade(String(d.form_grade ?? ''))
    const extracted = Array.isArray(d.fee_items)
      ? (d.fee_items as Array<Record<string, unknown>>).map((i) => ({
          item_name: String(i.item_name ?? ''),
          amount:    String(i.amount ?? ''),
          due_date:  String(i.due_date ?? ''),
          mandatory: Boolean(i.mandatory ?? true),
          notes:     String(i.notes ?? ''),
        }))
      : []
    setItems(extracted)
    setPhase('review')
  }

  function updateItem(idx: number, field: keyof FeeItem, value: string | boolean) {
    setItems(items.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function addRow() {
    setItems([...items, { item_name: '', amount: '', due_date: '', mandatory: true, notes: '' }])
  }

  function removeRow(idx: number) {
    setItems(items.filter((_, i) => i !== idx))
  }

  const total = items.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)

  async function handleSave() {
    setSaveError('')
    setPhase('saving')
    const res = await fetch('/api/scanner/fee-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feeItems: items, term, academicYear, formGrade }),
    })
    const data = await res.json()
    if (data.success) { setSaveCount(data.updated); setPhase('done') }
    else { setSaveError(data.error || 'Save failed'); setPhase('review') }
  }

  return (
    <div className="bg-[#f8fafc] min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-gray-900 font-display text-xl font-semibold">Fee Schedule Scanner</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Upload the official fee circular or fee structure document. Gemini will extract all fee items.
            </p>
          </div>
        </div>

        {phase === 'done' && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 mt-6 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-gray-900 font-medium mb-1">Fee Structure Updated</p>
            <p className="text-gray-500 text-xs mb-4">{saveCount} fee items saved for {formGrade} {term}</p>
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
            <DocumentScanner documentType="fee-schedule" title="Fee Schedule" onScanComplete={handleScanComplete} />
            <GeminiLoadingOverlay isVisible={isScanning} task="ocr_fee_schedule" />
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

            <div className="bg-white border border-gray-100 rounded-3xl p-6">
              <h2 className="text-gray-900 font-display font-semibold mb-4">Schedule Details</h2>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-gray-500 text-xs mb-1 block">Term</label>
                  <select className={inputCls} value={term} onChange={(e) => setTerm(e.target.value)}>
                    <option value="">Select</option>
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                  </select>
                </div>
                <div>
                  <label className="text-gray-500 text-xs mb-1 block">Academic Year</label>
                  <input className={inputCls} value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="e.g. 2026" />
                </div>
                <div>
                  <label className="text-gray-500 text-xs mb-1 block">Form / Grade</label>
                  <input className={inputCls} value={formGrade} onChange={(e) => setFormGrade(e.target.value)} placeholder="e.g. Form 3" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-3xl p-6 overflow-x-auto">
              <h2 className="text-gray-900 font-display font-semibold mb-4">Fee Items</h2>
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-100">
                    <th className="py-2 text-left font-semibold w-1/3">Fee Item</th>
                    <th className="py-2 text-left font-semibold w-24">Amount (KES)</th>
                    <th className="py-2 text-left font-semibold w-28">Due Date</th>
                    <th className="py-2 text-left font-semibold w-20">Mandatory</th>
                    <th className="py-2 text-left font-semibold">Notes</th>
                    <th className="py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-gray-100/50">
                      <td className="py-2 pr-2">
                        <input className="w-full bg-[#f9fafb] border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-xs focus:outline-none focus:border-[var(--role-primary,#0891b2)]"
                          value={item.item_name} onChange={(e) => updateItem(i, 'item_name', e.target.value)} />
                      </td>
                      <td className="py-2 pr-2">
                        <input type="number" className="w-full bg-[#1f2333] border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#FF0A6C]"
                          value={item.amount} onChange={(e) => updateItem(i, 'amount', e.target.value)} />
                      </td>
                      <td className="py-2 pr-2">
                        <input className="w-full bg-[#1f2333] border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#FF0A6C]"
                          value={item.due_date} onChange={(e) => updateItem(i, 'due_date', e.target.value)} />
                      </td>
                      <td className="py-2 pr-2 text-center">
                        <input type="checkbox" checked={item.mandatory}
                          onChange={(e) => updateItem(i, 'mandatory', e.target.checked)}
                          className="w-4 h-4 rounded accent-[#FF0A6C]" />
                      </td>
                      <td className="py-2 pr-2">
                        <input className="w-full bg-[#1f2333] border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#FF0A6C]"
                          value={item.notes} onChange={(e) => updateItem(i, 'notes', e.target.value)} />
                      </td>
                      <td className="py-2">
                        <button onClick={() => removeRow(i)} className="text-gray-600 hover:text-[#FF0A6C] transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <button onClick={addRow}
                  className="flex items-center gap-2 text-[#2D27FF] hover:text-blue-400 text-sm transition-colors">
                  <Plus className="w-4 h-4" />
                  Add Row
                </button>
                <div className="text-right">
                  <p className="text-gray-500 text-xs">Total</p>
                  <p className="text-gray-900 font-semibold font-display text-lg">KES {total.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {saveError && (
              <div className="p-3 bg-[#FF0A6C]/10 border border-[#FF0A6C]/30 rounded-xl text-[#FF0A6C] text-xs flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {saveError}
              </div>
            )}

            <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <p className="text-orange-400 text-xs">
                This will update the fee structure for {formGrade || 'the selected grade'} {term}. Existing items will be replaced.
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={handleSave} disabled={phase === 'saving' || items.length === 0}
                className="flex-1 bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] text-white rounded-2xl py-3 text-sm font-medium shadow-[0_0_15px_rgba(255,10,108,0.3)] disabled:opacity-50">
                {phase === 'saving' ? 'Saving...' : 'Set as Official Fee Structure'}
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
