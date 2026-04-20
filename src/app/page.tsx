'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import SycharLogo from '@/components/SycharLogo'

const SYCHAR_WORD = 'Sychar'
const TYPE_MS = 300

export default function LandingPage() {
  const router = useRouter()

  const [typed, setTyped] = useState('')
  const [showCursor, setShowCursor] = useState(true)
  const [typingDone, setTypingDone] = useState(false)
  const [cursorHidden, setCursorHidden] = useState(false)

  const [showCopilot, setShowCopilot] = useState(false)
  const [showTagline, setShowTagline] = useState(false)
  const [showButton, setShowButton] = useState(false)

  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Typewriter — starts immediately, 300ms per letter
  useEffect(() => {
    let idx = 0
    function typeNext() {
      idx++
      setTyped(SYCHAR_WORD.slice(0, idx))
      if (idx < SYCHAR_WORD.length) {
        typingRef.current = setTimeout(typeNext, TYPE_MS)
      } else {
        setTypingDone(true)
        // Cursor disappears 2s after typing completes
        setTimeout(() => setCursorHidden(true), 2000)
      }
    }
    typingRef.current = setTimeout(typeNext, TYPE_MS)
    return () => { if (typingRef.current) clearTimeout(typingRef.current) }
  }, [])

  // Cursor blink while typing
  useEffect(() => {
    const t = setInterval(() => setShowCursor(v => !v), 530)
    return () => clearInterval(t)
  }, [])

  // Reveal sequence — absolute timings from page load
  useEffect(() => {
    const t1 = setTimeout(() => setShowCopilot(true), 2000)
    const t2 = setTimeout(() => setShowTagline(true), 2800)
    const t3 = setTimeout(() => setShowButton(true), 3500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    <>
      <style>{`
        @keyframes blobAnim {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(20px,-20px) scale(1.05); }
          66%      { transform: translate(-10px,15px) scale(0.97); }
        }
        @keyframes fadeSlideUp {
          from { opacity:0; transform:translateY(14px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes slideInRight {
          from { opacity:0; transform:translateX(20px); }
          to   { opacity:1; transform:translateX(0); }
        }
        .blob1 { animation: blobAnim 9s infinite ease-in-out; }
        .blob2 { animation: blobAnim 11s infinite ease-in-out 1.5s; }
        .blob3 { animation: blobAnim 13s infinite ease-in-out 3s; }
        .copilot-pill { animation: slideInRight 0.6s ease forwards; }
        .tagline-text { animation: fadeSlideUp 0.8s ease forwards; }
        .btn-portal { animation: fadeSlideUp 0.6s ease forwards; }
        .btn-portal:hover { transform: scale(1.03); box-shadow: 0 8px 30px rgba(0,0,0,0.15) !important; }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#ffffff', position: 'relative', overflowX: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Ambient blobs */}
        <div className="blob1" style={{ position: 'fixed', top: -80, left: -80, width: 400, height: 400, borderRadius: '50%', background: '#09D1C7', opacity: 0.06, filter: 'blur(100px)', pointerEvents: 'none' }} />
        <div className="blob2" style={{ position: 'fixed', bottom: -60, right: -60, width: 350, height: 350, borderRadius: '50%', background: '#22c55e', opacity: 0.07, filter: 'blur(100px)', pointerEvents: 'none' }} />
        <div className="blob3" style={{ position: 'fixed', top: '45%', left: '50%', transform: 'translate(-50%,-50%)', width: 300, height: 300, borderRadius: '50%', background: '#2176FF', opacity: 0.06, filter: 'blur(80px)', pointerEvents: 'none' }} />

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 520, padding: '72px 24px 80px' }}>

          {/* Logo card — 80×80 */}
          <div style={{ width: 80, height: 80, borderRadius: 20, background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
            <SycharLogo size={48} />
          </div>

          {/* Sychar typewriter */}
          <div style={{ textAlign: 'center' }}>
            <span style={{
              fontSize: 'clamp(52px, 10vw, 88px)',
              fontWeight: 700,
              fontFamily: 'Space Grotesk, sans-serif',
              background: 'linear-gradient(to right, #1e40af, #0891b2, #22c55e)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              lineHeight: 1,
              display: 'inline-block',
            }}>
              {typed}
            </span>
            {!cursorHidden && (
              <span style={{
                display: 'inline-block',
                width: 3,
                height: 'clamp(48px, 9vw, 80px)',
                background: '#22c55e',
                marginLeft: 4,
                verticalAlign: 'middle',
                opacity: showCursor ? 1 : (typingDone ? 0 : 1),
                transition: 'opacity 0.1s',
              }} />
            )}
          </div>

          {/* COPILOT pill — own line */}
          {showCopilot && (
            <div className="copilot-pill" style={{ marginTop: 16, textAlign: 'center' }}>
              <span style={{
                display: 'inline-block',
                background: 'linear-gradient(135deg, #0891b2, #22c55e)',
                color: 'white',
                fontWeight: 700,
                letterSpacing: '0.18em',
                fontSize: 15,
                padding: '10px 22px',
                borderRadius: 100,
                boxShadow: '0 4px 20px rgba(8,145,178,0.25)',
                fontFamily: 'Space Grotesk, sans-serif',
              }}>
                COPILOT
              </span>
            </div>
          )}

          {/* Tagline */}
          {showTagline && (
            <p className="tagline-text" style={{
              textAlign: 'center',
              maxWidth: 460,
              fontSize: 17,
              color: '#6b7280',
              lineHeight: 1.7,
              margin: '28px auto 0',
              fontFamily: 'DM Sans, sans-serif',
            }}>
              The future of educational management. Seamless, intelligent, and designed for the next generation of schools.
            </p>
          )}

          {/* Enter Portal button */}
          {showButton && (
            <button
              className="btn-portal"
              onClick={() => router.push('/login')}
              style={{
                marginTop: 40,
                padding: '16px 48px',
                borderRadius: 100,
                background: '#111827',
                color: 'white',
                fontSize: 17,
                fontWeight: 600,
                fontFamily: 'Space Grotesk, sans-serif',
                border: 'none',
                cursor: 'pointer',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
            >
              Enter Portal →
            </button>
          )}

        </div>

        {/* Footer — pinned to bottom */}
        <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'DM Sans, sans-serif' }}>
            v1.0 · Sychar Copilot · Nkoroi Mixed Day Secondary School
          </span>
        </div>
      </div>
    </>
  )
}
