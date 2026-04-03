'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'

type Intent =
  | 'greeting'
  | 'fee_query'
  | 'results_query'
  | 'attendance_query'
  | 'kcse_query'
  | 'duty_query'
  | 'send_my_link'
  | 'principal_broadcast'
  | 'unknown'

interface Stats {
  botEnabled: boolean
  voiceBotEnabled: boolean
  totalInbound: number
  totalOutbound: number
  uniqueParents: number
  intentBreakdown: Partial<Record<Intent, number>>
  recentConversations: Array<{
    id: string
    phone: string
    intent: string
    message: string
    createdAt: string
  }>
}

const INTENT_LABELS: Record<string, string> = {
  greeting:            'Greetings',
  fee_query:           'Fee Queries',
  results_query:       'Results Queries',
  attendance_query:    'Attendance',
  kcse_query:          'KCSE Queries',
  duty_query:          'Duty Queries',
  send_my_link:        'Teacher Links',
  principal_broadcast: 'Broadcasts',
  unknown:             'Unknown',
}

const INTENT_COLORS: Record<string, string> = {
  greeting:            'bg-blue-500',
  fee_query:           'bg-yellow-500',
  results_query:       'bg-green-500',
  attendance_query:    'bg-purple-500',
  kcse_query:          'bg-orange-500',
  duty_query:          'bg-pink-500',
  send_my_link:        'bg-teal-500',
  principal_broadcast: 'bg-red-500',
  unknown:             'bg-gray-400',
}

const INTENT_BADGE: Record<string, string> = {
  greeting:            'bg-blue-100 text-blue-700',
  fee_query:           'bg-yellow-100 text-yellow-700',
  results_query:       'bg-green-100 text-green-700',
  attendance_query:    'bg-purple-100 text-purple-700',
  kcse_query:          'bg-orange-100 text-orange-700',
  duty_query:          'bg-pink-100 text-pink-700',
  send_my_link:        'bg-teal-100 text-teal-700',
  principal_broadcast: 'bg-red-100 text-red-700',
  unknown:             'bg-gray-100 text-gray-600',
}

export default function WhatsAppBotPage() {
  const [stats, setStats]         = useState<Stats | null>(null)
  const [loading, setLoading]     = useState(true)
  const [toggling, setToggling]   = useState(false)
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [broadcastMsg, setBroadcastMsg]   = useState('')
  const [broadcastTarget, setBroadcastTarget] = useState<'all_parents' | 'all_staff' | 'class'>('all_parents')
  const [broadcastClass, setBroadcastClass]   = useState('')
  const [broadcasting, setBroadcasting]       = useState(false)
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number; failed: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/whatsapp/stats')
    if (res.ok) setStats(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleBot() {
    if (!stats) return
    setToggling(true)
    const res = await fetch('/api/whatsapp/toggle', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !stats.botEnabled }),
    })
    if (res.ok) {
      const d = await res.json() as { enabled: boolean }
      setStats(prev => prev ? { ...prev, botEnabled: d.enabled } : prev)
    }
    setToggling(false)
  }

  async function sendBroadcast() {
    if (!broadcastMsg.trim()) return
    setBroadcasting(true)
    setBroadcastResult(null)
    const res = await fetch('/api/whatsapp/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message:   broadcastMsg.trim(),
        target:    broadcastTarget,
        className: broadcastTarget === 'class' ? broadcastClass : undefined,
      }),
    })
    if (res.ok) {
      const d = await res.json() as { sent: number; failed: number }
      setBroadcastResult(d)
      setBroadcastMsg('')
    }
    setBroadcasting(false)
  }

  const maxIntent = stats
    ? Math.max(0, ...Object.values(stats.intentBreakdown ?? {}))
    : 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Bot</h1>
          <p className="text-sm text-gray-500 mt-1">Last 30 days &bull; Auto-responds to parents &amp; teachers in Swahili</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowBroadcast(true)}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            📢 Broadcast
          </button>
          <button
            onClick={load}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full" />
        </div>
      )}

      {!loading && stats && (
        <>
          {/* Bot toggle */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Bot Status</p>
              <p className="text-sm text-gray-500">
                {stats.botEnabled
                  ? 'Responding to incoming WhatsApp messages automatically.'
                  : 'Bot is paused — incoming messages will not receive auto-replies.'}
              </p>
            </div>
            <button
              onClick={toggleBot}
              disabled={toggling}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${
                stats.botEnabled ? 'bg-green-600' : 'bg-gray-300'
              } ${toggling ? 'opacity-50' : ''}`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  stats.botEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Messages Received',  value: stats.totalInbound,   icon: '📥', color: 'text-blue-600' },
              { label: 'Replies Sent',        value: stats.totalOutbound,  icon: '📤', color: 'text-green-600' },
              { label: 'Unique Parents',      value: stats.uniqueParents,  icon: '👨‍👩‍👧', color: 'text-purple-600' },
              { label: 'Total Interactions',  value: stats.totalInbound + stats.totalOutbound, icon: '💬', color: 'text-orange-600' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="text-2xl mb-1">{card.icon}</div>
                <div className={`text-3xl font-bold ${card.color}`}>{card.value}</div>
                <div className="text-xs text-gray-500 mt-1">{card.label}</div>
              </div>
            ))}
          </div>

          {/* Intent breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Message Types</h2>
            {Object.keys(INTENT_LABELS).length === 0 || maxIntent === 0 ? (
              <p className="text-sm text-gray-400">No messages yet.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(INTENT_LABELS).map(([key, label]) => {
                  const count = stats.intentBreakdown[key as Intent] ?? 0
                  const pct   = maxIntent > 0 ? Math.round((count / maxIntent) * 100) : 0
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className="w-32 text-xs text-gray-600 shrink-0">{label}</div>
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${INTENT_COLORS[key] ?? 'bg-gray-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="w-8 text-xs text-gray-500 text-right shrink-0">{count}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent conversations */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Recent Conversations</h2>
            {stats.recentConversations.length === 0 ? (
              <p className="text-sm text-gray-400">No conversations yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 font-medium text-gray-500">Phone</th>
                      <th className="text-left py-2 pr-4 font-medium text-gray-500">Intent</th>
                      <th className="text-left py-2 pr-4 font-medium text-gray-500">Message</th>
                      <th className="text-left py-2 font-medium text-gray-500">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stats.recentConversations.map(conv => (
                      <tr key={conv.id} className="hover:bg-gray-50">
                        <td className="py-2 pr-4 font-mono text-xs text-gray-600">{conv.phone}</td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${INTENT_BADGE[conv.intent] ?? 'bg-gray-100 text-gray-600'}`}>
                            {INTENT_LABELS[conv.intent] ?? conv.intent}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-gray-700 max-w-xs truncate">{conv.message}</td>
                        <td className="py-2 text-gray-400 text-xs whitespace-nowrap">
                          {new Date(conv.createdAt).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Broadcast modal */}
      {showBroadcast && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Send Broadcast</h2>
              <button
                onClick={() => { setShowBroadcast(false); setBroadcastResult(null) }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            {broadcastResult ? (
              <div className="text-center py-6 space-y-2">
                <div className="text-4xl">✅</div>
                <p className="font-semibold text-gray-900">Broadcast sent!</p>
                <p className="text-sm text-gray-500">
                  {broadcastResult.sent} delivered &bull; {broadcastResult.failed} failed
                </p>
                <button
                  onClick={() => { setShowBroadcast(false); setBroadcastResult(null) }}
                  className="mt-4 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Send to</label>
                  <select
                    value={broadcastTarget}
                    onChange={e => setBroadcastTarget(e.target.value as typeof broadcastTarget)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="all_parents">All Parents</option>
                    <option value="all_staff">All Staff</option>
                    <option value="class">Specific Class</option>
                  </select>
                </div>

                {broadcastTarget === 'class' && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Class Name</label>
                    <input
                      value={broadcastClass}
                      onChange={e => setBroadcastClass(e.target.value)}
                      placeholder="e.g. Form 4A"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Message</label>
                  <textarea
                    value={broadcastMsg}
                    onChange={e => setBroadcastMsg(e.target.value)}
                    rows={5}
                    placeholder="Type your message here..."
                    maxLength={1000}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  />
                  <p className="text-xs text-gray-400 text-right">{broadcastMsg.length}/1000</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowBroadcast(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendBroadcast}
                    disabled={broadcasting || !broadcastMsg.trim()}
                    className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {broadcasting ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
