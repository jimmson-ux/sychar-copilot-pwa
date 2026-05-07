'use client'

/*
==========================================================================
SEATING MAP UI — LOVABLE BUILD SPEC
==========================================================================

WHAT IT IS:
  A drag-and-drop classroom grid showing every student in their physical
  seat. The class teacher can rearrange students by dragging. Subject
  teachers see the same map in read-only mode (roll-call only).

DATA SOURCES:
  Load map:          GET  /api/seating/roll-call?class=Form+3+East&stream=East
  Move a student:    POST /api/seating/move
  Accept AI move:    POST /api/seating/accept-recommendation
  Get AI analysis:   POST /api/seating/analyze   { seatMapId }
  Principal summary: GET  /api/seating/principal-summary

API RESPONSE SHAPE (roll-call):
  {
    seat_map:   { id, class_name, stream_name, rows, cols, term, academic_year },
    seats: [
      {
        id, student_id, row_number, col_number, seat_label,
        student_name, student_gender, admission_number, photo_url,
        is_discipline_risk, is_high_performer, is_low_performer,
        adjacent_risk_score, placement_note
      }
    ],
    intelligence: { risk_count, urgent_move_count, class_summary, computed_at } | null,
    total_seats, seats_occupied, seats_empty
  }

==========================================================================
RENDERING THE GRID
==========================================================================

  Layout: rows × cols grid.
  Row 1 = FRONT of class (nearest teacher desk, which is at the top of the UI).
  Col 1 = LEFT side.
  Empty cells = light grey placeholder showing seat label ("R3C2").

  TEACHER DESK:
    Render a full-width banner ABOVE row 1:
    ┌──────────────────────────────────────────┐
    │           🧑‍🏫  TEACHER DESK               │
    └──────────────────────────────────────────┘
    Background: slate-100. Not interactive.

  STUDENT CARD (each occupied seat):
    ┌─────────────────────┐
    │ 🔴  J. Kamau        │  ← colored dot = risk flag
    │     R1C3            │  ← seat label, smaller text
    │     45%  ↓          │  ← avg score + trend arrow (if marks exist)
    └─────────────────────┘

    Card border color (priority order — apply first matching):
      RED    border-red-400   : is_discipline_risk = true
      GREEN  border-green-400 : is_high_performer = true
      AMBER  border-amber-400 : is_low_performer = true
      BLUE   border-blue-400  : adjacent_risk_score > 50
      GRAY   border-gray-200  : normal student

    Dot indicator (top-left of card):
      🔴  is_discipline_risk
      🟢  is_high_performer
      🟡  is_low_performer
      ⚪  normal

    Score trend arrow:
      ↑  green  if score > class average
      ↓  red    if score < class average
      —  gray   if no marks data

    Card min size: 80px × 72px (min 44px on mobile for tap target)

==========================================================================
DRAG AND DROP
==========================================================================

  Install: @dnd-kit/core @dnd-kit/sortable  (npm install @dnd-kit/core @dnd-kit/sortable)

  Draggable: each student card (class teacher only — not subject teachers)
  Drop target: every cell in the grid (empty OR occupied)

  ON DROP to an EMPTY cell:
    1. Optimistically update the grid (move card)
    2. POST /api/seating/move {
         seatMapId, studentId,
         fromRow, fromCol,
         toRow, toCol,
         reasonCode, note
       }
    3. Show reason modal (see below)

  ON DROP onto ANOTHER STUDENT (swap):
    1. Optimistically swap both cards
    2. POST /api/seating/move (same payload — API handles swap)
    3. Show reason modal

  REASON MODAL (appears after every drop):
    Title: "Why are you moving [Student Name]?"
    Options (radio):
      [ ] Discipline concern
      [ ] Performance (academic)
      [ ] Teacher's preference
      [ ] AI suggestion
      [ ] Student request
      [ ] Exam rotation
    Optional text: "Add a note (optional)"
    [ Cancel ]  [ Confirm Move ]
    On Cancel: revert the optimistic update
    On Confirm: sends the reasonCode + note with the API call

  MOBILE DRAG:
    On phone: tap-to-select → tap-destination workflow
    First tap: highlight selected student card (blue ring)
    Second tap on target cell: trigger move
    Show modal after second tap

==========================================================================
AI ANALYSIS PANEL
==========================================================================

  TRIGGER BUTTON (top-right of map, class teacher only):
    [ 🤖 Analyse Seating ]
    → POST /api/seating/analyze { seatMapId }
    → Loading state: spinning indicator + "Claude is reviewing seating patterns..."
    → On success: open side panel with results

  SIDE PANEL (slides in from right, 380px wide):

    HEADER:
      "Seating Intelligence"
      Subtitle: "Form 3 East · Term 2 · analysed just now"
      [ ✕ Close ]

    SECTION 1 — Risk Clusters (red badge showing count):
      For each discipline_cluster:
        Student names in red chips
        Seats listed: "R3C2 and R3C3"
        Reason text
        [ 🔀 Separate These Students ] → highlights recommended seat on grid

    SECTION 2 — Performance Recommendations (amber badge):
      For each performance_gap:
        "Move [Low] next to [High]"
        Score comparison: 34% vs 78%
        [ Apply This Move ] → calls accept-recommendation API

    SECTION 3 — Recommended Moves (sorted by priority):
      URGENT chip (red)    → animate pulsing ring on the student card
      SUGGESTED chip (amber)
      OPTIONAL chip (gray)

      Each move shows:
        Student name
        From: R2C3  →  To: R1C1
        Reason text
        Expected outcome text
        [ ✓ Apply ] button → calls accept-recommendation, updates grid

    SECTION 4 — Class Summary:
      AI text paragraph in a card
      "Last analysed: [time ago]"

==========================================================================
ROLL CALL MODE (subject teachers / read-only users)
==========================================================================

  Same grid layout but NO drag handles.
  Each seat card is tappable to cycle attendance state:
    ⬜ (default) → 🟩 Present → 🟥 Absent → 🟨 Late → back to ⬜

  Track state locally: Map<studentId, 'present'|'absent'|'late'|null>

  [ Submit Roll Call ] button (bottom of page):
    POST /api/attendance/lesson {
      class_name, date, period,
      attendance: [{ student_id, status }]
    }
    Disabled until at least one student is marked

==========================================================================
REALTIME UPDATES
==========================================================================

  Subscribe to Supabase Realtime on:
    table: student_seat_assignments
    filter: seat_map_id=eq.{seatMapId}

  On UPDATE event: re-fetch the affected seat and update card in place
  (so co-teachers see moves live)

  Principal dashboard also gets live updates via:
    table: principal_seating_summary
    filter: school_id=eq.{schoolId}

==========================================================================
LEGEND (bottom of map)
==========================================================================

  🔴 Discipline risk
  🟢 High performer
  🟡 Low performer
  🔵 Risky neighbourhood (adjacent_risk_score > 50)
  ⚪ Normal

==========================================================================
TOAST NOTIFICATIONS
==========================================================================

  After successful move:
    "✓ James Kamau moved from R2C3 to R1C1"
    Duration: 3 seconds, bottom-right

  After AI analysis:
    "✓ Seating intelligence updated — 2 risk clusters found"
    Duration: 5 seconds

  On API error:
    "✗ Move failed — please try again"
    Red background

==========================================================================
COMPONENT PROPS
==========================================================================

  interface SeatingMapProps {
    className:   string   // e.g. "Form 3 East"
    streamName:  string   // e.g. "East"
    readOnly?:   boolean  // true for subject teachers
    term?:       number
    year?:       string
  }
*/

import React, { useEffect, useState, useCallback } from 'react'

interface SeatData {
  id:                  string
  student_id:          string
  row_number:          number
  col_number:          number
  seat_label:          string | null
  student_name:        string | null
  student_gender:      string | null
  admission_number:    string | null
  photo_url:           string | null
  is_discipline_risk:  boolean
  is_high_performer:   boolean
  is_low_performer:    boolean
  adjacent_risk_score: number
  placement_note:      string | null
}

interface SeatMap {
  id:           string
  class_name:   string
  stream_name:  string
  rows:         number
  cols:         number
  term:         number
  academic_year: string
}

interface Intelligence {
  risk_count:       number
  urgent_move_count: number
  class_summary:    string | null
  computed_at:      string | null
}

interface SeatingMapProps {
  className:  string
  streamName: string
  readOnly?:  boolean
  term?:      number
  year?:      string
}

export default function SeatingMap({ className, streamName, readOnly = false, term, year }: SeatingMapProps) {
  const [seatMap,      setSeatMap]      = useState<SeatMap | null>(null)
  const [seats,        setSeats]        = useState<SeatData[]>([])
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [analysing,    setAnalysing]    = useState(false)
  const [showPanel,    setShowPanel]    = useState(false)
  const [analysis,     setAnalysis]     = useState<Record<string, unknown> | null>(null)
  const [toast,        setToast]        = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ class: className, stream: streamName })
    if (term)  params.set('term', String(term))
    if (year)  params.set('year', year)

    const r = await fetch(`/api/seating/roll-call?${params}`)
    if (r.ok) {
      const d = await r.json() as {
        seat_map: SeatMap; seats: SeatData[]; intelligence: Intelligence | null
      }
      setSeatMap(d.seat_map)
      setSeats(d.seats)
      setIntelligence(d.intelligence)
    }
    setLoading(false)
  }, [className, streamName, term, year])

  useEffect(() => { load() }, [load])

  async function runAnalysis() {
    if (!seatMap) return
    setAnalysing(true)
    const r = await fetch('/api/seating/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ seatMapId: seatMap.id }),
    })
    if (r.ok) {
      const d = await r.json() as { analysis: Record<string, unknown> }
      setAnalysis(d.analysis)
      setShowPanel(true)
      await load()
      showToast(`✓ Seating intelligence updated`)
    } else {
      showToast('✗ Analysis failed — please try again')
    }
    setAnalysing(false)
  }

  function getSeatAt(row: number, col: number) {
    return seats.find(s => s.row_number === row && s.col_number === col)
  }

  function cardBorderColor(seat: SeatData) {
    if (seat.is_discipline_risk)       return '#f87171'  // red-400
    if (seat.is_high_performer)        return '#4ade80'  // green-400
    if (seat.is_low_performer)         return '#fbbf24'  // amber-400
    if (seat.adjacent_risk_score > 50) return '#60a5fa'  // blue-400
    return '#e5e7eb'                                      // gray-200
  }

  function riskDot(seat: SeatData) {
    if (seat.is_discipline_risk) return '🔴'
    if (seat.is_high_performer)  return '🟢'
    if (seat.is_low_performer)   return '🟡'
    return '⚪'
  }

  function shortName(full: string | null) {
    if (!full) return '—'
    const parts = full.split(' ')
    return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : full
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
        Loading seating map…
      </div>
    )
  }

  if (!seatMap) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🪑</div>
        <div style={{ fontWeight: 600 }}>No seat map set up for {className}</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Ask the class teacher to create the seating arrangement.</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', position: 'relative' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            🪑 {seatMap.class_name} Seating
          </h2>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {seatMap.rows} rows × {seatMap.cols} cols ·{' '}
            {seats.length} seated
            {intelligence && (
              <span style={{ marginLeft: 8, color: intelligence.risk_count > 0 ? '#dc2626' : '#16a34a' }}>
                · {intelligence.risk_count} risk cluster{intelligence.risk_count !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        {!readOnly && (
          <button
            onClick={runAnalysis}
            disabled={analysing}
            style={{
              padding: '8px 16px', borderRadius: 10, border: 'none', cursor: analysing ? 'wait' : 'pointer',
              background: analysing ? '#e5e7eb' : 'linear-gradient(135deg,#1d4ed8,#7c3aed)',
              color: analysing ? '#6b7280' : 'white', fontWeight: 700, fontSize: 13,
            }}
          >
            {analysing ? '⏳ Analysing…' : '🤖 Analyse Seating'}
          </button>
        )}
      </div>

      {/* Teacher desk */}
      <div style={{
        background: '#f1f5f9', border: '1px dashed #94a3b8',
        borderRadius: 8, padding: '8px 16px', textAlign: 'center',
        fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 12,
      }}>
        🧑‍🏫 TEACHER DESK
      </div>

      {/* Seat grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${seatMap.cols}, 1fr)`,
        gap: 6, marginBottom: 16,
      }}>
        {Array.from({ length: seatMap.rows }, (_, ri) =>
          Array.from({ length: seatMap.cols }, (_, ci) => {
            const row = ri + 1
            const col = ci + 1
            const seat = getSeatAt(row, col)
            const label = `R${row}C${col}`

            return seat ? (
              <div
                key={label}
                style={{
                  border: `2px solid ${cardBorderColor(seat)}`,
                  borderRadius: 8, padding: '6px 8px', background: 'white',
                  minHeight: 72, cursor: readOnly ? 'pointer' : 'grab',
                  fontSize: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  <span style={{ fontSize: 10 }}>{riskDot(seat)}</span>
                  <span style={{ fontWeight: 700, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {shortName(seat.student_name)}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>{label}</div>
              </div>
            ) : (
              <div
                key={label}
                style={{
                  border: '1px dashed #e5e7eb', borderRadius: 8,
                  minHeight: 72, background: '#f9fafb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: '#d1d5db',
                }}
              >
                {label}
              </div>
            )
          })
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#6b7280', marginBottom: 16 }}>
        {[
          { dot: '🔴', label: 'Discipline risk' },
          { dot: '🟢', label: 'High performer' },
          { dot: '🟡', label: 'Low performer' },
          { dot: '🔵', label: 'Risky neighbourhood' },
          { dot: '⚪', label: 'Normal' },
        ].map(l => (
          <span key={l.label}>{l.dot} {l.label}</span>
        ))}
      </div>

      {/* AI Analysis side panel */}
      {showPanel && analysis && (
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
          background: 'white', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          overflowY: 'auto', zIndex: 100, padding: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Seating Intelligence</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{seatMap.class_name} · Term {seatMap.term}</div>
            </div>
            <button
              onClick={() => setShowPanel(false)}
              style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}
            >✕</button>
          </div>

          {/* Class summary */}
          {typeof analysis.class_summary === 'string' && (
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 13, lineHeight: 1.6 }}>
              {analysis.class_summary}
            </div>
          )}

          {/* Recommended moves */}
          {Array.isArray(analysis.recommended_moves) && (analysis.recommended_moves as unknown[]).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                📋 Recommended Moves ({(analysis.recommended_moves as unknown[]).length})
              </div>
              {(analysis.recommended_moves as Array<{
                student_name: string; student_id: string
                from_row: number; from_col: number; to_row: number; to_col: number
                reason: string; priority: string; expected_outcome: string
              }>).map((move, i) => (
                <div key={i} style={{
                  border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 8,
                  borderLeft: `4px solid ${move.priority === 'urgent' ? '#dc2626' : move.priority === 'suggested' ? '#d97706' : '#9ca3af'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{move.student_name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: move.priority === 'urgent' ? '#fee2e2' : move.priority === 'suggested' ? '#fef3c7' : '#f3f4f6',
                      color: move.priority === 'urgent' ? '#dc2626' : move.priority === 'suggested' ? '#d97706' : '#6b7280',
                    }}>
                      {move.priority?.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                    R{move.from_row}C{move.from_col} → R{move.to_row}C{move.to_col}
                  </div>
                  <div style={{ fontSize: 12, color: '#374151', marginBottom: 8 }}>{move.reason}</div>
                  <button
                    onClick={async () => {
                      const r = await fetch('/api/seating/accept-recommendation', {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify({ seatMapId: seatMap.id, recommendedMove: move }),
                      })
                      if (r.ok) {
                        showToast(`✓ ${move.student_name} moved`)
                        await load()
                      }
                    }}
                    style={{
                      padding: '5px 14px', background: '#1d4ed8', color: 'white',
                      border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    ✓ Apply
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 200,
          background: toast.startsWith('✗') ? '#dc2626' : '#16a34a',
          color: 'white', padding: '10px 20px', borderRadius: 10,
          fontWeight: 600, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
