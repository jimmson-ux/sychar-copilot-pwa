'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const G = '#16a34a'

type School = {
  school_id:         string
  name:              string
  slug:              string
  school_short_code: string | null
  county:            string | null
  logo_url:          string | null
}

export default function SchoolDirectoryPage() {
  const router  = useRouter()
  const [schools, setSchools] = useState<School[]>([])
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/parent/schools')
      .then(r => r.json())
      .then(d => { setSchools((d as { schools?: School[] }).schools ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const visible = schools.filter(s => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      (s.county ?? '').toLowerCase().includes(q)
    )
  })

  function selectSchool(school: School) {
    if (school.school_short_code) {
      sessionStorage.setItem('parent_google_school_code', school.school_short_code)
    }
    router.push('/parent')
  }

  return (
    <div style={{ minHeight: '100dvh', padding: '24px 20px', background: '#f0fdf4' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#374151', padding: 0 }}
          >
            ←
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#14532d', margin: 0 }}>Find Your School</h1>
            <p style={{ fontSize: 13, color: '#4b7a5e', margin: '2px 0 0' }}>
              {schools.length} school{schools.length !== 1 ? 's' : ''} on Sychar
            </p>
          </div>
        </div>

        {/* Search */}
        <input
          type="search"
          placeholder="Search by school name or county…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            border: '1.5px solid #d1d5db', borderRadius: 12,
            padding: '12px 16px', fontSize: 15, marginBottom: 16,
            background: 'white', outline: 'none',
          }}
        />

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280', fontSize: 14 }}>
            Loading schools…
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 14 }}>
            No schools found. Try a different search.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(school => (
            <div
              key={school.school_id}
              style={{
                background: 'white', borderRadius: 16,
                padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {school.logo_url
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={school.logo_url} alt="" width={42} height={42} style={{ borderRadius: 12, objectFit: 'cover' }} />
                    : <span style={{ fontSize: 20 }}>🏫</span>
                  }
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {school.name}
                  </p>
                  {school.county && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                      {school.county}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => selectSchool(school)}
                style={{
                  background: G, color: 'white',
                  border: 'none', borderRadius: 10,
                  padding: '8px 16px', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                Select
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
