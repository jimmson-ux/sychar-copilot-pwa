'use client'

// Canteen Terminal — tablet-friendly PWA page
// Route: /canteen
// Auth required: staff (canteen_staff, bursar, principal, deputy)
// Flow:  Enter student ID → show name + photo + balance → enter amount → confirm → receipt

export const dynamic = 'force-dynamic'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WalletInfo {
  wallet_id: string
  student_id: string
  student_name: string
  class_name: string | null
  photo_url: string | null
  balance: number
  daily_limit: number
  today_spend: number
  available: number
  is_frozen: boolean
  last_topup_at: string | null
}

interface TxResult {
  ok: boolean
  balance_after: number
  amount: number
  timestamp: string
}

interface TxError {
  error: string
  balance?: number
  requested?: number
  shortfall?: number
  daily_limit?: number
  today_spend?: number
  available_today?: number
  frozen?: boolean
}

type Stage = 'lookup' | 'wallet' | 'amount' | 'confirm' | 'receipt' | 'error'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `KSH ${n.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StudentCard({ w }: { w: WalletInfo }) {
  return (
    <div className="flex items-center gap-4">
      {w.photo_url ? (
        <img
          src={w.photo_url}
          alt={w.student_name}
          className="w-16 h-16 rounded-full object-cover border-2 border-white shadow"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600 border-2 border-white shadow">
          {w.student_name.charAt(0).toUpperCase()}
        </div>
      )}
      <div>
        <p className="text-xl font-bold text-gray-900">{w.student_name}</p>
        {w.class_name && <p className="text-sm text-gray-500">{w.class_name}</p>}
      </div>
    </div>
  )
}

function BalancePill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`rounded-xl p-3 text-center ${color}`}>
      <p className="text-xs font-medium opacity-75 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CanteenTerminal() {
  const router = useRouter()

  const [stage, setStage]         = useState<Stage>('lookup')
  const [studentId, setStudentId] = useState('')
  const [wallet, setWallet]       = useState<WalletInfo | null>(null)
  const [amount, setAmount]       = useState('')
  const [description, setDesc]    = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<TxError | null>(null)
  const [receipt, setReceipt]     = useState<TxResult | null>(null)
  const [lookupErr, setLookupErr] = useState('')

  const studentIdRef = useRef<HTMLInputElement>(null)
  const amountRef    = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (stage === 'lookup') studentIdRef.current?.focus()
    if (stage === 'amount') amountRef.current?.focus()
  }, [stage])

  // ── Step 1: Look up student ──────────────────────────────────────────────

  const lookupStudent = useCallback(async (id: string) => {
    if (!id.trim()) return
    setLoading(true)
    setLookupErr('')
    try {
      const res = await fetch(`/api/wallet/${encodeURIComponent(id.trim())}`)
      if (res.status === 401) { router.push('/login'); return }
      if (!res.ok) {
        const j = await res.json()
        setLookupErr(j.error ?? 'Student not found')
        return
      }
      const w = await res.json() as WalletInfo
      setWallet(w)
      setStage('wallet')
    } catch {
      setLookupErr('Network error — check connection')
    } finally {
      setLoading(false)
    }
  }, [router])

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    lookupStudent(studentId)
  }

  // ── Step 3: Confirm purchase ─────────────────────────────────────────────

  const confirmPurchase = async () => {
    if (!wallet || !amount) return
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/wallet/transaction', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          student_id:  wallet.student_id,
          amount:      amt,
          description: description.trim() || 'Canteen purchase',
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json as TxError)
        setStage('error')
        return
      }
      setReceipt(json as TxResult)
      setStage('receipt')
    } catch {
      setError({ error: 'Network error — transaction not processed' })
      setStage('error')
    } finally {
      setLoading(false)
    }
  }

  // ── Reset for next transaction ───────────────────────────────────────────

  const reset = () => {
    setStage('lookup')
    setStudentId('')
    setWallet(null)
    setAmount('')
    setDesc('')
    setError(null)
    setReceipt(null)
    setLookupErr('')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-lg">Canteen Terminal</h1>
            <p className="text-xs text-gray-400">Sychar School Wallet</p>
          </div>
        </div>
        <div className="text-right text-xs text-gray-400">
          <p>{new Date().toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <p>{new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">

          {/* ── LOOKUP ──────────────────────────────────────────────────── */}
          {stage === 'lookup' && (
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-800 text-center mb-2">Student Lookup</h2>
              <p className="text-gray-500 text-center text-sm mb-8">Enter the student&apos;s ID number or scan their card</p>
              <form onSubmit={handleLookupSubmit} className="space-y-4">
                <input
                  ref={studentIdRef}
                  value={studentId}
                  onChange={e => setStudentId(e.target.value)}
                  placeholder="Student ID (e.g. NK/2024/089)"
                  className="w-full text-xl text-center border-2 rounded-xl px-4 py-4 focus:outline-none focus:border-blue-500 tracking-widest"
                  autoComplete="off"
                  autoCapitalize="characters"
                />
                {lookupErr && (
                  <p className="text-red-600 text-sm text-center">{lookupErr}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || !studentId.trim()}
                  className="w-full py-4 text-lg font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Looking up...' : 'Find Student →'}
                </button>
              </form>
            </div>
          )}

          {/* ── WALLET DISPLAY ──────────────────────────────────────────── */}
          {stage === 'wallet' && wallet && (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              {/* Student info header */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5">
                <StudentCard w={wallet} />
              </div>

              {/* Balance info */}
              <div className="p-6 space-y-4">
                {wallet.is_frozen && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                    <p className="text-red-700 font-bold text-lg">Wallet Frozen</p>
                    <p className="text-red-600 text-sm mt-1">Contact the bursar to unfreeze this wallet.</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <BalancePill
                    label="Balance"
                    value={fmt(wallet.balance)}
                    color="bg-green-50 text-green-800"
                  />
                  <BalancePill
                    label="Today&apos;s Spend"
                    value={fmt(wallet.today_spend)}
                    color="bg-blue-50 text-blue-800"
                  />
                  <BalancePill
                    label="Available Today"
                    value={fmt(wallet.available)}
                    color={wallet.available <= 0 ? 'bg-red-50 text-red-800' : 'bg-indigo-50 text-indigo-800'}
                  />
                </div>

                <div className="flex gap-3 mt-2">
                  <button
                    onClick={reset}
                    className="flex-1 py-3 text-gray-600 border-2 border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => { if (!wallet.is_frozen && wallet.available > 0) setStage('amount') }}
                    disabled={wallet.is_frozen || wallet.available <= 0}
                    className="flex-2 flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {wallet.is_frozen
                      ? 'Frozen'
                      : wallet.available <= 0
                        ? 'No Balance'
                        : 'Charge Purchase →'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── AMOUNT ENTRY ────────────────────────────────────────────── */}
          {stage === 'amount' && wallet && (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                <StudentCard w={wallet} />
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-500 text-center">
                  Available today: <strong className="text-gray-800">{fmt(wallet.available)}</strong>
                </p>

                {/* Quick-select amounts */}
                <div className="grid grid-cols-4 gap-2">
                  {[20, 30, 50, 100].map(v => (
                    <button
                      key={v}
                      onClick={() => setAmount(String(v))}
                      className={`py-3 rounded-xl font-bold text-sm border-2 transition-colors ${
                        amount === String(v)
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-200 text-gray-700 hover:border-blue-400'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>

                <input
                  ref={amountRef}
                  type="number"
                  inputMode="numeric"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="Enter amount (KSH)"
                  min="1"
                  max={wallet.available}
                  className="w-full text-2xl text-center border-2 rounded-xl px-4 py-4 focus:outline-none focus:border-blue-500"
                />

                <input
                  type="text"
                  value={description}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full text-sm border rounded-xl px-4 py-3 focus:outline-none focus:border-blue-400 text-gray-600"
                />

                <div className="flex gap-3">
                  <button
                    onClick={() => setStage('wallet')}
                    className="flex-1 py-3 text-gray-600 border-2 border-gray-200 rounded-xl font-medium hover:bg-gray-50"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => {
                      const v = parseFloat(amount)
                      if (!isNaN(v) && v > 0 && v <= wallet.available) setStage('confirm')
                    }}
                    disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > wallet.available}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-40"
                  >
                    Review →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── CONFIRM ─────────────────────────────────────────────────── */}
          {stage === 'confirm' && wallet && amount && (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 text-white text-center">
                <p className="text-sm opacity-75 uppercase tracking-wide">Confirm Purchase</p>
                <p className="text-5xl font-black mt-1">{fmt(parseFloat(amount))}</p>
                <p className="text-sm opacity-75 mt-1">{description || 'Canteen purchase'}</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Student</span>
                    <span className="font-medium text-gray-800">{wallet.student_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Current Balance</span>
                    <span className="font-medium text-gray-800">{fmt(wallet.balance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Charge</span>
                    <span className="font-bold text-red-600">−{fmt(parseFloat(amount))}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-600 font-medium">New Balance</span>
                    <span className="font-bold text-green-700">{fmt(wallet.balance - parseFloat(amount))}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStage('amount')}
                    disabled={loading}
                    className="flex-1 py-4 text-gray-600 border-2 border-gray-200 rounded-xl font-medium hover:bg-gray-50 disabled:opacity-50"
                  >
                    ← Edit
                  </button>
                  <button
                    onClick={confirmPurchase}
                    disabled={loading}
                    className="flex-1 py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Processing...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── RECEIPT ─────────────────────────────────────────────────── */}
          {stage === 'receipt' && receipt && wallet && (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden text-center">
              <div className="bg-green-500 px-6 py-8">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-9 h-9 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-white text-xl font-bold">Payment Successful</p>
                <p className="text-green-100 text-3xl font-black mt-1">{fmt(receipt.amount)}</p>
              </div>
              <div className="p-6 space-y-3">
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm text-left">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Student</span>
                    <span className="font-medium">{wallet.student_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Remaining Balance</span>
                    <span className="font-bold text-green-700">{fmt(receipt.balance_after)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Time</span>
                    <span className="text-gray-600">
                      {new Date(receipt.timestamp).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>

                {receipt.balance_after < 50 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 text-left">
                    Low balance — parent should top up via M-Pesa.
                  </div>
                )}

                <button
                  onClick={reset}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors"
                >
                  Next Student →
                </button>
              </div>
            </div>
          )}

          {/* ── ERROR ───────────────────────────────────────────────────── */}
          {stage === 'error' && error && (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden text-center">
              <div className="bg-red-500 px-6 py-8">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-9 h-9 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-white text-xl font-bold">Transaction Failed</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-left text-sm space-y-2">
                  <p className="font-bold text-red-700">{error.error}</p>
                  {error.balance != null && (
                    <p className="text-red-600">Current balance: {fmt(error.balance)}</p>
                  )}
                  {error.shortfall != null && (
                    <p className="text-red-600">Shortfall: {fmt(error.shortfall)}</p>
                  )}
                  {error.available_today != null && (
                    <p className="text-red-600">Available today: {fmt(error.available_today)}</p>
                  )}
                  {error.daily_limit != null && (
                    <p className="text-gray-500 text-xs">Daily limit: {fmt(error.daily_limit)} | Spent today: {fmt(error.today_spend ?? 0)}</p>
                  )}
                  {error.frozen && (
                    <p className="text-amber-700 text-xs mt-1">Contact the bursar to unfreeze this wallet.</p>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setStage('amount')}
                    className="flex-1 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
                  >
                    ← Try Again
                  </button>
                  <button
                    onClick={reset}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
                  >
                    New Student
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
