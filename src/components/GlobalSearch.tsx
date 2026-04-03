'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface SearchResult {
  type: 'student' | 'staff' | 'marks' | 'fee'
  id: string
  title: string
  subtitle: string
  link: string
}

interface GlobalSearchProps {
  schoolId: string
}

export default function GlobalSearch({ schoolId }: GlobalSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([])
      setOpen(false)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&schoolId=${schoolId}`)
        if (res.ok) {
          const data = await res.json()
          setResults(data.results ?? [])
          setOpen(true)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [query, schoolId])

  const typeIcon: Record<string, string> = {
    student: '🎓',
    staff: '👤',
    marks: '📊',
    fee: '💰',
  }

  const typeLabel: Record<string, string> = {
    student: 'Student',
    staff: 'Staff',
    marks: 'Marks',
    fee: 'Fee Record',
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 14 }}>🔍</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search students, staff..."
          style={{
            width: '100%',
            padding: '8px 12px 8px 34px',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            fontSize: 13,
            background: '#f9fafb',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && (
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#9ca3af' }}>...</span>
        )}
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          zIndex: 9999,
          overflow: 'hidden',
          maxHeight: 360,
          overflowY: 'auto',
        }}>
          {results.map(result => (
            <button
              key={`${result.type}-${result.id}`}
              onClick={() => {
                router.push(result.link)
                setOpen(false)
                setQuery('')
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                borderBottom: '1px solid #f3f4f6',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{typeIcon[result.type]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.title}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{typeLabel[result.type]} · {result.subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && query.length >= 2 && !loading && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 12,
          padding: '16px', textAlign: 'center', color: '#6b7280', fontSize: 13,
          zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
          No results for &quot;{query}&quot;
        </div>
      )}
    </div>
  )
}
