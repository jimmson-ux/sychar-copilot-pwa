'use client'

import { useState } from 'react'

const CATEGORIES = [
  { key: 'academic',      label: 'School & Grades',  icon: '📚' },
  { key: 'peer',          label: 'Friends & Peers',  icon: '👥' },
  { key: 'family',        label: 'Family Issues',    icon: '🏠' },
  { key: 'mental_health', label: 'Feeling Unwell',   icon: '💙' },
  { key: 'career',        label: 'Future & Career',  icon: '🎯' },
  { key: 'other',         label: 'Something Else',   icon: '💬' },
]

const CONTACT_PREFS = [
  { key: 'none',             label: 'Stay anonymous — no follow-up needed' },
  { key: 'counselor_direct', label: "I'm OK with the counselor reaching out to me" },
  { key: 'class_teacher',    label: 'Speak to my class teacher on my behalf' },
]

type Step = 'school' | 'category' | 'message' | 'contact' | 'done' | 'error'

export default function TalkPage() {
  const [step, setStep]             = useState<Step>('school')
  const [schoolCode, setSchoolCode] = useState('')
  const [category, setCategory]     = useState('')
  const [concern, setConcern]       = useState('')
  const [contactPref, setContactPref] = useState('none')
  const [firstName, setFirstName]   = useState('')
  const [className, setClassName]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [ref, setRef]               = useState('')
  const [errorMsg, setErrorMsg]     = useState('')

  async function submit() {
    setSubmitting(true)
    const r = await fetch('/api/gc/self-referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_code:   schoolCode.trim().toUpperCase(),
        concern:       concern.trim(),
        category,
        contact_pref:  contactPref,
        first_name:    firstName.trim() || undefined,
        class_name:    className.trim() || undefined,
      }),
    })
    setSubmitting(false)
    if (r.ok) {
      const d = await r.json()
      setRef(d.ref)
      setStep('done')
    } else {
      const d = await r.json()
      setErrorMsg(d.error ?? 'Something went wrong. Please try again.')
      setStep('error')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">💙</div>
          <h1 className="text-2xl font-bold text-gray-900">You're not alone</h1>
          <p className="text-sm text-gray-500 mt-1">This is a safe space. Everything is confidential.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-5">

          {/* ── STEP: SCHOOL ───────────────────────────────────────────────── */}
          {step === 'school' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Enter your school code</label>
                <p className="text-xs text-gray-500 mb-3">Your school code is usually on your fee statement or school ID card.</p>
                <input
                  value={schoolCode}
                  onChange={e => setSchoolCode(e.target.value.toUpperCase())}
                  placeholder="e.g. XKHS-2024"
                  maxLength={20}
                  className="w-full border rounded-xl px-4 py-3 text-sm text-center font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400 uppercase"
                />
              </div>
              <button
                onClick={() => setStep('category')}
                disabled={schoolCode.trim().length < 3}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-blue-700 transition-colors"
              >
                Continue
              </button>
              <p className="text-xs text-gray-400 text-center">No login required. We don't store your identity.</p>
            </div>
          )}

          {/* ── STEP: CATEGORY ─────────────────────────────────────────────── */}
          {step === 'category' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700">What would you like help with?</p>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c.key}
                    onClick={() => { setCategory(c.key); setStep('message') }}
                    className="flex flex-col items-center gap-1 border rounded-xl p-3 text-sm text-gray-700 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <span className="text-2xl">{c.icon}</span>
                    <span className="font-medium text-center leading-tight">{c.label}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setStep('school')} className="text-xs text-gray-400 hover:underline w-full text-center">← Back</button>
            </div>
          )}

          {/* ── STEP: MESSAGE ───────────────────────────────────────────────── */}
          {step === 'message' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tell us what's going on</label>
                <p className="text-xs text-gray-500 mb-3">
                  Share as much or as little as you're comfortable with. Only the school counselor will see this.
                </p>
                <textarea
                  rows={5}
                  value={concern}
                  onChange={e => setConcern(e.target.value)}
                  placeholder="Write here… there's no right or wrong way to say it."
                  className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">{concern.length} characters</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep('category')} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-medium hover:bg-gray-200">
                  ← Back
                </button>
                <button
                  onClick={() => setStep('contact')}
                  disabled={concern.trim().length < 10}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-blue-700"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: CONTACT PREFERENCE ────────────────────────────────────── */}
          {step === 'contact' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700">How would you like to be helped?</p>
              <p className="text-xs text-gray-500">This is optional. You can stay completely anonymous.</p>

              <div className="space-y-2">
                {CONTACT_PREFS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setContactPref(p.key)}
                    className={`w-full text-left border rounded-xl px-4 py-3 text-sm transition-colors ${contactPref === p.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'text-gray-700 hover:border-gray-300'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {contactPref !== 'none' && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Optional: share your first name and class so the counselor can find you.</p>
                  <div className="flex gap-2">
                    <input
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder="First name"
                      className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <input
                      value={className}
                      onChange={e => setClassName(e.target.value)}
                      placeholder="Class (e.g. 4A)"
                      className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep('message')} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-medium hover:bg-gray-200">
                  ← Back
                </button>
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-blue-700"
                >
                  {submitting ? 'Sending…' : 'Send to Counselor'}
                </button>
              </div>

              <p className="text-xs text-gray-400 text-center">
                No one outside the counseling team will see your message.
              </p>
            </div>
          )}

          {/* ── STEP: DONE ──────────────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="text-center space-y-4 py-4">
              <div className="text-5xl">💌</div>
              <h2 className="text-lg font-bold text-gray-900">Message received</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                Your school's counselor has been notified and will follow up based on your preference.
                You are brave for reaching out — help is on the way.
              </p>
              {ref && (
                <p className="text-xs text-gray-400">Reference: <span className="font-mono">{ref.slice(0, 8).toUpperCase()}</span></p>
              )}
              <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
                If this is an emergency or you're in immediate danger, please tell a trusted adult or call emergency services.
              </div>
              <button
                onClick={() => { setStep('school'); setSchoolCode(''); setCategory(''); setConcern(''); setContactPref('none'); setFirstName(''); setClassName('') }}
                className="text-xs text-gray-400 hover:underline"
              >
                Submit another message
              </button>
            </div>
          )}

          {/* ── STEP: ERROR ─────────────────────────────────────────────────── */}
          {step === 'error' && (
            <div className="text-center space-y-4 py-4">
              <div className="text-4xl">😔</div>
              <p className="text-sm text-gray-700">{errorMsg}</p>
              <button onClick={() => setStep('contact')} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-blue-700">
                Try Again
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">Powered by Sychar · Confidential student support</p>
      </div>
    </div>
  )
}
