'use client'

import { useState, useEffect, use } from 'react'

type LeaderboardEntry = {
  rank: number; student_id: string; full_name: string; class_name: string;
  total_points: number; by_category: Record<string, number>;
}

const CAT_EMOJIS: Record<string, string> = {
  'Academic Excellence':    '📚',
  'Leadership & Character': '👑',
  'Sports & Physical':      '⚽',
  'Arts & Culture':         '🎨',
  'Innovation & Technical': '🔧',
  'School Citizenship':     '🤝',
}
const CAT_COLORS: Record<string, string> = {
  'Academic Excellence':    'bg-blue-100 text-blue-700',
  'Leadership & Character': 'bg-purple-100 text-purple-700',
  'Sports & Physical':      'bg-green-100 text-green-700',
  'Arts & Culture':         'bg-pink-100 text-pink-700',
  'Innovation & Technical': 'bg-orange-100 text-orange-700',
  'School Citizenship':     'bg-teal-100 text-teal-700',
}

export default function HallOfFamePage({ params }: { params: Promise<{ school_code: string }> }) {
  const { school_code } = use(params)
  const [data, setData]         = useState<{ overall: LeaderboardEntry[]; per_category: Record<string, LeaderboardEntry[]>; categories: string[]; total_students_with_points: number } | null>(null)
  const [selectedCat, setSelectedCat] = useState('')
  const [loading, setLoading]   = useState(true)
  const [schoolName, setSchoolName] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [lbRes, schoolRes] = await Promise.all([
        fetch(`/api/talent/leaderboard?school_code=${encodeURIComponent(school_code)}`),
        fetch(`/api/schools/info?school_code=${encodeURIComponent(school_code)}`),
      ])
      if (lbRes.ok)     { const d = await lbRes.json(); setData(d) }
      if (schoolRes.ok) { const d = await schoolRes.json(); setSchoolName(d.name ?? '') }
      setLoading(false)
    }
    load()
  }, [school_code])

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-50 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Loading Hall of Fame…</p>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-red-500 text-sm">School not found</p>
    </div>
  )

  const displayList = selectedCat
    ? (data.per_category[selectedCat] ?? [])
    : data.overall

  const topThree = displayList.slice(0, 3)
  const rest     = displayList.slice(3)

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-50">
      {/* Hero */}
      <div className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white text-center py-10 px-4">
        <p className="text-4xl mb-2">🏆</p>
        <h1 className="text-2xl font-black tracking-tight">{schoolName || school_code}</h1>
        <p className="text-yellow-100 text-sm mt-1">Hall of Fame · {data.total_students_with_points} students recognised</p>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
        {/* Category filter */}
        <div className="flex flex-wrap gap-1 justify-center">
          <button onClick={() => setSelectedCat('')}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium ${!selectedCat ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border-gray-200'}`}>
            All
          </button>
          {data.categories.map(c => (
            <button key={c} onClick={() => setSelectedCat(c)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium ${selectedCat === c ? CAT_COLORS[c] + ' border-current' : 'bg-white text-gray-600 border-gray-200'}`}>
              {CAT_EMOJIS[c]} {c}
            </button>
          ))}
        </div>

        {/* Podium */}
        {topThree.length >= 3 && (
          <div className="flex justify-center items-end gap-3 py-4">
            {([topThree[1], topThree[0], topThree[2]] as (LeaderboardEntry | undefined)[]).map((s, pos) => {
              if (!s) return null
              const heights  = ['h-20', 'h-28', 'h-16']
              const medals   = ['🥈', '🥇', '🥉']
              const podColors = ['bg-gray-200', 'bg-yellow-300', 'bg-orange-200']
              const pts = selectedCat ? (s.by_category[selectedCat] ?? 0) : s.total_points
              return (
                <div key={s.student_id} className="flex flex-col items-center gap-1 flex-1">
                  <p className="text-2xl">{medals[pos]}</p>
                  <p className="text-xs font-bold text-center text-gray-800 leading-tight">{s.full_name.split(' ')[0]}</p>
                  <p className="text-xs text-gray-500">{s.class_name}</p>
                  <div className={`${heights[pos]} w-full ${podColors[pos]} rounded-t-lg flex items-end justify-center pb-2 min-h-12`}>
                    <span className="text-sm font-black text-gray-700">{pts}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Rankings */}
        <div className="space-y-2">
          {rest.map(s => {
            const pts = selectedCat ? (s.by_category[selectedCat] ?? 0) : s.total_points
            return (
              <div key={s.student_id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-400 w-5">#{s.rank}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{s.full_name}</p>
                    <p className="text-xs text-gray-500">{s.class_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!selectedCat && (
                    <div className="flex gap-1 flex-wrap justify-end">
                      {Object.entries(s.by_category).filter(([, v]) => v > 0).slice(0, 3).map(([cat, pts]) => (
                        <span key={cat} className={`text-xs px-1 py-0.5 rounded-full ${CAT_COLORS[cat] ?? ''}`}>
                          {CAT_EMOJIS[cat]}{pts}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="text-sm font-bold text-gray-800">{pts}pts</span>
                </div>
              </div>
            )
          })}
          {displayList.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No recognitions yet</p>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">Powered by Sychar · Updated daily</p>
      </div>
    </div>
  )
}
