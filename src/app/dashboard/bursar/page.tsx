'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeePayment {
  id: string
  student_id: string
  student_name: string
  amount: number
  payment_date: string
  receipt_number: string | null
  payment_method: string | null
  term: string
  academic_year: string
  balance_after: number | null
}

interface StudentFee {
  id: string
  full_name: string
  admission_number: string | null
  class_name: string | null
  fee_balance: number | null
}

interface MpesaTx {
  id: string
  phone_number: string | null
  amount: number
  mpesa_ref: string
  description: string | null
  status: string
  created_at: string
}

interface Alert {
  id: string
  type: string
  title: string
  severity: string
  created_at: string
}

interface Overview {
  term: string
  academic_year: string
  total_collected: number
  expected_total: number
  collection_rate: number
  defaulters: number
  total_students: number
  recent_payments: FeePayment[]
  students: StudentFee[]
  mpesa_log: MpesaTx[]
  alerts: Alert[]
}

type Tab = 'summary' | 'payments' | 'defaulters' | 'mpesa' | 'alerts'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `KSH ${n.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function csvDownload(rows: string[][], filename: string) {
  const content = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([content], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BursarDashboard() {
  const router = useRouter()

  const [tab, setTab]           = useState<Tab>('summary')
  const [data, setData]         = useState<Overview | null>(null)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [searching, setSearching] = useState(false)
  const [term, setTerm]         = useState('')
  const [year, setYear]         = useState('')

  const load = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q)    params.set('search', q)
      if (term) params.set('term', term)
      if (year) params.set('year', year)
      const res = await fetch(`/api/bursar/overview?${params}`)
      if (res.status === 401) { router.push('/login'); return }
      if (res.status === 403) { router.push('/dashboard'); return }
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
      setSearching(false)
    }
  }, [term, year, router])

  useEffect(() => { load() }, [load])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearching(true)
    load(search)
  }

  function exportPayments() {
    if (!data) return
    const rows: string[][] = [
      ['Receipt #', 'Student', 'Amount (KSH)', 'Method', 'Date', 'Balance After'],
      ...data.recent_payments.map(p => [
        p.receipt_number ?? '-',
        p.student_name,
        String(p.amount),
        p.payment_method ?? '-',
        fmtDate(p.payment_date),
        p.balance_after != null ? String(p.balance_after) : '-',
      ])
    ]
    csvDownload(rows, `fee-payments-term${data.term}-${data.academic_year}.csv`)
  }

  function exportDefaulters() {
    if (!data) return
    const rows: string[][] = [
      ['Admission #', 'Student', 'Class', 'Balance (KSH)'],
      ...data.students
        .filter(s => (s.fee_balance ?? 0) > 0)
        .map(s => [
          s.admission_number ?? '-',
          s.full_name,
          s.class_name ?? '-',
          String(s.fee_balance ?? 0),
        ])
    ]
    csvDownload(rows, `defaulters-term${data.term}-${data.academic_year}.csv`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bursar Dashboard</h1>
          {data && (
            <p className="text-sm text-gray-500 mt-0.5">
              Term {data.term} · {data.academic_year}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={term}
            onChange={e => setTerm(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Current Term</option>
            <option value="1">Term 1</option>
            <option value="2">Term 2</option>
            <option value="3">Term 3</option>
          </select>
          <select
            value={year}
            onChange={e => setYear(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">This Year</option>
            {[2024, 2025, 2026].map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Alerts banner */}
      {data && data.alerts.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2">
          <span className="text-amber-600 text-sm font-medium">
            {data.alerts.length} unresolved alert{data.alerts.length !== 1 ? 's' : ''}:
          </span>
          <span className="text-amber-700 text-sm">{data.alerts[0].title}</span>
          {data.alerts.length > 1 && (
            <button onClick={() => setTab('alerts')} className="text-amber-600 text-sm underline ml-1">
              view all
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b px-6">
        <nav className="flex gap-0 -mb-px">
          {(['summary', 'payments', 'defaulters', 'mpesa', 'alerts'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'summary'    ? 'Summary'        :
               t === 'payments'   ? 'Fee Payments'   :
               t === 'defaulters' ? 'Defaulters'     :
               t === 'mpesa'      ? 'M-Pesa Log'     : 'Alerts'}
              {t === 'alerts' && data && data.alerts.length > 0 && (
                <span className="ml-1.5 bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 text-xs">
                  {data.alerts.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto p-6">
        {loading && (
          <div className="flex items-center justify-center h-48 text-gray-400">
            Loading...
          </div>
        )}

        {!loading && !data && (
          <div className="text-center text-red-500 py-16">Failed to load data.</div>
        )}

        {/* ── SUMMARY TAB ─────────────────────────────────────────────────── */}
        {!loading && data && tab === 'summary' && (
          <div className="space-y-6">
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total Collected</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {fmt(data.total_collected)}
                </p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Collection Rate</p>
                <p className={`text-2xl font-bold mt-1 ${
                  data.collection_rate >= 80 ? 'text-green-600' :
                  data.collection_rate >= 50 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {data.collection_rate}%
                </p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Defaulters</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{data.defaulters}</p>
                <p className="text-xs text-gray-400 mt-0.5">of {data.total_students} enrolled</p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Expected Revenue</p>
                <p className="text-2xl font-bold text-gray-700 mt-1">
                  {fmt(data.expected_total)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">KSH 15,000 × {data.total_students}</p>
              </div>
            </div>

            {/* Collection progress bar */}
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800">Term {data.term} Collection Progress</h2>
                <span className="text-sm text-gray-500">{fmt(data.total_collected)} of {fmt(data.expected_total)}</span>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-4 rounded-full transition-all ${
                    data.collection_rate >= 80 ? 'bg-green-500' :
                    data.collection_rate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(100, data.collection_rate)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Outstanding: {fmt(Math.max(0, data.expected_total - data.total_collected))}
              </p>
            </div>

            {/* Recent payments */}
            <div className="bg-white rounded-xl border p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">Recent Payments</h2>
                <button
                  onClick={() => setTab('payments')}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View all →
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="pb-2">Student</th>
                    <th className="pb-2">Amount</th>
                    <th className="pb-2">Method</th>
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.recent_payments.slice(0, 10).map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="py-2 font-medium text-gray-800">{p.student_name}</td>
                      <td className="py-2 text-green-700 font-semibold">{fmt(p.amount)}</td>
                      <td className="py-2 text-gray-500 capitalize">{p.payment_method ?? '—'}</td>
                      <td className="py-2 text-gray-500">{fmtDate(p.payment_date)}</td>
                      <td className="py-2 text-gray-400 font-mono text-xs">{p.receipt_number ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PAYMENTS TAB ────────────────────────────────────────────────── */}
        {!loading && data && tab === 'payments' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">
                Fee Payments — Term {data.term} · {data.academic_year}
              </h2>
              <button
                onClick={exportPayments}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
              >
                Export CSV
              </button>
            </div>
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left text-xs text-gray-500">
                    <th className="px-4 py-3">Receipt #</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Balance After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.recent_payments.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-400">{p.receipt_number ?? '—'}</td>
                      <td className="px-4 py-2 font-medium text-gray-800">{p.student_name}</td>
                      <td className="px-4 py-2 text-green-700 font-semibold">{fmt(p.amount)}</td>
                      <td className="px-4 py-2 text-gray-500 capitalize">{p.payment_method ?? '—'}</td>
                      <td className="px-4 py-2 text-gray-500">{fmtDate(p.payment_date)}</td>
                      <td className={`px-4 py-2 font-medium ${(p.balance_after ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {p.balance_after != null ? fmt(p.balance_after) : '—'}
                      </td>
                    </tr>
                  ))}
                  {data.recent_payments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        No payments recorded for this term.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DEFAULTERS TAB ──────────────────────────────────────────────── */}
        {!loading && data && tab === 'defaulters' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 justify-between">
              <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-md">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or admission number..."
                  className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {searching ? '...' : 'Search'}
                </button>
              </form>
              <button
                onClick={exportDefaulters}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
              >
                Export CSV
              </button>
            </div>

            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left text-xs text-gray-500">
                    <th className="px-4 py-3">Admission #</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Fee Balance (KSH)</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.students.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">{s.admission_number ?? '—'}</td>
                      <td className="px-4 py-2 font-medium text-gray-800">{s.full_name}</td>
                      <td className="px-4 py-2 text-gray-500">{s.class_name ?? '—'}</td>
                      <td className={`px-4 py-2 font-semibold ${(s.fee_balance ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {fmt(s.fee_balance ?? 0)}
                      </td>
                      <td className="px-4 py-2">
                        {(s.fee_balance ?? 0) <= 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Cleared</span>
                        ) : (s.fee_balance ?? 0) > 10000 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">High Arrears</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">Partial</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.students.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                        No students found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── M-PESA LOG TAB ──────────────────────────────────────────────── */}
        {!loading && data && tab === 'mpesa' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-800">M-Pesa Transactions Log</h2>
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left text-xs text-gray-500">
                    <th className="px-4 py-3">M-Pesa Ref</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.mpesa_log.map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-600">{tx.mpesa_ref}</td>
                      <td className="px-4 py-2 text-gray-500">{tx.phone_number ?? '—'}</td>
                      <td className="px-4 py-2 font-semibold text-green-700">{tx.amount > 0 ? fmt(tx.amount) : '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          tx.status === 'success'   ? 'bg-green-100 text-green-700' :
                          tx.status === 'failed'    ? 'bg-red-100 text-red-700' :
                          tx.status === 'unmatched' ? 'bg-amber-100 text-amber-700' :
                                                      'bg-gray-100 text-gray-600'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-500 max-w-xs truncate">{tx.description ?? '—'}</td>
                      <td className="px-4 py-2 text-gray-400">{fmtDate(tx.created_at)}</td>
                    </tr>
                  ))}
                  {data.mpesa_log.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        No M-Pesa transactions yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Unmatched transactions warning */}
            {data.mpesa_log.some(t => t.status === 'unmatched') && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-amber-800 text-sm font-medium">
                  Unmatched Transactions Detected
                </p>
                <p className="text-amber-700 text-sm mt-1">
                  Some M-Pesa payments could not be matched to a student admission number.
                  These require manual reconciliation. Check the description field for the account reference used.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── ALERTS TAB ──────────────────────────────────────────────────── */}
        {!loading && data && tab === 'alerts' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-800">Financial Alerts</h2>
            {data.alerts.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
                No active alerts. All clear.
              </div>
            ) : (
              <div className="space-y-3">
                {data.alerts.map(a => (
                  <div
                    key={a.id}
                    className={`bg-white border-l-4 rounded-lg p-4 ${
                      a.severity === 'high'   ? 'border-red-500' :
                      a.severity === 'medium' ? 'border-amber-500' :
                                                'border-blue-400'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-800">{a.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {a.type} · {fmtDate(a.created_at)}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        a.severity === 'high'   ? 'bg-red-100 text-red-700' :
                        a.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                                                  'bg-blue-100 text-blue-700'
                      }`}>
                        {a.severity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
