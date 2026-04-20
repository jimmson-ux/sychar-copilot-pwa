'use client'

import { useState } from 'react'

type VerifyResult = {
  result: 'CLEARED' | 'INVALID'
  student_name?: string; class_name?: string; admission_number?: string | null;
  reason?: string; expected_return?: string; exited_at?: string; pass_id?: string;
  reason_text?: string  // error reason
}

export default function GateVerifyPage() {
  const [guardPin, setGuardPin]         = useState('')
  const [guardAuth, setGuardAuth]       = useState(false)
  const [guardPinInput, setGuardPinInput] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [exitPin, setExitPin]           = useState('')
  const [result, setResult]             = useState<VerifyResult | null>(null)
  const [verifying, setVerifying]       = useState(false)
  const [returnMsg, setReturnMsg]       = useState('')

  function authGuard(e: React.FormEvent) {
    e.preventDefault()
    // Guard device PIN auth (client-side check against what server will validate)
    setGuardPin(guardPinInput)
    setGuardAuth(true)
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setVerifying(true); setResult(null)
    const r = await fetch('/api/gate/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guard_pin: guardPin, student_query: studentQuery, exit_pin: exitPin }),
    })
    const d = await r.json()
    setVerifying(false)
    setResult({ ...d, reason_text: d.reason })
  }

  async function markReturned(passId: string) {
    setReturnMsg('')
    const r = await fetch('/api/gate/verify', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guard_pin: guardPin, pass_id: passId }),
    })
    setReturnMsg(r.ok ? 'Marked as returned ✓' : 'Error')
  }

  if (!guardAuth) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-xs">
          <div className="text-center mb-6">
            <p className="text-4xl mb-2">🔒</p>
            <h1 className="text-xl font-bold text-white">Guard Station</h1>
            <p className="text-sm text-gray-400">Enter device PIN to continue</p>
          </div>
          <form onSubmit={authGuard} className="space-y-3">
            <input
              type="password"
              value={guardPinInput}
              onChange={e => setGuardPinInput(e.target.value)}
              placeholder="Device PIN"
              maxLength={8}
              className="w-full bg-gray-800 text-white border border-gray-600 rounded-xl px-4 py-3 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button type="submit" disabled={!guardPinInput}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold disabled:opacity-40 hover:bg-blue-700">
              Unlock
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <p className="text-3xl mb-1">🛡️</p>
          <h1 className="text-xl font-bold text-white">Gate Verification</h1>
          <p className="text-sm text-gray-400">Enter student name + exit code</p>
        </div>

        {/* Verify form */}
        {!result && (
          <form onSubmit={verify} className="bg-gray-800 rounded-2xl p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Student Name or Admission No.</label>
              <input
                value={studentQuery}
                onChange={e => setStudentQuery(e.target.value)}
                placeholder="e.g. Jane Mwangi or 2024001"
                className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">4-Digit Exit Code</label>
              <input
                value={exitPin}
                onChange={e => setExitPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                maxLength={4}
                className="w-full bg-gray-700 text-white border border-gray-600 rounded-xl px-4 py-4 text-3xl text-center font-bold font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <button type="submit" disabled={verifying || !studentQuery || exitPin.length !== 4}
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-40 hover:bg-blue-700">
              {verifying ? 'Checking…' : 'Verify Exit'}
            </button>
          </form>
        )}

        {/* Result */}
        {result && (
          <div className={`rounded-2xl p-6 text-center space-y-3 ${result.result === 'CLEARED' ? 'bg-green-500' : 'bg-red-500'}`}>
            <p className="text-5xl">{result.result === 'CLEARED' ? '✅' : '❌'}</p>
            <p className="text-3xl font-black text-white">{result.result}</p>

            {result.result === 'CLEARED' && (
              <div className="bg-white/20 rounded-xl p-3 text-white text-left space-y-1">
                <p className="font-bold text-lg">{result.student_name}</p>
                <p className="text-sm">{result.class_name}</p>
                <p className="text-sm">Reason: <strong>{result.reason}</strong></p>
                <p className="text-sm">Return by: <strong>{result.expected_return}</strong></p>
                <p className="text-xs text-white/70">Exited: {result.exited_at}</p>
              </div>
            )}

            {result.result === 'INVALID' && (
              <p className="text-white/90 text-sm">{result.reason_text}</p>
            )}

            {result.result === 'CLEARED' && result.pass_id && (
              <div>
                {returnMsg
                  ? <p className="text-white font-semibold">{returnMsg}</p>
                  : <button onClick={() => markReturned(result.pass_id!)}
                      className="w-full bg-white text-green-600 font-bold py-2 rounded-xl text-sm hover:bg-green-50">
                      Mark as Returned
                    </button>
                }
              </div>
            )}

            <button onClick={() => { setResult(null); setStudentQuery(''); setExitPin(''); setReturnMsg('') }}
              className="w-full bg-white/20 text-white py-2 rounded-xl text-sm font-medium hover:bg-white/30">
              Verify Another
            </button>
          </div>
        )}

        <p className="text-center text-xs text-gray-600">Guard device only · Not for public use</p>
      </div>
    </div>
  )
}
