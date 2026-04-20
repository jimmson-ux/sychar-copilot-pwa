'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────────

interface StaffInfo {
  id: string; full_name: string; sub_role: string; department: string | null
  class_name: string | null; teacher_initials: string | null
  reliability_index: number | null; photo_url: string | null; tsc_number: string | null
}

interface TimetableEntry {
  id: string; class_name: string; subject: string; subject_code: string | null
  period: string; period_number: number; start_time: string; end_time: string; room: string | null
}

interface Student {
  id: string; full_name: string; admission_number: string | null; stream: string | null
}

interface LessonSession {
  id: string; class_name: string; subject: string; date: string; period: number | null
  topic_covered: string | null; micro_score: number | null; check_in_confirmed: boolean
}

interface SchemeRow {
  id: string; subject: string; class_name: string; velocity_pct: number | null; expected_pct: number | null
}

interface MasteryRow {
  topic: string; subject: string; class_name: string; mastery_level: number; assessed_at: string
}

interface AtRiskStudent {
  student_id: string; student_name: string; subject: string; class_name: string
  latest_score: number; trend: number[]
}

interface SchoolRule { id: string; category: string; rule_text: string; severity: number }

interface OverviewData {
  staff: StaffInfo; sub_role: string; today: string
  timetable: TimetableEntry[]; pending_periods: TimetableEntry[]
  class_students: Student[]; recent_sessions: LessonSession[]
  schemes: SchemeRow[]; mastery: MasteryRow[]; at_risk: AtRiskStudent[]
  rules: SchoolRule[]; compliance_score: number
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

const IDB_NAME    = 'sychar-offline'
const IDB_VERSION = 1
const STORE       = 'attendance-queue'

function openIDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { autoIncrement: true })
    }
    req.onsuccess = e => res((e.target as IDBOpenDBRequest).result)
    req.onerror   = () => rej(req.error)
  })
}

async function enqueueAttendance(batch: unknown) {
  const db    = await openIDB()
  const tx    = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  store.add(batch)
  return new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })
}

async function drainQueue(): Promise<unknown[]> {
  const db    = await openIDB()
  const tx    = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  return new Promise((res, rej) => {
    const items: unknown[] = []
    const keys: IDBValidKey[] = []
    const cursor = store.openCursor()
    cursor.onsuccess = e => {
      const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result
      if (c) { items.push(c.value); keys.push(c.key); c.continue() }
      else { keys.forEach(k => store.delete(k)); tx.oncomplete = () => res(items); tx.onerror = () => rej(tx.error) }
    }
    cursor.onerror = () => rej(cursor.error)
  })
}

async function queueCount(): Promise<number> {
  const db    = await openIDB()
  const tx    = db.transaction(STORE, 'readonly')
  const store = tx.objectStore(STORE)
  return new Promise((res, rej) => {
    const req = store.count()
    req.onsuccess = () => res(req.result)
    req.onerror   = () => rej(req.error)
  })
}

// ── Style constants ───────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: 'white', border: '1px solid #f1f5f9', borderRadius: 20,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
}
const PH: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14,
}
function masteryColor(l: number) {
  return l === 4 ? '#16a34a' : l === 3 ? '#2563eb' : l === 2 ? '#d97706' : '#dc2626'
}
function masteryLabel(l: number) {
  return l === 4 ? 'Mastered' : l === 3 ? 'Proficient' : l === 2 ? 'Developing' : 'Emerging'
}

// ── AttendanceModule ──────────────────────────────────────────────────────────

function AttendanceModule({ timetable, students, onSynced }: {
  timetable: TimetableEntry[]; students: Student[]; onSynced: () => void
}) {
  const [tab, setTab]           = useState<'take' | 'history'>('take')
  const [selPeriod, setSel]     = useState<TimetableEntry | null>(timetable[0] ?? null)
  const [marks, setMarks]       = useState<Record<string, { status: string; reason: string }>>({})
  const [saving, setSaving]     = useState(false)
  const [queued, setQueued]     = useState(0)
  const [gps, setGps]           = useState<{ lat: number; lng: number } | null>(null)
  const [history, setHistory]   = useState<unknown[]>([])
  const [histLoad, setHistLoad] = useState(false)

  useEffect(() => {
    queueCount().then(setQueued)
    navigator.geolocation?.getCurrentPosition(p => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }))
  }, [])

  useEffect(() => {
    const h = (e: MessageEvent) => { if (e.data?.type === 'SYNC_ATTENDANCE') flush() }
    navigator.serviceWorker?.addEventListener('message', h)
    return () => navigator.serviceWorker?.removeEventListener('message', h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function flush() {
    const batches = await drainQueue()
    if (!batches.length) { setQueued(0); return }
    try {
      await fetch('/api/teacher/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batches }) })
      setQueued(0); onSynced()
    } catch { for (const b of batches) await enqueueAttendance(b) }
  }

  function markAll(s: string) {
    const next: Record<string, { status: string; reason: string }> = {}
    students.forEach(st => { next[st.id] = { status: s, reason: '' } })
    setMarks(next)
  }

  async function submit() {
    if (!selPeriod || !students.length) return
    setSaving(true)
    const batch = {
      class_name: selPeriod.class_name, subject: selPeriod.subject,
      date: new Date().toISOString().split('T')[0], period: selPeriod.period_number,
      lat: gps?.lat, lng: gps?.lng,
      entries: students.map(s => ({ student_id: s.id, student_name: s.full_name, status: marks[s.id]?.status ?? 'present', reason: marks[s.id]?.reason ?? '' })),
    }
    try {
      const r = await fetch('/api/teacher/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch }) })
      if (!r.ok) throw new Error()
      setMarks({}); onSynced()
    } catch {
      await enqueueAttendance(batch)
      setQueued(await queueCount())
      const reg = await navigator.serviceWorker?.ready
      if (reg && 'sync' in reg) await (reg as ServiceWorkerRegistration & { sync: { register(t: string): Promise<void> } }).sync.register('sync-attendance').catch(() => {})
    }
    setSaving(false)
  }

  useEffect(() => { if (tab === 'history') loadHistory() }, [tab])

  async function loadHistory() {
    setHistLoad(true)
    const r = await fetch(`/api/teacher/attendance?date=${new Date().toISOString().split('T')[0]}`)
    if (r.ok) setHistory((await r.json() as { records: unknown[] }).records)
    setHistLoad(false)
  }

  const STATUS = [
    { v: 'present', l: 'P', color: '#16a34a' },
    { v: 'absent',  l: 'A', color: '#dc2626' },
    { v: 'late',    l: 'L', color: '#d97706' },
    { v: 'excused', l: 'E', color: '#2563eb' },
  ]

  return (
    <div style={CARD}>
      <div style={{ height: 4, background: 'linear-gradient(90deg,#1d4ed8,#059669)' }} />
      <div style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={PH}>Attendance Module</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['take','history'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: tab === t ? '#1d4ed8' : '#f3f4f6', color: tab === t ? 'white' : '#374151', border: 'none' }}>
                {t === 'take' ? 'Take' : 'History'}
              </button>
            ))}
          </div>
        </div>

        {queued > 0 && (
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#92400e', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{queued} batch{queued > 1 ? 'es' : ''} queued offline</span>
            <button onClick={flush} style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Sync now</button>
          </div>
        )}

        {tab === 'take' && (
          <>
            {timetable.length > 0 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14, paddingBottom: 4 }}>
                {timetable.map(t => (
                  <button key={t.id} onClick={() => setSel(t)} style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', background: selPeriod?.id === t.id ? '#1d4ed8' : '#f8fafc', color: selPeriod?.id === t.id ? 'white' : '#374151', borderColor: selPeriod?.id === t.id ? '#1d4ed8' : '#e5e7eb' }}>
                    P{t.period_number} · {t.class_name}
                  </button>
                ))}
              </div>
            )}

            {students.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>No class students — assign a class in your staff profile</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {STATUS.map(o => (
                    <button key={o.v} onClick={() => markAll(o.v)} style={{ flex: 1, padding: '6px 4px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: o.color + '18', color: o.color }}>
                      All {o.v[0].toUpperCase() + o.v.slice(1)}
                    </button>
                  ))}
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {students.map(s => {
                    const m = marks[s.id] ?? { status: 'present', reason: '' }
                    const sc = STATUS.find(o => o.v === m.status) ?? STATUS[0]
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f9fafb', borderRadius: 10, border: `1px solid ${sc.color}30` }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: sc.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: sc.color, flexShrink: 0 }}>
                          {s.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</div>
                          {s.admission_number && <div style={{ fontSize: 10, color: '#9ca3af' }}>{s.admission_number}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 3 }}>
                          {STATUS.map(o => (
                            <button key={o.v} onClick={() => setMarks(prev => ({ ...prev, [s.id]: { ...m, status: o.v } }))} style={{ width: 26, height: 26, borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: 'pointer', border: '1px solid', background: m.status === o.v ? o.color : 'white', color: m.status === o.v ? 'white' : o.color, borderColor: o.color }}>
                              {o.l}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                  <div style={{ flex: 1, fontSize: 11, color: '#9ca3af' }}>{gps ? `GPS ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : 'Acquiring GPS…'}</div>
                  <button onClick={submit} disabled={saving} style={{ padding: '10px 20px', background: saving ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#059669)', color: 'white', border: 'none', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                    {saving ? 'Saving…' : 'Submit Attendance'}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {tab === 'history' && (
          histLoad ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
          : history.length === 0 ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>No records for today</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(history as Array<{ id: string; student_name: string; status: string; period: number; subject: string }>).map(r => {
                const sc = STATUS.find(o => o.v === r.status) ?? STATUS[0]
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f9fafb', borderRadius: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{r.student_name}</span>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>P{r.period} · {r.subject}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: sc.color + '18', color: sc.color }}>{r.status}</span>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}

// ── LessonLogPanel ────────────────────────────────────────────────────────────

function LessonLogPanel({ sessions, timetable }: { sessions: LessonSession[]; timetable: TimetableEntry[] }) {
  const [activeId, setActiveId] = useState('')
  const [topic, setTopic]       = useState('')
  const [score, setScore]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [done, setDone]         = useState<Set<string>>(new Set())

  async function startSession(t: TimetableEntry) {
    const r = await fetch('/api/teacher/lesson-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_name: t.class_name, subject: t.subject, period: t.period_number, start_time: new Date().toISOString(), is_active: true }) })
    if (r.ok) { const { id } = await r.json() as { id: string }; setActiveId(id) }
  }

  async function log() {
    if (!activeId || !topic.trim()) return
    setSaving(true)
    await fetch('/api/teacher/lesson-session', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: activeId, topic_covered: topic, micro_score: score ? Number(score) : null }) })
    setDone(d => new Set(d).add(activeId)); setTopic(''); setScore(''); setSaving(false)
  }

  return (
    <div style={CARD}>
      <div style={{ height: 4, background: 'linear-gradient(90deg,#7c3aed,#1d4ed8)' }} />
      <div style={{ padding: '18px 20px' }}>
        <div style={PH}>Lesson Log</div>

        {timetable.length > 0 && !activeId && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Start a session:</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {timetable.map(t => (
                <button key={t.id} onClick={() => startSession(t)} style={{ padding: '5px 12px', background: '#f3f4f6', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                  P{t.period_number} · {t.subject} · {t.class_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeId && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, marginBottom: 8 }}>Active session</div>
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topic covered…" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={score} onChange={e => setScore(e.target.value)} placeholder="Score 0–10" type="number" min={0} max={10} style={{ width: 120, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }} />
              <button onClick={log} disabled={saving} style={{ flex: 1, padding: '8px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Log Topic'}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sessions.length === 0
            ? <div style={{ textAlign: 'center', padding: '16px 0', color: '#9ca3af', fontSize: 13 }}>No sessions in the last 14 days</div>
            : sessions.slice(0, 10).map(s => (
              <div key={s.id} style={{ display: 'flex', gap: 12, padding: '8px 12px', background: '#f9fafb', borderRadius: 8 }}>
                <div style={{ flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>{new Date(s.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</div>
                  {s.period && <div style={{ fontSize: 10, color: '#9ca3af' }}>P{s.period}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{s.subject} · {s.class_name}</div>
                  {s.topic_covered && <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.topic_covered}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  {s.micro_score != null && <span style={{ padding: '2px 7px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{s.micro_score}/10</span>}
                  {s.check_in_confirmed && <span style={{ fontSize: 9, color: '#16a34a' }}>✓ QR</span>}
                  {done.has(s.id) && <span style={{ fontSize: 9, color: '#16a34a' }}>✓ saved</span>}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

// ── TopicMasteryHeatmap ───────────────────────────────────────────────────────

function TopicMasteryHeatmap({ mastery }: { mastery: MasteryRow[] }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm]     = useState({ topic: '', subject: '', class_name: '', mastery_level: 2 })
  const [saving, setSaving] = useState(false)
  const [local, setLocal]   = useState<MasteryRow[]>(mastery)

  useEffect(() => setLocal(mastery), [mastery])

  async function save() {
    if (!form.topic || !form.subject || !form.class_name) return
    setSaving(true)
    await fetch('/api/teacher/topic-mastery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setLocal(l => [...l, { ...form, assessed_at: new Date().toISOString().split('T')[0] }])
    setAdding(false); setSaving(false)
  }

  const grouped: Record<string, MasteryRow[]> = {}
  for (const r of local) {
    const k = `${r.subject}|${r.class_name}`
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(r)
  }

  return (
    <div style={CARD}>
      <div style={{ height: 4, background: 'linear-gradient(90deg,#d97706,#dc2626)' }} />
      <div style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={PH}>Topic Mastery Heatmap</div>
          <button onClick={() => setAdding(a => !a)} style={{ padding: '4px 12px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {[1,2,3,4].map(l => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: masteryColor(l), display: 'block' }} />
              <span style={{ fontSize: 10, color: '#6b7280' }}>L{l}: {masteryLabel(l)}</span>
            </div>
          ))}
        </div>

        {adding && (
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, padding: '12px', marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input placeholder="Topic" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12 }} />
              <input placeholder="Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12 }} />
              <input placeholder="Class (e.g. Form 2)" value={form.class_name} onChange={e => setForm(f => ({ ...f, class_name: e.target.value }))} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12 }} />
              <select value={form.mastery_level} onChange={e => setForm(f => ({ ...f, mastery_level: Number(e.target.value) }))} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12 }}>
                {[1,2,3,4].map(l => <option key={l} value={l}>L{l}: {masteryLabel(l)}</option>)}
              </select>
            </div>
            <button onClick={save} disabled={saving} style={{ width: '100%', padding: '8px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}

        {Object.keys(grouped).length === 0
          ? <div style={{ textAlign: 'center', padding: '16px 0', color: '#9ca3af', fontSize: 13 }}>No mastery data yet</div>
          : Object.entries(grouped).map(([key, rows]) => {
            const [subject, cls] = key.split('|')
            return (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>{subject} · {cls}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {rows.map((r, i) => (
                    <div key={i} title={`${r.topic}: ${masteryLabel(r.mastery_level)}`} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: masteryColor(r.mastery_level) + '20', color: masteryColor(r.mastery_level), border: `1px solid ${masteryColor(r.mastery_level)}40` }}>
                      {r.topic}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}

// ── AtRiskRadar ───────────────────────────────────────────────────────────────

function AtRiskRadar({ atRisk, schoolId }: { atRisk: AtRiskStudent[]; schoolId: string }) {
  const [confirm, setConfirm] = useState<AtRiskStudent | null>(null)
  const [sending, setSending] = useState(false)

  async function sendSms(s: AtRiskStudent) {
    setSending(true)
    await fetch('/api/notifications/sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: s.student_id, school_id: schoolId, message: `Dear Parent, ${s.student_name} scored ${s.latest_score}% in ${s.subject} and needs support. Please contact the school.` }) }).catch(() => {})
    setSending(false); setConfirm(null)
  }

  return (
    <div style={CARD}>
      <div style={{ height: 4, background: 'linear-gradient(90deg,#dc2626,#d97706)' }} />
      <div style={{ padding: '18px 20px' }}>
        <div style={PH}>At-Risk Radar</div>
        {atRisk.length === 0
          ? <div style={{ textAlign: 'center', padding: '16px 0', color: '#16a34a', fontSize: 13, fontWeight: 600 }}>No at-risk students detected</div>
          : atRisk.map(s => {
            const declining = s.trend.length >= 2 && s.trend[0] < s.trend[1]
            return (
              <div key={`${s.student_id}|${s.subject}`} style={{ padding: '10px 12px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{s.student_name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{s.subject} · {s.class_name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626' }}>{s.latest_score}%</div>
                    {declining && <div style={{ fontSize: 10, color: '#d97706' }}>↓ Declining</div>}
                  </div>
                </div>
                {s.trend.length > 0 && (
                  <div style={{ display: 'flex', gap: 3, marginTop: 8, alignItems: 'flex-end', height: 20 }}>
                    {s.trend.slice(0, 5).reverse().map((v, i) => (
                      <div key={i} style={{ flex: 1, height: `${Math.max(3, (v / 100) * 20)}px`, background: v < 40 ? '#dc2626' : v < 60 ? '#d97706' : '#16a34a', borderRadius: 2, opacity: 0.75 }} />
                    ))}
                  </div>
                )}
                <button onClick={() => setConfirm(s)} style={{ marginTop: 8, padding: '4px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  SMS Parent
                </button>
              </div>
            )
          })}

        {confirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', borderRadius: 16, padding: '24px', maxWidth: 300, width: '90%' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Send SMS?</div>
              <div style={{ fontSize: 13, color: '#374151', marginBottom: 20 }}>Notify parent of <strong>{confirm.student_name}</strong> about their {confirm.subject} score ({confirm.latest_score}%).</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirm(null)} style={{ flex: 1, padding: '9px', background: '#f3f4f6', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancel</button>
                <button onClick={() => sendSms(confirm)} disabled={sending} style={{ flex: 1, padding: '9px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>{sending ? 'Sending…' : 'Send'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeacherDashboardPage() {
  const router        = useRouter()
  const [data, setData]     = useState<OverviewData | null>(null)
  const [loading, setLoad]  = useState(true)
  const [staffName, setName] = useState('')
  const [schoolId, setSid]  = useState('')
  const syncedRef           = useRef(false)

  const load = useCallback(async () => {
    setLoad(true)
    try {
      const r = await fetch('/api/teacher/overview')
      if (r.status === 401) { router.push('/login'); return }
      if (r.ok) setData(await r.json())
    } catch { /* silent — offline */ }
    setLoad(false)
  }, [router])

  useEffect(() => {
    setName(localStorage.getItem('sychar_staff_name') ?? '')
    setSid(localStorage.getItem('sychar_school_id') ?? process.env.NEXT_PUBLIC_SCHOOL_ID ?? '')
    load()
  }, [load])

  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.type === 'SYNC_ATTENDANCE' && !syncedRef.current) { syncedRef.current = true; load() }
    }
    navigator.serviceWorker?.addEventListener('message', h)
    return () => navigator.serviceWorker?.removeEventListener('message', h)
  }, [load])

  const staff    = data?.staff
  const subRole  = data?.sub_role ?? ''
  const isClass  = ['class_teacher', 'bom_teacher'].includes(subRole)
  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const first    = (staff?.full_name ?? staffName).split(' ')[0]
  const comp     = data?.compliance_score ?? 0
  const compClr  = comp >= 80 ? '#16a34a' : comp >= 50 ? '#d97706' : '#dc2626'

  return (
    <div style={{ padding: '20px 20px 40px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
          {greeting}, {first}
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          {new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[120, 200, 300].map(h => <div key={h} className="skeleton" style={{ height: h, borderRadius: 16 }} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Stats bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { l: "Today's Lessons",    v: data?.timetable.length ?? 0,       c: '#1d4ed8' },
              { l: 'Pending Attendance', v: data?.pending_periods.length ?? 0, c: '#d97706' },
              { l: 'Compliance',         v: `${comp}%`,                        c: compClr  },
            ].map(s => (
              <div key={s.l} style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: 14, padding: '12px 14px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Timetable strip */}
          {(data?.timetable.length ?? 0) > 0 && (
            <div style={CARD}>
              <div style={{ padding: '14px 18px' }}>
                <div style={PH}>Today's Timetable</div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {data!.timetable.map(t => (
                    <div key={t.id} style={{ flexShrink: 0, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '8px 12px', minWidth: 86, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8' }}>P{t.period_number}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', marginTop: 1 }}>{t.class_name?.split(' ').slice(-1)[0]}</div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>{t.subject_code ?? t.subject?.slice(0, 5)}</div>
                      <div style={{ fontSize: 9, color: '#9ca3af' }}>{t.start_time?.slice(0, 5)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Attendance module — class teachers */}
          {isClass && (
            <AttendanceModule
              timetable={data?.timetable ?? []}
              students={data?.class_students ?? []}
              onSynced={() => { syncedRef.current = false; load() }}
            />
          )}

          {/* At-risk radar — subject teachers */}
          {(data?.at_risk.length ?? 0) > 0 && (
            <AtRiskRadar atRisk={data!.at_risk} schoolId={schoolId} />
          )}

          {/* Syllabus velocity */}
          {(data?.schemes.length ?? 0) > 0 && (
            <div style={CARD}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#059669,#1d4ed8)' }} />
              <div style={{ padding: '18px 20px' }}>
                <div style={PH}>Syllabus Velocity</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data!.schemes.map(s => {
                    const v = s.velocity_pct ?? 0; const e = s.expected_pct ?? 0; const lag = e - v
                    return (
                      <div key={s.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{s.subject} · {s.class_name}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: lag > 10 ? '#dc2626' : lag > 0 ? '#d97706' : '#16a34a' }}>
                            {v}%{lag > 5 ? ` (${Math.round(lag)}% behind)` : ''}
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${e}%`, background: '#e5e7eb', borderRadius: 3 }} />
                          <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${v}%`, background: lag > 10 ? '#dc2626' : lag > 0 ? '#d97706' : '#16a34a', borderRadius: 3, transition: 'width 0.6s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Topic mastery heatmap */}
          <TopicMasteryHeatmap mastery={data?.mastery ?? []} />

          {/* Lesson log */}
          <LessonLogPanel sessions={data?.recent_sessions ?? []} timetable={data?.timetable ?? []} />

          {/* Compliance */}
          <div style={CARD}>
            <div style={{ padding: '16px 20px' }}>
              <div style={PH}>My Compliance Status</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Reliability Index</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: compClr }}>{comp}%</span>
              </div>
              <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${comp}%`, background: compClr, borderRadius: 4, transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
                {[
                  { l: 'Lessons Logged',       v: data?.recent_sessions.length ?? 0 },
                  { l: 'Topics Tracked',        v: data?.mastery.length ?? 0 },
                  { l: 'TSC No.',               v: staff?.tsc_number ?? '—' },
                ].map(i => (
                  <div key={i.l} style={{ background: '#f9fafb', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>{i.v}</div>
                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{i.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
