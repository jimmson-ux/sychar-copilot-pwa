'use client'

export const dynamic = 'force-dynamic'


import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  FileText, Table2, UserCircle, Receipt, Smartphone, CalendarDays,
  ClipboardList, Mail, ScanLine, ChevronRight, type LucideIcon,
} from 'lucide-react'


// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanTypeConfig {
  slug: string
  title: string
  description: string
  icon: LucideIcon
  color: string
  bg: string
}

interface InboxRecord {
  id: string
  document_type: string
  status: string
  scanned_at: string
  raw_extracted_json?: Record<string, unknown> | null
}

// ── Scan type catalogue ────────────────────────────────────────────────────────

const SCAN_TYPES: ScanTypeConfig[] = [
  {
    slug: 'apology-letter',
    title: 'Apology Letter',
    description: 'Process student apology letters and save to discipline records.',
    icon: FileText,
    color: 'text-[#FF0A6C]',
    bg: 'bg-[#FF0A6C]/10',
  },
  {
    slug: 'class-mark-sheet',
    title: 'Class Mark Sheet',
    description: 'Upload mark sheets and extract student scores automatically.',
    icon: Table2,
    color: 'text-[#2D27FF]',
    bg: 'bg-[#2D27FF]/10',
  },
  {
    slug: 'student-photo',
    title: 'Student Photo Update',
    description: 'Update student profile photos from uploaded images.',
    icon: UserCircle,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
  },
  {
    slug: 'fee-receipt',
    title: 'Fee Receipt',
    description: 'Scan fee receipts and match to student fee records.',
    icon: Receipt,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  {
    slug: 'mpesa-screenshot',
    title: 'M-Pesa Screenshot',
    description: 'Extract M-Pesa transaction details from screenshots.',
    icon: Smartphone,
    color: 'text-[#00E1FD]',
    bg: 'bg-[#00E1FD]/10',
  },
  {
    slug: 'fee-schedule',
    title: 'Fee Schedule Document',
    description: 'Upload fee schedule documents for record keeping.',
    icon: CalendarDays,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
  },
  {
    slug: 'hod-report',
    title: 'HOD Report / Minutes',
    description: 'Scan HOD reports and department minutes into the system.',
    icon: ClipboardList,
    color: 'text-[#FF0A6C]',
    bg: 'bg-[#FF0A6C]/10',
  },
  {
    slug: 'official-letter',
    title: 'Official Letter',
    description: 'Scan official letters and file into document inbox.',
    icon: Mail,
    color: 'text-[#2D27FF]',
    bg: 'bg-[#2D27FF]/10',
  },
  {
    slug: 'any-document',
    title: 'Any Document',
    description: 'Scan any document for general filing and reference.',
    icon: ScanLine,
    color: 'text-gray-400',
    bg: 'bg-gray-700/30',
  },
]

// ── Role → slug mapping ────────────────────────────────────────────────────────

const ALL_SLUGS = SCAN_TYPES.map((s) => s.slug)

const ROLE_SLUGS: Record<string, string[]> = {
  class_teacher:          ['apology-letter', 'class-mark-sheet', 'student-photo'],
  bursar:                 ['fee-receipt', 'mpesa-screenshot', 'fee-schedule'],
  hod_subjects:           ['hod-report', 'class-mark-sheet', 'student-photo'],
  hod_pathways:           ['hod-report', 'class-mark-sheet', 'student-photo'],
  dean_of_studies:        ['hod-report', 'apology-letter', 'official-letter', 'student-photo'],
  deputy_dean_of_studies: ['hod-report', 'apology-letter', 'official-letter', 'student-photo'],
  dean_of_students:       ['apology-letter', 'student-photo', 'official-letter'],
  deputy_principal:       ['apology-letter', 'class-mark-sheet', 'student-photo', 'fee-receipt', 'mpesa-screenshot', 'hod-report', 'official-letter'],
  principal:              ALL_SLUGS,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDocType(slug: string): string {
  return (
    SCAN_TYPES.find((s) => s.slug === slug)?.title ??
    slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    processed:      { cls: 'bg-orange-500/20 text-orange-500',   label: 'Processed' },
    pending_review: { cls: 'bg-orange-500/20 text-orange-500',   label: 'Pending Review' },
    saved:          { cls: 'bg-[#2D27FF]/20 text-[#2D27FF]',     label: 'Saved' },
    success:        { cls: 'bg-emerald-500/20 text-emerald-500', label: 'Processed' },
  }
  const { cls, label } = map[status] ?? { cls: 'bg-gray-700/30 text-gray-400', label: status }
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${cls}`}>
      {label}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const router = useRouter()
  const [subRole, setSubRole] = useState<string | null>(null)
  const [history, setHistory] = useState<InboxRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await createClient().auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      const { data: staff } = await createClient()
        .from('staff_records')
        .select('sub_role')
        .eq('user_id', user.id)
        .single()

      setSubRole(staff?.sub_role ?? 'principal')

      const { data: inbox } = await createClient()
        .from('document_inbox')
        .select('id, document_type, status, scanned_at, raw_extracted_json')
        .eq('uploaded_by', user.id)
        .order('scanned_at', { ascending: false })
        .limit(20)

      setHistory(inbox ?? [])
      setLoading(false)
    }
    init()
  }, [])

  const allowedSlugs = subRole ? (ROLE_SLUGS[subRole] ?? ALL_SLUGS) : ALL_SLUGS
  const visibleTypes = SCAN_TYPES.filter((t) => allowedSlugs.includes(t.slug))

  return (
    <div className="bg-[#f8fafc] min-h-screen text-gray-600 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <h1 className="text-gray-900 font-display text-2xl font-semibold">Document Scanner</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload or photograph a document and Gemini will read it for you.
        </p>

        {loading ? (
          <div className="mt-10 flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-[#FF0A6C] border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Scan type cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              {visibleTypes.map((type) => {
                const Icon = type.icon
                return (
                  <div
                    key={type.slug}
                    onClick={() => router.push(`/dashboard/scanner/${type.slug}`)}
                    className="bg-white border border-gray-100 rounded-3xl p-6 relative cursor-pointer
                      hover:border-gray-200 hover:bg-[#f9fafb] transition-all duration-200 group"
                  >
                    <div
                      className={`w-14 h-14 rounded-2xl ${type.bg} flex items-center justify-center mb-4`}
                    >
                      <Icon className={`${type.color} w-7 h-7`} />
                    </div>
                    <h3 className="text-gray-900 font-medium text-base font-display mb-1">
                      {type.title}
                    </h3>
                    <p className="text-gray-500 text-xs leading-relaxed">{type.description}</p>
                    <ChevronRight
                      className="absolute top-6 right-6 w-4 h-4 text-gray-700 group-hover:text-[#FF0A6C] transition-colors"
                    />
                  </div>
                )
              })}
            </div>

            {/* Scan history */}
            <div className="mt-10">
              <h2 className="text-gray-900 font-display font-semibold">Scan History</h2>
              <p className="text-gray-500 text-xs mt-1 mb-4">Your last 20 scanned documents</p>

              <div className="bg-white border border-gray-100 rounded-3xl p-6 overflow-x-auto">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <ScanLine className="w-12 h-12 text-gray-700 mb-3" />
                    <p className="text-gray-500 text-sm">No documents scanned yet</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs sm:text-sm min-w-[600px]">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-100">
                        <th className="py-3 font-semibold">Document Type</th>
                        <th className="py-3 font-semibold">Date &amp; Time</th>
                        <th className="py-3 font-semibold">Confidence</th>
                        <th className="py-3 font-semibold">Status</th>
                        <th className="py-3 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item, i) => {
                        const conf = item.raw_extracted_json && typeof item.raw_extracted_json === 'object'
                          ? (item.raw_extracted_json.confidence as number | undefined)
                          : undefined
                        const docColors: Record<string, string> = {
                          'apology-letter': 'bg-purple-500/20 text-purple-400',
                          'mark-sheet':     'bg-[#2D27FF]/20 text-[#2D27FF]',
                          'fee-receipt':    'bg-amber-500/20 text-amber-400',
                          'mpesa-batch':    'bg-[#00E1FD]/20 text-[#00E1FD]',
                          'fee-schedule':   'bg-orange-500/20 text-orange-400',
                          'hod-report':     'bg-emerald-500/20 text-emerald-400',
                        }
                        const badgeCls = docColors[item.document_type] ?? 'bg-gray-700/30 text-gray-400'
                        return (
                          <tr
                            key={item.id}
                            className={`hover:bg-gray-50 border-b border-gray-100/50 ${
                              i === history.length - 1 ? 'border-0' : ''
                            }`}
                          >
                            <td className="py-3">
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${badgeCls}`}>
                                {formatDocType(item.document_type)}
                              </span>
                            </td>
                            <td className="py-3 text-gray-400">
                              {new Date(item.scanned_at).toLocaleDateString()}{' '}
                              <span className="text-gray-600 text-xs">
                                {new Date(item.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </td>
                            <td className="py-3">
                              {conf !== undefined ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${conf > 0.8 ? 'bg-emerald-500' : conf >= 0.5 ? 'bg-orange-500' : 'bg-[#FF0A6C]'}`}
                                      style={{ width: `${Math.round(conf * 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-gray-500 text-xs">{Math.round(conf * 100)}%</span>
                                </div>
                              ) : (
                                <span className="text-gray-600 text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3">
                              <StatusBadge status={item.status} />
                            </td>
                            <td className="py-3">
                              <button
                                onClick={() => router.push(`/dashboard/scanner/${item.document_type}`)}
                                className="text-[#2D27FF] hover:text-blue-400 text-xs transition-colors"
                              >
                                Rescan
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
