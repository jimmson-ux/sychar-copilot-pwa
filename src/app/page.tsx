'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

function SycharIcon({ size = 80 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Top-left rounded block */}
      <rect x="4" y="4" width="34" height="26" rx="8" fill="#2EA8E0" />
      {/* Bottom-right rounded block */}
      <rect x="22" y="30" width="34" height="26" rx="8" fill="#2EA8E0" />
      {/* White notch top-right — creates the S cutout */}
      <rect x="24" y="4" width="14" height="26" fill="white" />
      {/* White notch bottom-left — creates the S cutout */}
      <rect x="22" y="30" width="14" height="26" fill="white" />
    </svg>
  )
}

function useTypewriter(words: string[], speed = 75, pause = 2200) {
  const [displayed, setDisplayed] = useState('')
  const [wordIndex, setWordIndex] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [waiting, setWaiting] = useState(false)

  useEffect(() => {
    if (waiting) return
    const current = words[wordIndex]
    const timeout = setTimeout(() => {
      if (!deleting) {
        const next = current.substring(0, charIndex + 1)
        setDisplayed(next)
        if (charIndex + 1 === current.length) {
          setWaiting(true)
          setTimeout(() => { setWaiting(false); setDeleting(true) }, pause)
        } else {
          setCharIndex(c => c + 1)
        }
      } else {
        const next = current.substring(0, charIndex - 1)
        setDisplayed(next)
        if (charIndex - 1 === 0) {
          setDeleting(false)
          setWordIndex(i => (i + 1) % words.length)
          setCharIndex(0)
        } else {
          setCharIndex(c => c - 1)
        }
      }
    }, deleting ? speed / 2 : speed)
    return () => clearTimeout(timeout)
  }, [charIndex, deleting, wordIndex, waiting, words, speed, pause])

  return displayed
}

export default function LandingPage() {
  const router = useRouter()

  const typed = useTypewriter([
    'Nkoroi Mixed Senior Secondary',
    'School Management, Reimagined',
    'Seamless. Intelligent.',
    "Built for Kenya's Schools",
  ])

  return (
    <>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .hero-content { animation: fadeUp 0.8s ease forwards; }
        .btn-portal { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .btn-portal:hover { transform: translateY(-2px) !important; box-shadow: 0 10px 32px rgba(26,26,46,0.4) !important; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(145deg, #f0f9ff 0%, #e8f5e9 40%, #fefce8 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "DM Sans", sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Background depth circles */}
        <div style={{ position:'absolute', top:'-80px', right:'-80px', width:'320px', height:'320px', borderRadius:'50%', background:'rgba(46,168,224,0.10)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:'-60px', left:'-60px', width:'260px', height:'260px', borderRadius:'50%', background:'rgba(46,168,224,0.08)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', top:'40%', left:'5%', width:'180px', height:'180px', borderRadius:'50%', background:'rgba(34,197,94,0.06)', pointerEvents:'none' }} />

        {/* Main card */}
        <div className="hero-content" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          zIndex: 1, maxWidth: '500px', width: '100%', textAlign: 'center',
        }}>

          {/* Logo icon in card */}
          <div style={{
            width: 88, height: 88, borderRadius: 22,
            background: 'white',
            boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
            border: '1px solid #e0f2fe',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 28,
          }}>
            <SycharIcon size={56} />
          </div>

          {/* SYCHAR wordmark */}
          <div style={{
            fontSize: 'clamp(44px, 10vw, 72px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: '#1a1a2e',
            lineHeight: 1,
            marginBottom: 10,
            fontFamily: '"Space Grotesk", -apple-system, sans-serif',
          }}>
            SYCHAR
          </div>

          {/* COPILOT teal badge */}
          <div style={{
            display: 'inline-block',
            background: '#0d9488',
            color: 'white',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.18em',
            padding: '6px 18px',
            borderRadius: 20,
            marginBottom: 36,
          }}>
            COPILOT
          </div>

          {/* Typewriter rotating taglines */}
          <div style={{
            fontSize: 'clamp(17px, 4vw, 22px)',
            fontWeight: 500,
            color: '#1e3a5f',
            minHeight: '1.5em',
            marginBottom: 16,
            lineHeight: 1.4,
          }}>
            {typed}
            <span style={{
              display: 'inline-block',
              width: 2, height: '1.1em',
              background: '#2EA8E0',
              marginLeft: 2,
              verticalAlign: 'middle',
              borderRadius: 1,
              animation: 'blink 1s step-end infinite',
            }} />
          </div>

          {/* Static subtitle */}
          <p style={{
            fontSize: 15,
            color: '#64748b',
            lineHeight: 1.7,
            marginBottom: 44,
            maxWidth: 360,
          }}>
            The future of educational management. Seamless, intelligent,
            and designed for the next generation of schools.
          </p>

          {/* Enter Portal button */}
          <button
            className="btn-portal"
            onClick={() => router.push('/login')}
            style={{
              background: '#1a1a2e',
              color: 'white',
              border: 'none',
              borderRadius: 50,
              padding: '17px 50px',
              fontSize: 17,
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.01em',
              boxShadow: '0 4px 20px rgba(26,26,46,0.28)',
            }}
          >
            Enter Portal →
          </button>
        </div>

        {/* Footer */}
        <div style={{
          position: 'absolute', bottom: 20, left: 0, right: 0,
          textAlign: 'center',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            v1.0 · Sychar Copilot · Nkoroi Mixed Senior Secondary School
          </span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            James Mark · Lead Developer ·{' '}
            <a href="mailto:peromark24@gmail.com" style={{ color: '#64748b', textDecoration: 'none' }}>
              peromark24@gmail.com
            </a>
          </span>
        </div>
      </div>
    </>
  )
}
