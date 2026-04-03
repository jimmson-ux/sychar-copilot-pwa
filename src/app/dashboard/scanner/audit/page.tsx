'use client'

export const dynamic = 'force-dynamic'


import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { BarChart2, Filter, Eye, AlertTriangle } from 'lucide-react'


interface AuditRecord {
  id: string
  document_type: string
  status: string
  scanned_at: string
  raw_extracted_json: Record<string, unknown> | null
  uploaded_by: string
  staff_name?: string
  staff_role?: string
  confidence?: number
}

interface StaffMember { id: string; full_name: string; user_id: string }

const DOC_TYPE_LABELS: Record<string, string> = {
  'apology-letter': 'Apology Letter',
  'mark-sheet': 'Mark Sheet',
  'fee-receipt': 'Fee Receipt',
  'mpesa-batch': 'M-Pesa',
  'fee-schedule': 'Fee Schedule',
  'hod-report': 'HOD Report',
}

const DOC_TYPE_COLORS: Record<string, string> = {
  'apology-letter': 'bg-purple-500/20 text-purple-400',
  'mark-sheet':     'bg-[#2D27FF]/20 text-[#2D27FF]',
  'fee-receipt':    'bg-amber-500/20 text-amber-400',
  'mpesa-batch':    'bg-[#00E1FD]/20 text-[#00E1FD]',
  'fee-schedule':   'bg-orange-500/20 text-orange-400',
  'hod-report':     'bg-emerald-500/20 text-emerald-400',
}

function ConfidenceBar({ value }: { value: number | undefined }) {
  if (value === undefined) return <span className="text-gray-600 text-xs">—</span>
  const pct = Math.round(value * 100)
  const color = value > 0.8 ? 'bg-emerald-500' : value >= 0.5 ? 'bg-orange-500' : 'bg-[#FF0A6C]'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-gray-500 text-xs">{pct}%</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    saved:          'bg-emerald-500/20 text-emerald-500',
    processed:      'bg-orange-500/20 text-orange-400',
    pending_review: 'bg-orange-500/20 text-orange-400',
  }
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${map[status] ?? 'bg-gray-700/30 text-gray-400'}`}>
      {status === 'saved' ? 'Saved' : status === 'processed' ? 'Processed' : status}
    </span>
  )
}

export default function AuditPage() {
  const router = useRouter()
  const [records, setRecords] = useState<AuditRecord[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(true)
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [docTypeFilter, setDocTypeFilter] = useState('')
  const [staffFilter, setStaffFilter] = useState('')
  const [confFilter, setConfFilter] = useState('')

  // Summary
  const today = new Date().toISOString().slice(0, 10)
  const todayRecords = records.filter((r) => r.scanned_at.startsWith(today))
  const highConf = records.filter((r) => (r.confidence ?? 0) > 0.8)
  const lowConf = records.filter((r) => r.confidence !== undefined && r.confidence < 0.5)
  const mostActive = (() => {
    const counts: Record<string, number> = {}
    for (const r of records) counts[r.staff_name ?? r.uploaded_by] = (counts[r.staff_name ?? r.uploaded_by] ?? 0) + 1
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return top ? top[0] : '—'
  })()

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      createClient().from('staff_records').select('sub_role').eq('user_id', user.id).single()
        .then(({ data }) => {
          if (data?.sub_role !== 'principal') { setAuthorized(false); router.replace('/dashboard/scanner'); return }
          fetchStaff()
          fetchRecords()
        })
    })
  }, [router])

  async function fetchStaff() {
    const { data } = await createClient().from('staff_records').select('id, full_name, user_id')
    setStaffList((data ?? []) as StaffMember[])
  }

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    let q = createClient()
      .from('document_inbox')
      .select('id, document_type, status, scanned_at, raw_extracted_json, uploaded_by')
      .order('scanned_at', { ascending: false })
      .limit(200)

    if (dateFrom) q = q.gte('scanned_at', dateFrom)
    if (dateTo)   q = q.lte('scanned_at', dateTo + 'T23:59:59')
    if (docTypeFilter) q = q.eq('document_type', docTypeFilter)
    if (staffFilter)   q = q.eq('uploaded_by', staffFilter)

    const { data } = await q
    const rows = (data ?? []) as AuditRecord[]

    // Enrich with staff name and confidence
    const enriched = rows.map((r) => {
      const staff = staffList.find((s) => s.user_id === r.uploaded_by)
      const conf = r.raw_extracted_json && typeof r.raw_extracted_json === 'object'
        ? (r.raw_extracted_json.confidence as number | undefined)
        : undefined
      return { ...r, staff_name: staff?.full_name ?? 'Unknown', confidence: conf }
    }).filter((r) => {
      if (!confFilter) return true
      if (confFilter === 'high') return (r.confidence ?? 0) > 0.8
      if (confFilter === 'medium') return (r.confidence ?? 0) >= 0.5 && (r.confidence ?? 0) <= 0.8
      if (confFilter === 'low') return (r.confidence ?? 1) < 0.5
      return true
    })

    setRecords(enriched)
    setLoading(false)
  }, [dateFrom, dateTo, docTypeFilter, staffFilter, confFilter, staffList])

  if (!authorized) return null

  const inputCls = 'bg-[#f9fafb] border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-[var(--role-primary,#0891b2)] transition-colors'

  return (
    <div className="bg-[#f8fafc] min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-gray-900 font-display text-xl font-semibold">Scan Audit Report</h1>
            <p className="text-gray-500 text-xs mt-0.5">Review all document scans, confidence levels, and outcomes.</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Scans Today',        value: todayRecords.length,               cls: 'text-gray-900' },
            { label: 'High Confidence',    value: `${records.length ? Math.round(highConf.length / records.length * 100) : 0}%`, cls: 'text-emerald-500' },
            { label: 'Low Confidence',     value: lowConf.length,                    cls: lowConf.length > 5 ? 'text-[#FF0A6C]' : 'text-orange-400' },
            { label: 'Most Active User',   value: mostActive,                        cls: 'text-[#00E1FD] text-sm' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-white border border-gray-100 rounded-2xl p-4">
              <p className="text-gray-500 text-xs mb-1">{label}</p>
              <p className={`text-2xl font-bold font-display ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-100 rounded-3xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-gray-500 text-sm font-medium">Filters</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="text-gray-500 text-xs mb-1 block">From</label>
              <input type="date" className={inputCls} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1 block">To</label>
              <input type="date" className={inputCls} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1 block">Document Type</label>
              <select className={inputCls} value={docTypeFilter} onChange={(e) => setDocTypeFilter(e.target.value)}>
                <option value="">All types</option>
                {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1 block">Staff Member</label>
              <select className={inputCls} value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
                <option value="">All staff</option>
                {staffList.map((s) => (
                  <option key={s.user_id} value={s.user_id}>{s.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-1 block">Confidence</label>
              <select className={inputCls} value={confFilter} onChange={(e) => setConfFilter(e.target.value)}>
                <option value="">All</option>
                <option value="high">High (&gt;80%)</option>
                <option value="medium">Medium (50–80%)</option>
                <option value="low">Low (&lt;50%)</option>
              </select>
            </div>
          </div>
          <button onClick={fetchRecords}
            className="mt-3 bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] text-white rounded-xl px-5 py-2 text-sm font-medium">
            Apply Filters
          </button>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-[#FF0A6C] border-t-transparent rounded-full" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12">
              <BarChart2 className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No scan records found</p>
            </div>
          ) : (
            <table className="w-full text-xs sm:text-sm min-w-[700px]">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="py-3 text-left font-semibold">Timestamp</th>
                  <th className="py-3 text-left font-semibold">User</th>
                  <th className="py-3 text-left font-semibold">Document Type</th>
                  <th className="py-3 text-left font-semibold">Confidence</th>
                  <th className="py-3 text-left font-semibold">Outcome</th>
                  <th className="py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100/50 hover:bg-gray-50">
                    <td className="py-3 text-gray-400">
                      {new Date(r.scanned_at).toLocaleDateString()}{' '}
                      <span className="text-gray-600">{new Date(r.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="py-3 text-gray-600">{r.staff_name}</td>
                    <td className="py-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${DOC_TYPE_COLORS[r.document_type] ?? 'bg-gray-700/30 text-gray-400'}`}>
                        {DOC_TYPE_LABELS[r.document_type] ?? r.document_type}
                      </span>
                    </td>
                    <td className="py-3"><ConfidenceBar value={r.confidence} /></td>
                    <td className="py-3"><StatusBadge status={r.status} /></td>
                    <td className="py-3">
                      <button onClick={() => setSelectedRecord(r)}
                        className="flex items-center gap-1 text-[#2D27FF] hover:text-blue-400 text-xs transition-colors">
                        <Eye className="w-3 h-3" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* JSON viewer modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-100 rounded-3xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-gray-500" />
                <span className="text-gray-900 font-display font-semibold text-sm">
                  {DOC_TYPE_LABELS[selectedRecord.document_type] ?? selectedRecord.document_type} — Extracted Data
                </span>
              </div>
              <button onClick={() => setSelectedRecord(null)}
                className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button>
            </div>
            <div className="bg-[#f9fafb] rounded-xl p-4 font-mono text-xs text-gray-600 overflow-auto">
              <pre>{JSON.stringify(selectedRecord.raw_extracted_json, null, 2)}</pre>
            </div>
            <div className="mt-4 flex justify-between text-xs text-gray-500">
              <span>Scanned by {selectedRecord.staff_name}</span>
              <span>{new Date(selectedRecord.scanned_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
