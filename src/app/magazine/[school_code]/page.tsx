'use client'

import { useState, useEffect, use } from 'react'

type ContentItem = {
  id: string; section: string; title: string; body: string | null;
  image_url: string | null; featured: boolean; tags: string[]; published_at: string | null;
}

const SECTION_CONFIG: Record<string, { icon: string; label: string }> = {
  about:        { icon: '🏫', label: 'About Us' },
  highlights:   { icon: '✨', label: 'Highlights' },
  achievements: { icon: '🏆', label: 'Achievements' },
  arts:         { icon: '🎨', label: 'Arts & Culture' },
  sports:       { icon: '⚽', label: 'Sports' },
  academics:    { icon: '📚', label: 'Academics' },
  leadership:   { icon: '👑', label: 'Leadership' },
  community:    { icon: '🤝', label: 'Community' },
}

export default function MagazinePage({ params }: { params: Promise<{ school_code: string }> }) {
  const { school_code } = use(params)
  const [sections, setSections] = useState<Record<string, ContentItem[]>>({})
  const [schoolName, setSchoolName] = useState('')
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [contentRes, schoolRes] = await Promise.all([
        fetch(`/api/magazine/content?school_code=${encodeURIComponent(school_code)}`),
        fetch(`/api/schools/info?school_code=${encodeURIComponent(school_code)}`),
      ])
      if (contentRes.ok) { const d = await contentRes.json(); setSections(d.sections ?? {}) }
      if (schoolRes.ok)  { const d = await schoolRes.json(); setSchoolName(d.name ?? '') }
      setLoading(false)
    }
    load()
  }, [school_code])

  const allSections = Object.keys(SECTION_CONFIG)
  const featured    = Object.values(sections).flat().filter(i => i.featured).slice(0, 3)
  const activeSectionItems = activeSection ? (sections[activeSection] ?? []) : []

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">Loading magazine…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-white">
      {/* Masthead — Vogue-style */}
      <header className="border-b-2 border-black">
        <div className="max-w-5xl mx-auto px-6 py-6 text-center">
          <p className="text-xs tracking-[0.4em] text-gray-500 uppercase mb-1">The Official Publication of</p>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-gray-900 uppercase">{schoolName || school_code}</h1>
          <p className="text-xs tracking-[0.3em] text-gray-400 mt-2 uppercase">
            {new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Nav */}
        <nav className="border-t border-gray-200 overflow-x-auto">
          <div className="flex max-w-5xl mx-auto px-6">
            <button onClick={() => setActiveSection(null)}
              className={`text-xs tracking-widest uppercase px-4 py-3 whitespace-nowrap border-b-2 -mb-px font-medium ${!activeSection ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              Home
            </button>
            {allSections.filter(s => sections[s]?.length > 0).map(s => (
              <button key={s} onClick={() => setActiveSection(s)}
                className={`text-xs tracking-widest uppercase px-4 py-3 whitespace-nowrap border-b-2 -mb-px font-medium ${activeSection === s ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {SECTION_CONFIG[s].label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* ── HOME VIEW ────────────────────────────────────────────────── */}
        {!activeSection && (
          <div className="space-y-10">
            {/* Hero featured article */}
            {featured.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Main hero */}
                <div className="md:col-span-2">
                  {featured[0].image_url ? (
                    <div className="relative">
                      <img src={featured[0].image_url} alt={featured[0].title}
                        className="w-full h-64 md:h-96 object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                        <p className="text-xs tracking-widest text-yellow-300 uppercase mb-1">{SECTION_CONFIG[featured[0].section]?.label}</p>
                        <h2 className="text-white text-xl md:text-2xl font-bold leading-tight">{featured[0].title}</h2>
                      </div>
                    </div>
                  ) : (
                    <div className="border-l-4 border-black pl-4">
                      <p className="text-xs tracking-widest text-gray-500 uppercase mb-1">{SECTION_CONFIG[featured[0].section]?.label}</p>
                      <h2 className="text-2xl md:text-3xl font-black text-gray-900 leading-tight">{featured[0].title}</h2>
                      {featured[0].body && <p className="text-gray-600 mt-2 leading-relaxed">{featured[0].body}</p>}
                    </div>
                  )}
                </div>

                {/* Secondary featured */}
                {featured.slice(1, 3).map(item => (
                  <div key={item.id} className="border-t pt-4">
                    {item.image_url && (
                      <img src={item.image_url} alt={item.title} className="w-full h-40 object-cover mb-3" />
                    )}
                    <p className="text-xs tracking-widest text-gray-500 uppercase mb-1">{SECTION_CONFIG[item.section]?.label}</p>
                    <h3 className="font-bold text-gray-900 leading-tight">{item.title}</h3>
                    {item.body && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.body}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Section previews */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {allSections.filter(s => sections[s]?.length > 0).map(s => {
                const items = sections[s]
                const first = items[0]
                return (
                  <button key={s} onClick={() => setActiveSection(s)}
                    className="text-left group">
                    {first.image_url ? (
                      <img src={first.image_url} alt={first.title} className="w-full h-28 object-cover mb-2 group-hover:opacity-90 transition-opacity" />
                    ) : (
                      <div className="w-full h-28 bg-gray-100 flex items-center justify-center text-3xl mb-2">
                        {SECTION_CONFIG[s].icon}
                      </div>
                    )}
                    <p className="text-xs tracking-widest text-gray-500 uppercase">{SECTION_CONFIG[s].label}</p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5 line-clamp-2 group-hover:underline">{first.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{items.length} article{items.length > 1 ? 's' : ''}</p>
                  </button>
                )
              })}
            </div>

            {Object.keys(sections).length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-4">📰</p>
                <p className="text-sm">The magazine is being prepared. Check back soon.</p>
              </div>
            )}
          </div>
        )}

        {/* ── SECTION VIEW ──────────────────────────────────────────────── */}
        {activeSection && (
          <div className="space-y-6">
            <div className="border-b-2 border-black pb-3">
              <p className="text-xs tracking-widest text-gray-400 uppercase mb-1">
                {SECTION_CONFIG[activeSection]?.icon} Section
              </p>
              <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
                {SECTION_CONFIG[activeSection]?.label}
              </h2>
            </div>

            {activeSectionItems.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No content in this section yet</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {activeSectionItems.map((item, i) => (
                <article key={item.id} className={i === 0 ? 'md:col-span-2' : ''}>
                  {item.image_url && (
                    <img src={item.image_url} alt={item.title}
                      className={`w-full object-cover mb-4 ${i === 0 ? 'h-64 md:h-80' : 'h-48'}`} />
                  )}
                  {!item.image_url && (
                    <div className={`w-full bg-gray-50 flex items-center justify-center mb-4 ${i === 0 ? 'h-32' : 'h-24'}`}>
                      <span className="text-4xl">{SECTION_CONFIG[activeSection]?.icon}</span>
                    </div>
                  )}
                  <h3 className={`font-black text-gray-900 leading-tight ${i === 0 ? 'text-xl md:text-2xl' : 'text-base'}`}>
                    {item.title}
                  </h3>
                  {item.body && (
                    <p className="text-gray-600 mt-2 leading-relaxed text-sm">{item.body}</p>
                  )}
                  {item.published_at && (
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(item.published_at).toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                  {item.tags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {item.tags.map(tag => (
                        <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">#{tag}</span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 py-6 text-center text-xs text-gray-400">
        <p>© {new Date().getFullYear()} {schoolName} · Powered by Sychar</p>
      </footer>
    </div>
  )
}
