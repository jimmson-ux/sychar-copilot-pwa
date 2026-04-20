'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

// ── Design tokens ─────────────────────────────────────────────
const C = {
  bg:       '#0a0a0b',
  surface:  '#111114',
  elevated: '#18181d',
  borderSub:'rgba(255,255,255,0.07)',
  borderStr:'rgba(255,255,255,0.13)',
  text:     '#e8e6e1',
  muted:    '#7a7870',
  dim:      '#4a4845',
  accent:   '#e8593c',
  green:    '#1d9e75',
  amber:    '#ef9f27',
  red:      '#e24b4a',
  blue:     '#3b8bd4',
} as const

const FONT_DISPLAY = 'var(--font-display, Syne, sans-serif)'
const FONT_MONO    = 'var(--font-mono, "JetBrains Mono", monospace)'

// ── Types ─────────────────────────────────────────────────────
type LogLevel    = 'info' | 'warning' | 'error' | 'critical'
type LogCategory = 'api' | 'offline_sync' | 'network_latency' | 'auth' | 'database'

type SystemLog = {
  id:         string
  school_id:  string | null
  level:      LogLevel
  category:   LogCategory
  message:    string
  payload:    Record<string, unknown> | null
  created_at: string
}

type SchoolStub = { id: string; name: string }

// ── Level display config ──────────────────────────────────────
const LEVEL_CFG: Record<LogLevel, { color: string; bg: string; border: string; symbol: string }> = {
  info:     { color: C.blue,  bg: `${C.blue}15`,  border: `${C.blue}30`,  symbol: 'INF' },
  warning:  { color: C.amber, bg: `${C.amber}15`, border: `${C.amber}30`, symbol: 'WRN' },
  error:    { color: C.red,   bg: `${C.red}15`,   border: `${C.red}30`,   symbol: 'ERR' },
  critical: { color: '#ff4444', bg: 'rgba(255,68,68,0.18)', border: 'rgba(255,68,68,0.4)', symbol: 'CRT' },
}

const ALL_LEVELS:    LogLevel[]    = ['info', 'warning', 'error', 'critical']
const ALL_CATEGORIES: LogCategory[] = ['api', 'offline_sync', 'network_latency', 'auth', 'database']
const PAGE_SIZE = 100

function formatTs(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-KE', {
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function AdminLogsPage() {
  const [logs,       setLogs]       = useState<SystemLog[]>([])
  const [schools,    setSchools]    = useState<SchoolStub[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [total,      setTotal]      = useState(0)
  const [expanded,   setExpanded]   = useState<string | null>(null)

  // Filters
  const [levelFilter,    setLevelFilter]    = useState<LogLevel | ''>('')
  const [categoryFilter, setCategoryFilter] = useState<LogCategory | ''>('')
  const [schoolFilter,   setSchoolFilter]   = useState<string>('')
  const [searchMsg,      setSearchMsg]      = useState<string>('')

  // ── Fetch ───────────────────────────────────────────────────
  const fetchLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    const supabase = createClient()

    let query = supabase
      .from('system_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (levelFilter)    query = query.eq('level',     levelFilter)
    if (categoryFilter) query = query.eq('category',  categoryFilter)
    if (schoolFilter)   query = query.eq('school_id', schoolFilter)

    const { data, count } = await query

    if (data) {
      let rows = data as SystemLog[]
      // Client-side message search (payload search requires full-text)
      if (searchMsg.trim()) {
        const q = searchMsg.toLowerCase()
        rows = rows.filter(l => l.message.toLowerCase().includes(q))
      }
      setLogs(rows)
      setTotal(count ?? 0)
    }

    if (isRefresh) setRefreshing(false)
    else setLoading(false)
  }, [levelFilter, categoryFilter, schoolFilter, searchMsg])

  // Fetch schools list for dropdown
  useEffect(() => {
    async function fetchSchools() {
      const supabase = createClient()
      const { data } = await supabase
        .from('schools')
        .select('id, name')
        .order('name')
      if (data) setSchools(data as SchoolStub[])
    }
    fetchSchools()
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // ── Level counts from loaded rows ───────────────────────────
  const levelCounts = ALL_LEVELS.reduce((acc, l) => {
    acc[l] = logs.filter(log => log.level === l).length
    return acc
  }, {} as Record<LogLevel, number>)

  const selectStyle: React.CSSProperties = {
    background:   C.elevated,
    border:       `1px solid ${C.borderStr}`,
    borderRadius: 6,
    color:        C.text,
    fontFamily:   FONT_MONO,
    fontSize:     11,
    padding:      '7px 10px',
    outline:      'none',
    cursor:       'pointer',
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FONT_DISPLAY, color: C.text }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 26, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
            System Logs
          </h1>
          <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.muted, margin: '5px 0 0' }}>
            Last {PAGE_SIZE} entries · {total.toLocaleString()} total matching
          </p>
        </div>
        <button
          onClick={() => fetchLogs(true)}
          disabled={refreshing}
          style={{
            background:   C.elevated,
            color:        refreshing ? C.dim : C.text,
            border:       `1px solid ${C.borderStr}`,
            borderRadius: 8,
            padding:      '9px 16px',
            fontFamily:   FONT_MONO,
            fontSize:     11,
            letterSpacing:'0.06em',
            cursor:       refreshing ? 'not-allowed' : 'pointer',
          }}
        >
          {refreshing ? '⟳ Refreshing…' : '⟳ REFRESH'}
        </button>
      </div>

      {/* ── Level summary pills ─────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {ALL_LEVELS.map(l => {
          const cfg = LEVEL_CFG[l]
          return (
            <button
              key={l}
              onClick={() => setLevelFilter(prev => prev === l ? '' : l)}
              style={{
                fontFamily:    FONT_MONO,
                fontSize:      11,
                padding:       '5px 12px',
                borderRadius:  5,
                border:        `1px solid ${levelFilter === l ? cfg.border : C.borderSub}`,
                background:    levelFilter === l ? cfg.bg : 'transparent',
                color:         levelFilter === l ? cfg.color : C.muted,
                cursor:        'pointer',
                transition:    'all 0.15s',
              }}
            >
              {l.toUpperCase()}&nbsp;
              <span style={{ opacity: 0.7 }}>({levelCounts[l]})</span>
            </button>
          )
        })}
      </div>

      {/* ── Filter bar ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Message search */}
        <input
          placeholder="Search message…"
          value={searchMsg}
          onChange={e => setSearchMsg(e.target.value)}
          style={{
            ...selectStyle,
            fontFamily: FONT_DISPLAY,
            fontSize:   13,
            padding:    '7px 12px',
            width:      220,
          }}
        />

        {/* Category filter */}
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value as LogCategory | '')}
          style={selectStyle}
        >
          <option value="">All categories</option>
          {ALL_CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* School filter */}
        <select
          value={schoolFilter}
          onChange={e => setSchoolFilter(e.target.value)}
          style={{ ...selectStyle, maxWidth: 220 }}
        >
          <option value="">All schools</option>
          {schools.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Clear filters */}
        {(levelFilter || categoryFilter || schoolFilter || searchMsg) && (
          <button
            onClick={() => {
              setLevelFilter('')
              setCategoryFilter('')
              setSchoolFilter('')
              setSearchMsg('')
            }}
            style={{
              fontFamily:   FONT_MONO,
              fontSize:     10,
              padding:      '7px 12px',
              borderRadius: 5,
              border:       `1px solid ${C.borderStr}`,
              background:   'transparent',
              color:        C.muted,
              cursor:       'pointer',
              letterSpacing:'0.04em',
            }}
          >
            CLEAR
          </button>
        )}

        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.dim, marginLeft: 'auto' }}>
          {logs.length} rows shown
        </span>
      </div>

      {/* ── Log table ──────────────────────────────────────── */}
      <div style={{
        background:   C.surface,
        border:       `1px solid ${C.borderSub}`,
        borderRadius: 12,
        overflow:     'hidden',
        fontFamily:   FONT_MONO,
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 12 }}>
            Loading…
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.dim, fontSize: 12 }}>
            No log entries match current filters.
          </div>
        ) : (
          logs.map((log, i) => {
            const cfg       = LEVEL_CFG[log.level] ?? LEVEL_CFG.info
            const isExp     = expanded === log.id
            const school    = schools.find(s => s.id === log.school_id)
            const isLast    = i === logs.length - 1

            return (
              <div key={log.id}>
                {/* ── Log row ───────────────────────────── */}
                <div
                  onClick={() => setExpanded(prev => prev === log.id ? null : log.id)}
                  style={{
                    display:       'flex',
                    alignItems:    'flex-start',
                    gap:           12,
                    padding:       '10px 14px',
                    borderBottom:  (!isLast || isExp) ? `1px solid ${C.borderSub}` : 'none',
                    cursor:        'pointer',
                    background:    isExp
                                     ? `${cfg.bg}`
                                     : log.level === 'critical'
                                     ? 'rgba(255,68,68,0.04)'
                                     : 'transparent',
                    transition:    'background 0.1s',
                  }}
                  onMouseEnter={e => {
                    if (!isExp) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'
                  }}
                  onMouseLeave={e => {
                    if (!isExp)
                      (e.currentTarget as HTMLDivElement).style.background =
                        log.level === 'critical' ? 'rgba(255,68,68,0.04)' : 'transparent'
                  }}
                >
                  {/* Timestamp */}
                  <span style={{ fontSize: 10, color: C.dim, whiteSpace: 'nowrap', paddingTop: 1, minWidth: 130 }}>
                    {formatTs(log.created_at)}
                  </span>

                  {/* Level badge */}
                  <span style={{
                    fontSize:      9,
                    fontWeight:    700,
                    letterSpacing: '0.1em',
                    color:         cfg.color,
                    background:    cfg.bg,
                    border:        `1px solid ${cfg.border}`,
                    borderRadius:  3,
                    padding:       '2px 5px',
                    whiteSpace:    'nowrap',
                    alignSelf:     'flex-start',
                  }}>
                    {cfg.symbol}
                  </span>

                  {/* Category */}
                  <span style={{ fontSize: 10, color: C.dim, whiteSpace: 'nowrap', minWidth: 100, paddingTop: 1 }}>
                    {log.category}
                  </span>

                  {/* Message */}
                  <span style={{
                    flex:      1,
                    fontSize:  12,
                    color:     log.level === 'critical' || log.level === 'error' ? C.text : C.muted,
                    fontWeight:log.level === 'critical' ? 600 : 400,
                    overflow:  'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:isExp ? 'normal' : 'nowrap',
                  }}>
                    {log.message}
                  </span>

                  {/* School */}
                  <span style={{ fontSize: 10, color: C.dim, whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {school?.name ?? (log.school_id ? log.school_id.slice(0, 8) + '…' : '—')}
                  </span>

                  {/* Expand indicator */}
                  <span style={{ color: log.payload ? (isExp ? C.accent : C.dim) : 'transparent', fontSize: 10, paddingTop: 1 }}>
                    {log.payload ? (isExp ? '▾' : '▸') : ' '}
                  </span>
                </div>

                {/* ── Expanded payload ──────────────────── */}
                {isExp && log.payload && (
                  <div style={{
                    padding:      '12px 14px 14px',
                    borderBottom: !isLast ? `1px solid ${C.borderSub}` : 'none',
                    background:   C.elevated,
                  }}>
                    <p style={{ fontSize: 9, letterSpacing: '0.1em', color: C.dim, textTransform: 'uppercase', margin: '0 0 8px' }}>
                      Payload
                    </p>
                    <pre style={{
                      margin:     0,
                      fontSize:   11,
                      lineHeight: 1.6,
                      color:      C.muted,
                      background: C.bg,
                      border:     `1px solid ${C.borderSub}`,
                      borderRadius: 6,
                      padding:    '10px 14px',
                      overflowX:  'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak:  'break-all',
                    }}>
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer note if results were capped */}
      {!loading && total > PAGE_SIZE && (
        <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.dim, textAlign: 'center', marginTop: 12 }}>
          Showing latest {PAGE_SIZE} of {total.toLocaleString()} entries. Apply filters to narrow results.
        </p>
      )}
    </div>
  )
}
