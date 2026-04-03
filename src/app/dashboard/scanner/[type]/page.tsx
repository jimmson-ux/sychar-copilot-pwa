'use client'

export const dynamic = 'force-dynamic'


import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  ChevronLeft, CheckCircle, AlertTriangle,
  FileText, Table2, UserCircle, Receipt, Smartphone, CalendarDays,
  ClipboardList, Mail, ScanLine, type LucideIcon,
} from 'lucide-react'
import DocumentScanner, { type ScanResult } from '@/components/DocumentScanner'


// ── Scan type catalogue (duplicated for self-contained route) ──────────────────

interface ScanTypeConfig {
  slug: string
  title: string
  description: string
  icon: LucideIcon
  color: string
  bg: string
}

const SCAN_TYPES: ScanTypeConfig[] = [
  { slug: 'apology-letter',   title: 'Apology Letter',          description: 'Process student apology letters and save to discipline records.',   icon: FileText,     color: 'text-[#FF0A6C]',    bg: 'bg-[#FF0A6C]/10'   },
  { slug: 'class-mark-sheet', title: 'Class Mark Sheet',         description: 'Upload mark sheets and extract student scores automatically.',       icon: Table2,       color: 'text-[#2D27FF]',    bg: 'bg-[#2D27FF]/10'   },
  { slug: 'student-photo',    title: 'Student Photo Update',     description: 'Update student profile photos from uploaded images.',                icon: UserCircle,   color: 'text-purple-400',   bg: 'bg-purple-500/10'  },
  { slug: 'fee-receipt',      title: 'Fee Receipt',              description: 'Scan fee receipts and match to student fee records.',                icon: Receipt,      color: 'text-emerald-400',  bg: 'bg-emerald-500/10' },
  { slug: 'mpesa-screenshot', title: 'M-Pesa Screenshot',        description: 'Extract M-Pesa transaction details from screenshots.',               icon: Smartphone,   color: 'text-[#00E1FD]',    bg: 'bg-[#00E1FD]/10'   },
  { slug: 'fee-schedule',     title: 'Fee Schedule Document',    description: 'Upload fee schedule documents for record keeping.',                  icon: CalendarDays, color: 'text-orange-400',   bg: 'bg-orange-500/10'  },
  { slug: 'hod-report',       title: 'HOD Report / Minutes',     description: 'Scan HOD reports and department minutes into the system.',            icon: ClipboardList,color: 'text-[#FF0A6C]',    bg: 'bg-[#FF0A6C]/10'   },
  { slug: 'official-letter',  title: 'Official Letter',          description: 'Scan official letters and file into document inbox.',                icon: Mail,         color: 'text-[#2D27FF]',    bg: 'bg-[#2D27FF]/10'   },
  { slug: 'any-document',     title: 'Any Document',             description: 'Scan any document for general filing and reference.',                icon: ScanLine,     color: 'text-gray-400',     bg: 'bg-gray-700/30'    },
]

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanState = 'idle' | 'success' | 'error'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScannerTypePage() {
  const router = useRouter()
  const params = useParams()
  const type = params.type as string

  const config = SCAN_TYPES.find((t) => t.slug === type)

  const [scanState, setScanState] = useState<ScanState>('idle')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [extractedData, setExtractedData] = useState<Record<string, unknown> | null>(null)
  const [inboxId, setInboxId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  if (!config) {
    return (
      <div className="bg-[#0f111a] min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">Scanner not found</p>
          <button
            onClick={() => router.push('/dashboard/scanner')}
            className="text-[#FF0A6C] hover:underline text-sm"
          >
            Back to Scanner
          </button>
        </div>
      </div>
    )
  }

  async function handleScanComplete(result: ScanResult) {
    setIsProcessing(true)
    try {
      const {
        data: { user },
      } = await createClient().auth.getUser()

      const response = await fetch('/api/scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: result.base64,
          mimeType: result.mimeType,
          documentType: type,
          userId: user?.id,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setExtractedData(data.data)
        setInboxId(data.inboxId)
        setScanState('success')
      } else {
        setScanState('error')
        setErrorMessage(data.error || 'Failed to process document')
      }
    } catch {
      setScanState('error')
      setErrorMessage('Network error. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleSave() {
    if (!extractedData) return
    setIsSaving(true)
    try {
      const {
        data: { user },
      } = await createClient().auth.getUser()

      const response = await fetch(`/api/scanner/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractedData,
          inboxId,
          userId: user?.id,
        }),
      })

      const data = await response.json()
      if (data.success) {
        router.push('/dashboard/scanner')
      } else {
        setErrorMessage(data.error || 'Failed to save document')
      }
    } catch {
      setErrorMessage('Network error while saving. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  function resetScan() {
    setScanState('idle')
    setExtractedData(null)
    setInboxId(null)
    setErrorMessage('')
  }

  return (
    <div className="bg-[#0f111a] min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Scanner
        </button>

        {/* Page header */}
        <h1 className="text-white font-display text-xl font-semibold">{config.title}</h1>
        <p className="text-gray-500 text-sm mt-1 mb-6">{config.description}</p>

        {/* Scanner with processing overlay */}
        <div className="relative">
          <DocumentScanner
            documentType={type}
            title={config.title}
            onScanComplete={handleScanComplete}
          />

          {isProcessing && (
            <div className="absolute inset-0 bg-[#0f111a]/90 rounded-2xl flex flex-col items-center justify-center z-10">
              <div className="animate-spin w-8 h-8 border-2 border-[#FF0A6C] border-t-transparent rounded-full mb-4" />
              <p className="text-gray-300 text-sm">Gemini is reading your document...</p>
              <p className="text-gray-500 text-xs mt-1">This usually takes 3–5 seconds</p>
            </div>
          )}
        </div>

        {/* Success panel */}
        {scanState === 'success' && extractedData && (
          <div className="bg-[#161925] border border-gray-800 rounded-3xl p-6 mt-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="w-6 h-6 text-emerald-500" />
              <span className="text-white font-medium">Document Processed Successfully</span>
            </div>

            {Object.entries(extractedData).map(([key, value]) => (
              <div key={key} className="bg-[#1f2333] rounded-xl p-4 mb-3">
                <p className="text-gray-500 text-xs capitalize">
                  {key.replace(/_/g, ' ')}
                </p>
                <p className="text-white text-sm mt-1">
                  {Array.isArray(value)
                    ? value.join(', ')
                    : typeof value === 'object' && value !== null
                    ? JSON.stringify(value)
                    : String(value ?? '')}
                </p>
              </div>
            ))}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] text-white rounded-2xl py-3 text-sm font-medium shadow-[0_0_15px_rgba(255,10,108,0.3)] disabled:opacity-50 transition-opacity"
              >
                {isSaving ? 'Saving...' : 'Save to System'}
              </button>
              <button
                onClick={resetScan}
                className="flex-1 border border-gray-700 text-gray-300 hover:bg-white/5 rounded-2xl py-3 text-sm transition-colors"
              >
                Scan Another
              </button>
            </div>
          </div>
        )}

        {/* Error panel */}
        {scanState === 'error' && (
          <div className="bg-[#FF0A6C]/10 border border-[#FF0A6C]/30 rounded-2xl p-4 mt-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#FF0A6C] mt-0.5 shrink-0" />
            <div>
              <p className="text-[#FF0A6C] text-sm font-medium">Processing failed</p>
              <p className="text-gray-400 text-xs mt-1">{errorMessage}</p>
              <button
                onClick={resetScan}
                className="mt-3 text-[#FF0A6C] text-sm hover:underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
