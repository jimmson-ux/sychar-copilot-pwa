'use client'

export const dynamic = 'force-dynamic'


import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { Bot, Send, Loader2, User } from 'lucide-react'


interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'How do I scan a fee receipt?',
  'What scan types can I access?',
  'How does the M-Pesa batch scanner work?',
  'What is the HOD report scanner for?',
]

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    const userMsg: Message = { role: 'user', content: text.trim() }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, userId }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#f8fafc] min-h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-100 px-4 md:px-8 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#FF0A6C]/20 to-[#2D27FF]/20 border border-[#FF0A6C]/20 flex items-center justify-center">
          <Bot className="w-4 h-4 text-[#FF0A6C]" />
        </div>
        <div>
          <h1 className="text-gray-900 font-display font-semibold text-sm">Sychar Assistant</h1>
          <p className="text-gray-500 text-xs">Ask anything about the school system</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-6">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#FF0A6C]/10 to-[#2D27FF]/10 border border-gray-100 flex items-center justify-center">
              <Bot className="w-8 h-8 text-gray-600" />
            </div>
            <div className="text-center">
              <p className="text-gray-900 font-display font-semibold mb-1">How can I help you?</p>
              <p className="text-gray-500 text-sm">Ask about the system, students, fees, or anything school-related.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left px-4 py-3 bg-white border border-gray-100 rounded-2xl text-gray-500 text-xs hover:border-gray-200 hover:text-gray-700 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#FF0A6C]/20 to-[#2D27FF]/20 border border-[#FF0A6C]/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-[#FF0A6C]" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-[#FF0A6C]/20 to-[#2D27FF]/20 border border-[#FF0A6C]/20 text-white rounded-tr-sm'
                  : 'bg-white border border-gray-100 text-gray-600 rounded-tl-sm'
              }`}
            >
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-xl bg-[#f9fafb] border border-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-gray-400" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#FF0A6C]/20 to-[#2D27FF]/20 border border-[#FF0A6C]/20 flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-[#FF0A6C]" />
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 px-4 md:px-8 py-4">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input) }}
          className="flex gap-3 items-end"
        >
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage(input)
              }
            }}
            placeholder="Ask a question..."
            className="flex-1 bg-white border border-gray-200 rounded-2xl px-4 py-3 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[var(--role-primary,#0891b2)] transition-colors resize-none leading-relaxed"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-2xl bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </form>
        <p className="text-gray-700 text-xs mt-2 text-center">Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}
