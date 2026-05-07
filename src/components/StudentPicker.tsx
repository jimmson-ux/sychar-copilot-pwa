'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export interface StudentOption {
  id: string
  full_name: string
  admission_no: string | null
  admission_number: string | null
  class_name: string
  stream_name: string
  photo_url: string | null
  gender: string | null
}

interface Props {
  onSelect: (student: StudentOption) => void
  placeholder?: string
  classFilter?: string
  streamFilter?: string
  schoolId: string
  disabled?: boolean
}

function Initials({ name, size = 32 }: { name: string; size?: number }) {
  const parts = name.trim().split(' ')
  const initials = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  const colors = ['#6366f1', '#0891b2', '#16a34a', '#d97706', '#7c3aed', '#db2777']
  const color  = colors[name.charCodeAt(0) % colors.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
      textTransform: 'uppercase',
    }}>
      {initials.toUpperCase()}
    </div>
  )
}

function highlight(text: string, query: string) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <strong style={{ fontWeight: 700 }}>{text.slice(idx, idx + query.length)}</strong>
      {text.slice(idx + query.length)}
    </>
  )
}

function useDebounce<T>(value: T, delay: number): T {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

export default function StudentPicker({ onSelect, placeholder, classFilter, streamFilter, schoolId, disabled }: Props) {
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<StudentOption[]>([])
  const [selected, setSelected] = useState<StudentOption | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [isOpen,   setIsOpen]   = useState(false)
  const [cursor,   setCursor]   = useState(-1)
  const [isMobile, setIsMobile] = useState(false)
  const inputRef  = useRef<HTMLInputElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)
  const debouncedQ = useDebounce(query, 300)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setIsOpen(false); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({ q, schoolId })
      if (classFilter)  params.set('class',  classFilter)
      if (streamFilter) params.set('stream', streamFilter)
      const res  = await fetch(`/api/students/search?${params}`)
      const json = await res.json() as { students?: StudentOption[] }
      setResults(json.students ?? [])
      setIsOpen(true)
      setCursor(-1)
    } finally {
      setLoading(false)
    }
  }, [schoolId, classFilter, streamFilter])

  useEffect(() => { search(debouncedQ) }, [debouncedQ, search])

  function pick(s: StudentOption) {
    setSelected(s)
    setQuery('')
    setResults([])
    setIsOpen(false)
    onSelect(s)
  }

  function clear() {
    setSelected(null)
    setQuery('')
    setResults([])
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function onKey(e: React.KeyboardEvent) {
    if (!isOpen || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); pick(results[cursor]) }
    if (e.key === 'Escape') { setIsOpen(false) }
  }

  const admNo = (s: StudentOption) => s.admission_no ?? s.admission_number ?? '—'

  if (selected) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 10,
        border: '1.5px solid #16a34a', background: '#f0fdf4',
      }}>
        {selected.photo_url
          ? <img src={selected.photo_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
          : <Initials name={selected.full_name} />
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{selected.full_name}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{selected.class_name} {selected.stream_name} · {admNo(selected)}</div>
        </div>
        <button
          onClick={clear}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 18, padding: '0 4px', lineHeight: 1 }}
          aria-label="Clear selection"
        >×</button>
      </div>
    )
  }

  const dropdown = isOpen && results.length > 0 && (
    <div
      ref={listRef}
      style={{
        position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)',
        background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
        boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 999,
        maxHeight: 240, overflowY: 'auto',
      }}
    >
      {results.map((s, i) => (
        <div
          key={s.id}
          onMouseDown={() => pick(s)}
          onMouseEnter={() => setCursor(i)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', cursor: 'pointer',
            background: i === cursor ? '#f0f9ff' : 'white',
            borderBottom: i < results.length - 1 ? '1px solid #f1f5f9' : 'none',
          }}
        >
          {s.photo_url
            ? <img src={s.photo_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            : <Initials name={s.full_name} />
          }
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
              {highlight(s.full_name, query)}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>
              {s.class_name} {s.stream_name} · {admNo(s)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  const noResults = isOpen && !loading && results.length === 0 && query.length >= 2 && (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)',
      background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
      padding: '14px 16px', fontSize: 13, color: '#6b7280',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 999,
    }}>
      No student found matching &quot;{query}&quot;
    </div>
  )

  if (isMobile && isOpen) {
    return (
      <>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => query.length >= 2 && setIsOpen(true)}
            onKeyDown={onKey}
            placeholder={placeholder ?? 'Search student by name or admission no...'}
            disabled={disabled}
            style={{ width: '100%', padding: '10px 36px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
          />
          {loading && (
            <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
              <div style={{ width: 16, height: 16, border: '2px solid #e5e7eb', borderTopColor: '#0891b2', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
          )}
        </div>
        {/* Mobile bottom sheet */}
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000 }} onMouseDown={() => setIsOpen(false)}>
          <div
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'white', borderRadius: '20px 20px 0 0',
              maxHeight: '70vh', display: 'flex', flexDirection: 'column',
              paddingTop: 12,
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div style={{ width: 40, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 12px' }} />
            <div style={{ padding: '0 16px 12px', borderBottom: '1px solid #f1f5f9' }}>
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search student..."
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 15, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {results.map(s => (
                <div key={s.id} onMouseDown={() => pick(s)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f9fafb', cursor: 'pointer' }}>
                  {s.photo_url ? <img src={s.photo_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} /> : <Initials name={s.full_name} size={36} />}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.full_name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{s.class_name} {s.stream_name} · {admNo(s)}</div>
                  </div>
                </div>
              ))}
              {!loading && results.length === 0 && query.length >= 2 && (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#6b7280', fontSize: 14 }}>No student found</div>
              )}
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none', zIndex: 1 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      </div>
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => query.length >= 2 && setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        onKeyDown={onKey}
        placeholder={placeholder ?? 'Search student by name or admission no...'}
        disabled={disabled}
        style={{ width: '100%', padding: '10px 36px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
      />
      {loading && (
        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ width: 16, height: 16, border: '2px solid #e5e7eb', borderTopColor: '#0891b2', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      )}
      {dropdown}
      {noResults}
    </div>
  )
}
