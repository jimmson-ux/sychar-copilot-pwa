'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient, SCHOOL_ID } from '@/lib/supabase'
import { formatDate } from '@/lib/roles'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://project-o7htk.vercel.app'

interface CallLog {
  id: string
  phone_number: string | null
  message_body: string | null
  response_body: string | null
  created_at: string
  direction: string | null
}

const IVR_MENU = [
  { key: '1', label: 'Fee Balance', desc: 'Check outstanding balance and payment history', color: '#2176FF' },
  { key: '2', label: 'Academic Results', desc: 'Hear latest exam results and performance', color: '#16a34a' },
  { key: '3', label: 'Attendance', desc: 'Check student attendance record', color: '#d97706' },
  { key: '0', label: 'Talk to Staff', desc: 'Transfer to school office', color: '#6b7280' },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#374151' }}
    >{copied ? '✓ Copied' : 'Copy'}</button>
  )
}

export default function VoiceBotPage() {
  const [callLogs, setCallLogs] = useState<CallLog[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, today: 0, inbound: 0 })

  useEffect(() => { loadCallLogs() }, [])

  async function loadCallLogs() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('sms_log')
      .select('id, phone_number, message_body, response_body, created_at, direction')
      .eq('school_id', SCHOOL_ID)
      .eq('channel', 'voice')
      .order('created_at', { ascending: false })
      .limit(50)

    const logs = data ?? []
    setCallLogs(logs)

    const today = new Date().toISOString().split('T')[0]
    setStats({
      total: logs.length,
      today: logs.filter(l => l.created_at?.startsWith(today)).length,
      inbound: logs.filter(l => l.direction === 'inbound').length,
    })
    setLoading(false)
  }

  const voiceWebhookUrl = `${APP_URL}/api/voice`

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          Voice Bot
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Africa's Talking IVR — parents call to get instant school info
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Calls', value: stats.total, icon: '📞' },
          { label: 'Today', value: stats.today, icon: '📅' },
          { label: 'Inbound', value: stats.inbound, icon: '📲' },
        ].map(s => (
          <div key={s.label} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Africa's Talking Setup */}
      <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 28 }}>📡</div>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
              Africa's Talking Configuration
            </h2>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Configure these in your Africa's Talking dashboard</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'Voice Webhook URL', value: voiceWebhookUrl, desc: 'Set this as your voice callback URL in Africa\'s Talking' },
            { label: 'Action URL', value: `${APP_URL}/api/voice/action`, desc: 'Optional: for handling DTMF input callbacks' },
          ].map(item => (
            <div key={item.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                {item.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <code style={{ flex: 1, fontSize: 12, color: '#374151', wordBreak: 'break-all' }}>{item.value}</code>
                <CopyButton text={item.value} />
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{item.desc}</div>
            </div>
          ))}
        </div>

        {/* Setup steps */}
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#eff6ff', borderRadius: 10, fontSize: 12, color: '#1d4ed8', lineHeight: 1.7 }}>
          <strong>Setup steps:</strong>
          <ol style={{ margin: '6px 0 0 16px', padding: 0 }}>
            <li>Log in to <strong>africastalking.com</strong></li>
            <li>Go to <strong>Voice → Phone Numbers</strong></li>
            <li>Set <strong>Callback URL</strong> to the webhook URL above</li>
            <li>Save and test by calling your shortcode</li>
          </ol>
        </div>
      </div>

      {/* IVR Menu Preview */}
      <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 16px', fontFamily: 'Space Grotesk, sans-serif' }}>
          IVR Menu Structure
        </h2>
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 12, color: '#374151', lineHeight: 1.8, fontFamily: 'monospace' }}>
          "Welcome to Nkoroi Secondary School.<br />
          Press 1 for Fee Balance.<br />
          Press 2 for Academic Results.<br />
          Press 3 for Attendance.<br />
          Press 0 to speak to a staff member."
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {IVR_MENU.map(item => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', background: '#f9fafb', borderRadius: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: item.color, color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif',
              }}>{item.key}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{item.label}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Call log */}
      <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
            Call Log
          </h2>
        </div>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>Loading call log...</div>
        ) : callLogs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📞</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>No calls yet</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              Configure Africa's Talking above to start receiving calls.
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Caller', 'Query', 'Response', 'Time', 'Direction'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {callLogs.map(log => (
                <tr key={log.id}
                  style={{ borderBottom: '1px solid #f9fafb' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111827' }}>{log.phone_number ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#374151', maxWidth: 200 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.message_body ?? '—'}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#6b7280', maxWidth: 200 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.response_body ?? '—'}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: log.direction === 'inbound' ? '#eff6ff' : '#f0fdf4',
                      color: log.direction === 'inbound' ? '#2176FF' : '#16a34a',
                    }}>{log.direction ?? 'inbound'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
