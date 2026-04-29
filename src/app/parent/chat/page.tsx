'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '../_components/BottomNav'

const G  = '#16a34a'
const GL = '#15803d'

interface Message {
  role:     'user' | 'assistant'
  content:  string
  language?: 'en' | 'sw'
}

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('parent_token') : ''
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display:       'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom:  12,
      padding:       '0 16px',
    }}>
      {!isUser && (
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, marginRight: 8, alignSelf: 'flex-end' }}>
          🤖
        </div>
      )}
      <div style={{
        maxWidth:     '75%',
        background:   isUser ? G : 'white',
        color:        isUser ? 'white' : '#111827',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        padding:      '10px 14px',
        fontSize:     14,
        lineHeight:   1.55,
        boxShadow:    '0 1px 4px rgba(0,0,0,0.08)',
        whiteSpace:   'pre-wrap',
        wordBreak:    'break-word',
      }}>
        {msg.content}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', marginBottom: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: G, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginRight: 8 }}>
        🤖
      </div>
      <div style={{ background: 'white', borderRadius: '18px 18px 18px 4px', padding: '12px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              width: 7, height: 7, borderRadius: '50%', background: '#d1d5db',
              display: 'inline-block',
              animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
            }} />
          ))}
        </div>
      </div>
      <style>{`@keyframes bounce { 0%,80%,100%{transform:scale(1)}40%{transform:scale(1.4)} }`}</style>
    </div>
  )
}

const SUGGESTIONS_EN = [
  "How are my child's fees?",
  "Show me attendance this term",
  "Any recent exam results?",
  "Any school notices?",
]
const SUGGESTIONS_SW = [
  'Hali ya ada za mtoto wangu?',
  'Mahudhurio ya mtoto wangu',
  'Matokeo ya mtihani wa hivi karibuni?',
  'Taarifa za shule?',
]

export default function ParentChatPage() {
  const router   = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [lang,      setLang]      = useState<'en' | 'sw'>('en')

  useEffect(() => {
    if (!localStorage.getItem('parent_token')) {
      router.replace('/parent')
      return
    }
    setMessages([{
      role:    'assistant',
      content: 'Hello! I\'m Sychar AI, your school assistant. Ask me anything about your child — fees, attendance, grades, or school notices.\n\nNinaongea Kiswahili pia! 🇰🇪',
    }])
  }, [router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text: string) {
    const msg = text.trim()
    if (!msg || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
      const res  = await fetch('/api/parent/chat/groq', {
        method:  'POST',
        headers: authHeaders(),
        body:    JSON.stringify({ message: msg, conversationHistory: history }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (res.status === 401) { router.replace('/parent'); return }
        throw new Error(data.error ?? 'Request failed')
      }

      setLang(data.language ?? 'en')
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, language: data.language }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role:    'assistant',
        content: err instanceof Error && err.message !== 'Request failed'
          ? err.message
          : 'Sorry, I couldn\'t get a response. Please try again.',
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const suggestions = lang === 'sw' ? SUGGESTIONS_SW : SUGGESTIONS_EN
  const showSuggestions = messages.length <= 1 && !loading

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f0fdf4' }}>
      {/* Header */}
      <div style={{ background: G, padding: '16px 20px', color: 'white', flexShrink: 0, paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            🤖
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Sychar AI</p>
            <p style={{ margin: 0, fontSize: 11, opacity: 0.8 }}>Your school assistant · English &amp; Swahili</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 16, paddingBottom: 8 }}>
        {messages.map((m, i) => <Bubble key={i} msg={m} />)}
        {loading && <TypingIndicator />}

        {showSuggestions && (
          <div style={{ padding: '8px 16px 16px' }}>
            <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {lang === 'sw' ? 'Maswali ya haraka' : 'Quick questions'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  style={{
                    background: 'white', border: `1.5px solid ${G}`, borderRadius: 20,
                    padding: '7px 14px', fontSize: 13, color: GL, cursor: 'pointer',
                    fontWeight: 500, lineHeight: 1.3,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        background:   'white',
        borderTop:    '1px solid #e5e7eb',
        padding:      '12px 16px',
        paddingBottom: 'calc(12px + 64px + env(safe-area-inset-bottom))',
        display:      'flex',
        gap:          10,
        alignItems:   'flex-end',
      }}>
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={e => {
            setInput(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
          }}
          onKeyDown={handleKeyDown}
          placeholder={lang === 'sw' ? 'Andika ujumbe…' : 'Ask about fees, attendance, grades…'}
          disabled={loading}
          style={{
            flex:       1,
            border:     '1.5px solid #e5e7eb',
            borderRadius: 22,
            padding:    '10px 16px',
            fontSize:   14,
            resize:     'none',
            outline:    'none',
            lineHeight: 1.5,
            fontFamily: 'inherit',
            background: loading ? '#f9fafb' : 'white',
            overflowY:  'hidden',
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          style={{
            width:          44,
            height:         44,
            borderRadius:   '50%',
            background:     input.trim() && !loading ? G : '#e5e7eb',
            border:         'none',
            cursor:         input.trim() && !loading ? 'pointer' : 'default',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       18,
            flexShrink:     0,
            transition:     'background 0.15s',
          }}
        >
          ➤
        </button>
      </div>

      <BottomNav />
    </div>
  )
}
