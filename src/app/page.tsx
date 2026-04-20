'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import SycharLogo from '@/components/SycharLogo'

const TITLE    = 'Sychar'
const TAGLINE  = 'The future of educational management. Seamless, intelligent, and designed for the next generation of schools.'

const TITLE_MS   = 160   // ms per character for title
const TAGLINE_MS = 22    // ms per character for tagline

export default function LandingPage() {
  const router = useRouter()

  // ── Title typewriter ─────────────────────────────────────────
  const [title, setTitle]           = useState('')
  const [titleDone, setTitleDone]   = useState(false)
  const [titleCursor, setTitleCursor] = useState(true)
  const [titleCursorHidden, setTitleCursorHidden] = useState(false)

  // ── Tagline typewriter ───────────────────────────────────────
  const [tagline, setTagline]             = useState('')
  const [taglineStarted, setTaglineStarted] = useState(false)
  const [taglineDone, setTaglineDone]     = useState(false)
  const [taglineCursor, setTaglineCursor] = useState(true)
  const [taglineCursorHidden, setTaglineCursorHidden] = useState(false)

  // ── Reveal flags ─────────────────────────────────────────────
  const [showLogo,    setShowLogo]    = useState(false)
  const [showCopilot, setShowCopilot] = useState(false)
  const [showButton,  setShowButton]  = useState(false)

  const titleTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const taglineTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Logo fades in immediately
  useEffect(() => { setTimeout(() => setShowLogo(true), 200) }, [])

  // Title typewriter
  useEffect(() => {
    let idx = 0
    const type = () => {
      idx++
      setTitle(TITLE.slice(0, idx))
      if (idx < TITLE.length) {
        titleTimer.current = setTimeout(type, TITLE_MS)
      } else {
        setTitleDone(true)
        setTimeout(() => setTitleCursorHidden(true), 1200)
      }
    }
    titleTimer.current = setTimeout(type, 600)
    return () => { if (titleTimer.current) clearTimeout(titleTimer.current) }
  }, [])

  // Title cursor blink
  useEffect(() => {
    const t = setInterval(() => setTitleCursor(v => !v), 530)
    return () => clearInterval(t)
  }, [])

  // COPILOT pill appears shortly after title finishes
  useEffect(() => {
    const delay = 600 + TITLE.length * TITLE_MS + 400
    const t = setTimeout(() => setShowCopilot(true), delay)
    return () => clearTimeout(t)
  }, [])

  // Start tagline typewriter after COPILOT appears
  useEffect(() => {
    const startDelay = 600 + TITLE.length * TITLE_MS + 900
    const t = setTimeout(() => setTaglineStarted(true), startDelay)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!taglineStarted) return
    let idx = 0
    const type = () => {
      idx++
      setTagline(TAGLINE.slice(0, idx))
      if (idx < TAGLINE.length) {
        taglineTimer.current = setTimeout(type, TAGLINE_MS)
      } else {
        setTaglineDone(true)
        setTimeout(() => setTaglineCursorHidden(true), 1000)
      }
    }
    taglineTimer.current = setTimeout(type, TAGLINE_MS)
    return () => { if (taglineTimer.current) clearTimeout(taglineTimer.current) }
  }, [taglineStarted])

  // Tagline cursor blink
  useEffect(() => {
    const t = setInterval(() => setTaglineCursor(v => !v), 530)
    return () => clearInterval(t)
  }, [])

  // Button appears after tagline finishes typing
  useEffect(() => {
    const buttonDelay = 600 + TITLE.length * TITLE_MS + 900 + TAGLINE.length * TAGLINE_MS + 600
    const t = setTimeout(() => setShowButton(true), buttonDelay)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=DM+Sans:wght@400;500&display=swap');

        @keyframes blobFloat {
          0%,100% { transform: translate(0,0) scale(1); }
          40%      { transform: translate(18px,-22px) scale(1.04); }
          70%      { transform: translate(-12px,14px) scale(0.97); }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes popIn {
          from { opacity:0; transform:scale(0.8) translateY(6px); }
          to   { opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity:0; }
          to   { opacity:1; }
        }

        .blob1 { animation: blobFloat 10s infinite ease-in-out; }
        .blob2 { animation: blobFloat 13s infinite ease-in-out 2s; }
        .blob3 { animation: blobFloat 16s infinite ease-in-out 4s; }

        .logo-card  { animation: fadeUp  0.7s ease forwards; }
        .copilot-pill { animation: popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .btn-enter  { animation: fadeUp 0.6s ease forwards; transition: transform 0.2s, box-shadow 0.2s; }
        .btn-enter:hover { transform: scale(1.04) !important; box-shadow: 0 10px 36px rgba(0,0,0,0.18) !important; }

        .tagline-wrap { min-height: 5em; }

        .footer-contact a { color: #6b7280; text-decoration: none; }
        .footer-contact a:hover { color: #2EA8E0; text-decoration: underline; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #f0fdf9 0%, #ffffff 45%, #f0f9ff 100%)',
        position: 'relative',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: 'DM Sans, sans-serif',
      }}>

        {/* Ambient blobs */}
        <div className="blob1" style={{ position:'fixed', top:-100, left:-100, width:500, height:500, borderRadius:'50%', background:'#09D1C7', opacity:0.07, filter:'blur(120px)', pointerEvents:'none' }} />
        <div className="blob2" style={{ position:'fixed', bottom:-80, right:-80, width:420, height:420, borderRadius:'50%', background:'#22c55e', opacity:0.07, filter:'blur(110px)', pointerEvents:'none' }} />
        <div className="blob3" style={{ position:'fixed', top:'40%', left:'55%', width:340, height:340, borderRadius:'50%', background:'#2EA8E0', opacity:0.05, filter:'blur(90px)', pointerEvents:'none' }} />

        {/* ── Main content ───────────────────────────── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          width: '100%', maxWidth: 540,
          padding: '80px 24px 100px',
          flex: 1,
        }}>

          {/* SycharLogo card */}
          {showLogo && (
            <div className="logo-card" style={{
              width: 84, height: 84, borderRadius: 22,
              background: 'white',
              boxShadow: '0 4px 28px rgba(0,0,0,0.09)',
              border: '1px solid #e8f4f8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 36,
            }}>
              <SycharLogo size={52} />
            </div>
          )}

          {/* Title typewriter */}
          <div style={{ textAlign: 'center', lineHeight: 1, minHeight: '1.1em' }}>
            <span style={{
              fontSize: 'clamp(56px, 11vw, 96px)',
              fontWeight: 700,
              fontFamily: 'Space Grotesk, sans-serif',
              background: 'linear-gradient(to right, #1e3a8a 0%, #0891b2 50%, #22c55e 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              display: 'inline-block',
            }}>
              {title}
            </span>
            {!titleCursorHidden && (
              <span style={{
                display: 'inline-block',
                width: 3,
                height: 'clamp(52px, 10vw, 88px)',
                background: '#22c55e',
                marginLeft: 4,
                verticalAlign: 'middle',
                opacity: titleCursor ? 1 : (titleDone ? 0 : 1),
                transition: 'opacity 0.1s',
                borderRadius: 2,
              }} />
            )}
          </div>

          {/* COPILOT pill */}
          {showCopilot && (
            <div className="copilot-pill" style={{ marginTop: 18, textAlign: 'center' }}>
              <span style={{
                display: 'inline-block',
                background: 'linear-gradient(135deg, #0891b2, #22c55e)',
                color: 'white',
                fontWeight: 700,
                letterSpacing: '0.2em',
                fontSize: 14,
                padding: '9px 24px',
                borderRadius: 100,
                boxShadow: '0 4px 18px rgba(8,145,178,0.28)',
                fontFamily: 'Space Grotesk, sans-serif',
              }}>
                COPILOT
              </span>
            </div>
          )}

          {/* Tagline typewriter */}
          {taglineStarted && (
            <p className="tagline-wrap" style={{
              textAlign: 'center',
              maxWidth: 460,
              fontSize: 17,
              color: '#6b7280',
              lineHeight: 1.75,
              margin: '30px auto 0',
              fontFamily: 'DM Sans, sans-serif',
            }}>
              {tagline}
              {!taglineCursorHidden && (
                <span style={{
                  display: 'inline-block',
                  width: 2,
                  height: '1em',
                  background: '#0891b2',
                  marginLeft: 2,
                  verticalAlign: 'middle',
                  opacity: taglineCursor ? 1 : (taglineDone ? 0 : 1),
                  transition: 'opacity 0.1s',
                  borderRadius: 1,
                }} />
              )}
            </p>
          )}

          {/* Enter Portal button */}
          {showButton && (
            <button
              className="btn-enter"
              onClick={() => router.push('/login')}
              style={{
                marginTop: 44,
                padding: '16px 52px',
                borderRadius: 100,
                background: '#111827',
                color: 'white',
                fontSize: 17,
                fontWeight: 600,
                fontFamily: 'Space Grotesk, sans-serif',
                border: 'none',
                cursor: 'pointer',
                letterSpacing: '0.01em',
              }}
            >
              Enter Portal →
            </button>
          )}
        </div>

        {/* ── Footer ────────────────────────────────── */}
        <footer style={{
          width: '100%', textAlign: 'center',
          padding: '16px 24px 28px',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'DM Sans, sans-serif' }}>
            v1.0 · Sychar Copilot · Nkoroi Mixed Day Secondary School
          </div>
          <div className="footer-contact" style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'DM Sans, sans-serif' }}>
            James Mark · Lead Developer ·{' '}
            <a href="mailto:peromark24@gmail.com">peromark24@gmail.com</a>
          </div>
        </footer>

      </div>
    </>
  )
}
