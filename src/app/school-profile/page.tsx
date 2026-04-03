'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient, SCHOOL_ID } from '@/lib/supabase'
import {
  Users, GraduationCap, Building2, Briefcase,
  MapPin, Phone, Mail, ChevronLeft, ChevronRight, X,
  Plus, Calendar, List
} from 'lucide-react'

function getSb() { return createClient() }

// ── Types ────────────────────────────────────────────────────────────────────

interface Stats { students: number; boys: number; girls: number; staff: number; classes: number }

interface CalEvent {
  date: string   // YYYY-MM-DD
  title: string
  type: string
  color: string
  fromDb?: boolean
}

interface DeptInfo {
  name: string
  icon: string
  color: string
  hod: string
  count: number
  subjects: string[]
}

interface GalleryItem {
  url: string
  caption: string
  category: string
}

// ── Static data ───────────────────────────────────────────────────────────────

const MOCKUP_EVENTS: CalEvent[] = [
  { date: '2026-04-07', title: 'Term 2 Opens',                type: 'academic',       color: '#2176FF' },
  { date: '2026-04-15', title: 'Mid-Term Exams Begin',        type: 'exam',           color: '#DC586D' },
  { date: '2026-04-22', title: 'Mid-Term Exams End',          type: 'exam',           color: '#DC586D' },
  { date: '2026-04-25', title: 'Parent-Teacher Conference',   type: 'event',          color: '#09D1C7' },
  { date: '2026-04-28', title: 'Music & Drama Festival',      type: 'extracurricular', color: '#7c3aed' },
  { date: '2026-05-03', title: 'Inter-School Athletics',      type: 'sports',         color: '#22c55e' },
  { date: '2026-05-10', title: 'KCSE Mock Exams Begin',       type: 'exam',           color: '#DC586D' },
  { date: '2026-05-17', title: 'KCSE Mock Exams End',         type: 'exam',           color: '#DC586D' },
  { date: '2026-05-20', title: 'Science Fair 2026',           type: 'academic',       color: '#FDCA40' },
  { date: '2026-05-29', title: 'Inter-House Sports Competition', type: 'sports',      color: '#22c55e' },
  { date: '2026-06-05', title: 'End of Term 2 Exams Begin',  type: 'exam',           color: '#DC586D' },
  { date: '2026-06-19', title: 'Term 2 Closes',              type: 'academic',       color: '#2176FF' },
  { date: '2026-07-07', title: 'Term 3 Opens',               type: 'academic',       color: '#2176FF' },
  { date: '2026-10-02', title: 'KCSE 2026 Begins',           type: 'kcse',           color: '#B51A2B' },
  { date: '2026-11-06', title: 'Term 3 Closes',              type: 'academic',       color: '#2176FF' },
]

const GALLERY: GalleryItem[] = [
  { url: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600', caption: 'Inter-House Athletics 2025', category: 'Sports' },
  { url: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=600', caption: 'Science Laboratory',          category: 'Academics' },
  { url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600', caption: 'Music & Drama 2025',          category: 'Performing Arts' },
  { url: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600', caption: 'Exam Season',                 category: 'Academics' },
  { url: 'https://images.unsplash.com/photo-1577896851231-70ef18881754?w=600', caption: 'Parent-Teacher Day',          category: 'Community' },
  { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600', caption: 'Prize Giving Day 2025',       category: 'Awards' },
]

const DEPT_META: { name: string; icon: string; color: string; hodRole: string; subjects: string[] }[] = [
  { name: 'Sciences',        icon: '🔬', color: '#16a34a', hodRole: 'hod_sciences',       subjects: ['Biology','Chemistry','Physics','Agriculture','Computer Studies'] },
  { name: 'Mathematics',     icon: '📐', color: '#2176FF', hodRole: 'hod_mathematics',    subjects: ['Mathematics','Business Studies','Economics'] },
  { name: 'Languages',       icon: '📖', color: '#7c3aed', hodRole: 'hod_languages',      subjects: ['English','Kiswahili','French','German','Arabic'] },
  { name: 'Humanities',      icon: '🌍', color: '#b45309', hodRole: 'hod_humanities',     subjects: ['History','Geography','CRE','IRE','Social Studies'] },
  { name: 'Applied Sciences',icon: '⚙️',  color: '#0891b2', hodRole: 'hod_applied_sciences', subjects: ['Technical Drawing','Woodwork','Metalwork','Home Science'] },
  { name: 'Games & Sports',  icon: '⚽', color: '#ea580c', hodRole: 'hod_games_sports',   subjects: ['Physical Education','Games & Sports'] },
]

const TYPE_COLORS: Record<string, string> = {
  exam:           '#DC586D',
  academic:       '#2176FF',
  event:          '#09D1C7',
  sports:         '#22c55e',
  extracurricular:'#7c3aed',
  kcse:           '#B51A2B',
  meeting:        '#d97706',
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString() }

function groupByMonth(events: CalEvent[]): [string, CalEvent[]][] {
  const map = new Map<string, CalEvent[]>()
  for (const ev of events) {
    const [y, m] = ev.date.split('-')
    const key = `${y}-${m}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(ev)
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay()
  return d === 0 ? 6 : d - 1  // Mon=0
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Lightbox({ item, onClose }: { item: GalleryItem; onClose: () => void }) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onClose])
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 44, height: 44, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
        <X size={20} />
      </button>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 900, width: '100%' }}>
        <img src={item.url} alt={item.caption} style={{ width: '100%', maxHeight: '75vh', objectFit: 'cover', borderRadius: 20 }} />
        <div style={{ color: 'white', textAlign: 'center', marginTop: 16, fontSize: 16, fontWeight: 600 }}>{item.caption}</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontSize: 13, marginTop: 4 }}>{item.category}</div>
      </div>
    </div>
  )
}

function AddEventModal({ onClose, onSave }: { onClose: () => void; onSave: (ev: CalEvent) => void }) {
  const [date, setDate] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState('event')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!date || !title.trim()) return
    setSaving(true)
    try {
      const sb = getSb()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from('notices') as any).insert({
        school_id: SCHOOL_ID,
        title: title.trim(),
        notice_type: type,
        event_date: date,
        is_active: true,
      })
      onSave({ date, title: title.trim(), type, color: TYPE_COLORS[type] ?? '#2176FF', fromDb: true })
    } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, padding: 32, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 20px', fontFamily: 'Space Grotesk, sans-serif' }}>Add Calendar Event</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 6 }}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 6 }}>Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title..." style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 6 }}>Type</label>
            <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', background: 'white' }}>
              {Object.keys(TYPE_COLORS).map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '12px 0', border: '1px solid #e5e7eb', borderRadius: 12, background: 'white', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
            <button onClick={save} disabled={saving || !date || !title.trim()} style={{ flex: 1, padding: '12px 0', border: 'none', borderRadius: 12, background: '#2176FF', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving || !date || !title.trim() ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SchoolProfilePage() {
  const galleryRef = useRef<HTMLDivElement>(null)

  const [stats, setStats]               = useState<Stats | null>(null)
  const [depts, setDepts]               = useState<DeptInfo[]>([])
  const [streamPerf, setStreamPerf]     = useState<{ name: string; avg: number }[]>([])
  const [subjectPerf, setSubjectPerf]   = useState<{ name: string; avg: number }[]>([])
  const [events, setEvents]             = useState<CalEvent[]>(MOCKUP_EVENTS)
  const [calView, setCalView]           = useState<'list' | 'month'>('list')
  const [calMonth, setCalMonth]         = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() } })
  const [selectedDay, setSelectedDay]   = useState<number | null>(null)
  const [lightbox, setLightbox]         = useState<GalleryItem | null>(null)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [role, setRole]                 = useState('')

  useEffect(() => {
    try { const c = JSON.parse(localStorage.getItem('sychar_role_cache') ?? '{}'); setRole(c.r ?? '') } catch { /* ignore */ }
    loadAll()
  }, [])

  async function loadAll() {
    const sb = getSb()
    const [statsRes, staffRes, marksStreamRes, marksSubjectRes, eventsRes] = await Promise.allSettled([
      fetch('/api/school-stats'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sb.from('staff_records') as any).select('full_name, sub_role, department').eq('school_id', SCHOOL_ID).eq('is_active', true),
      sb.from('marks').select('score, student_id'),
      sb.from('marks').select('subject, score'),
      sb.from('notices').select('title, event_date, notice_type, description').eq('school_id', SCHOOL_ID).in('notice_type', ['event','exam','meeting','sports','academic','extracurricular','kcse']).not('event_date', 'is', null).order('event_date'),
    ])

    // Stats
    if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
      setStats(await statsRes.value.json())
    }

    // Departments + HOD names
    if (staffRes.status === 'fulfilled' && staffRes.value.data) {
      const staffData = staffRes.value.data as { full_name: string; sub_role: string; department: string | null }[]
      const deptInfos: DeptInfo[] = DEPT_META.map(meta => {
        const hod = staffData.find(s => s.sub_role === meta.hodRole)
        const deptStaff = staffData.filter(s => s.department === meta.name)
        return {
          name:     meta.name,
          icon:     meta.icon,
          color:    meta.color,
          hod:      hod?.full_name ?? 'Not assigned',
          count:    deptStaff.length,
          subjects: meta.subjects,
        }
      })
      setDepts(deptInfos)
    }

    // Performance — stream averages (join with students)
    // We'll just do subject averages since we have marks directly
    if (marksSubjectRes.status === 'fulfilled' && marksSubjectRes.value.data) {
      const rows = marksSubjectRes.value.data as { subject: string; score: number }[]
      const bySubject: Record<string, number[]> = {}
      for (const r of rows) {
        if (!r.subject) continue
        if (!bySubject[r.subject]) bySubject[r.subject] = []
        bySubject[r.subject].push(r.score)
      }
      const avgs = Object.entries(bySubject)
        .map(([name, scores]) => ({ name, avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 3)
      setSubjectPerf(avgs)
    }

    // Events — merge DB + mockup
    if (eventsRes.status === 'fulfilled' && eventsRes.value.data) {
      const dbEvents: CalEvent[] = (eventsRes.value.data as { title: string; event_date: string; notice_type: string }[])
        .filter(r => r.event_date)
        .map(r => ({
          date:   r.event_date.slice(0, 10),
          title:  r.title,
          type:   r.notice_type,
          color:  TYPE_COLORS[r.notice_type] ?? '#2176FF',
          fromDb: true,
        }))
      const dbDates = new Set(dbEvents.map(e => e.date))
      const merged = [...dbEvents, ...MOCKUP_EVENTS.filter(e => !dbDates.has(e.date))]
      merged.sort((a, b) => a.date.localeCompare(b.date))
      if (merged.length > 0) setEvents(merged)
    }
  }

  function canAddEvent() {
    return role === 'principal' || role === 'deputy_principal_academics'
  }

  function handleAddEvent(ev: CalEvent) {
    setEvents(prev => [...prev, ev].sort((a, b) => a.date.localeCompare(b.date)))
    setShowAddEvent(false)
  }

  // Calendar month view helpers
  const { year, month } = calMonth
  const daysInMonth   = getDaysInMonth(year, month)
  const firstDayOfWeek = getFirstDayOfWeek(year, month)
  const monthEvents   = events.filter(e => {
    const [y, m] = e.date.split('-')
    return parseInt(y) === year && parseInt(m) - 1 === month
  })
  const eventsByDay   = new Map<number, CalEvent[]>()
  for (const e of monthEvents) {
    const day = parseInt(e.date.split('-')[2])
    if (!eventsByDay.has(day)) eventsByDay.set(day, [])
    eventsByDay.get(day)!.push(e)
  }

  const grouped = groupByMonth(events)

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fadeUp 0.5s ease forwards; }
        .gallery-scroll::-webkit-scrollbar { height: 6px; }
        .gallery-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 3px; }
        .gallery-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .gallery-card { transition: transform 0.2s ease, box-shadow 0.2s ease; cursor: pointer; }
        .gallery-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.18); }
        .dept-card { transition: box-shadow 0.18s, transform 0.18s; }
        .dept-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.1); transform: translateY(-2px); }
        @media(max-width:640px){
          .hero-title { font-size: 22px !important; }
          .stats-grid { grid-template-columns: 1fr 1fr !important; }
          .identity-grid { grid-template-columns: 1fr !important; }
          .dept-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── SECTION 1 — HERO ───────────────────────────────────────────────── */}
      <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#0e4d2f 100%)', minHeight: 320 }}>
        <div style={{ position: 'absolute', top: -80, right: -80, width: 360, height: 360, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -100, left: -50, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

        <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '48px 24px 56px', zIndex: 2, position: 'relative' }}>
          {/* Shield emblem */}
          <div style={{ width: 90, height: 90, borderRadius: 22, background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, backdropFilter: 'blur(10px)' }}>
            <svg viewBox="0 0 48 56" fill="none" style={{ width: 52, height: 52 }}>
              <path d="M24 2L4 10v18c0 14 10 22 20 26 10-4 20-12 20-26V10L24 2z" fill="rgba(255,255,255,0.9)" />
              <path d="M18 28l4 4 8-10" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <text x="24" y="20" textAnchor="middle" fill="#0f172a" fontSize="7" fontWeight="700" fontFamily="system-ui">NMSS</text>
            </svg>
          </div>

          <h1 className="hero-title" style={{ fontSize: 30, fontWeight: 800, color: 'white', margin: '0 0 8px', fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1.2, maxWidth: 560 }}>
            Nkoroi Mixed Senior Secondary School
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 28 }}>Ongata Rongai · Kajiado County</p>

          {/* Identity pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 36 }}>
            {['KNEC: 31557224', 'S/N: 1834', 'Est. 1984', 'Day School', '844 & CBC'].map(pill => (
              <span key={pill} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: 100, padding: '4px 14px', fontSize: 12, fontWeight: 500, backdropFilter: 'blur(8px)' }}>{pill}</span>
            ))}
          </div>

          {/* Live stats strip */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              { label: 'Students', value: stats ? fmt(stats.students) : '…', icon: '👥', color: '#60a5fa', sub: stats ? `${fmt(stats.boys)} boys · ${fmt(stats.girls)} girls` : null },
              { label: 'Staff',    value: stats ? fmt(stats.staff)    : '…', icon: '👨‍🏫', color: '#86efac', sub: null },
              { label: 'Classes',  value: stats ? fmt(stats.classes)  : '…', icon: '🏫', color: '#c4b5fd', sub: null },
              { label: 'Depts',    value: '6',                               icon: '🏢', color: '#fde68a', sub: null },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: '14px 20px', textAlign: 'center', backdropFilter: 'blur(12px)', minWidth: 90 }}>
                <div style={{ fontSize: 22 }}>{s.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color, fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1.1, marginTop: 4 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{s.label}</div>
                {s.sub && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.sub}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Wave */}
        <svg viewBox="0 0 1440 56" fill="none" style={{ display: 'block', marginTop: -1 }}>
          <path d="M0 56 Q360 0 720 28 Q1080 56 1440 8 L1440 56 Z" fill="#f8fafc" />
        </svg>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px 100px' }}>

        {/* ── SECTION 2 — STATS GRID ───────────────────────────────────────── */}
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginTop: 40 }}>
          {[
            { icon: <Users size={36} />, label: 'TOTAL STUDENTS', value: stats ? fmt(stats.students) : '…', sub: stats ? `${fmt(stats.boys)} boys · ${fmt(stats.girls)} girls` : null, color: '#2176FF', bg: '#eff6ff' },
            { icon: <GraduationCap size={36} />, label: 'TEACHING STAFF', value: stats ? fmt(stats.staff) : '…', sub: 'Across all departments', color: '#22c55e', bg: '#f0fdf4' },
            { icon: <Building2 size={36} />, label: 'ACTIVE CLASSES', value: stats ? fmt(stats.classes) : '…', sub: 'Grade 10 · Form 3 & 4', color: '#7c3aed', bg: '#f5f3ff' },
            { icon: <Briefcase size={36} />, label: 'DEPARTMENTS', value: '6', sub: 'Academic departments', color: '#d97706', bg: '#fffbeb' },
          ].map(cell => (
            <div key={cell.label} style={{ background: cell.bg, border: `1px solid ${cell.color}22`, borderRadius: 20, padding: '24px 20px', textAlign: 'center' }}>
              <div style={{ color: cell.color, display: 'flex', justifyContent: 'center', marginBottom: 12 }}>{cell.icon}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: cell.color, fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1 }}>{cell.value}</div>
              <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 6, fontWeight: 700 }}>{cell.label}</div>
              {cell.sub && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{cell.sub}</div>}
            </div>
          ))}
        </div>

        {/* About paragraph */}
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #f1f5f9', padding: '24px 28px', marginTop: 20, boxShadow: '0 1px 8px rgba(0,0,0,0.04)', lineHeight: 1.75, fontSize: 14, color: '#4b5563' }}>
          A proud, high-performing day school in Ongata Rongai, Kajiado County — established <strong>1984</strong>. We accommodate <strong style={{ color: '#2176FF' }}>{stats ? fmt(stats.students) : '…'} students</strong> — <strong>{stats ? fmt(stats.boys) : '…'} boys</strong> and <strong>{stats ? fmt(stats.girls) : '…'} girls</strong> — served by <strong style={{ color: '#22c55e' }}>{stats ? fmt(stats.staff) : '…'} dedicated teaching staff</strong> across 6 academic departments. We offer both the <strong>8-4-4 curriculum</strong> (KCSE examinations) and the <strong>Competency Based Curriculum (CBC)</strong> for Grade 10, preparing students for national excellence.
          <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280' }}><MapPin size={14} color="#0891b2" /> Ongata Rongai, Kajiado County</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280' }}><Phone size={14} color="#16a34a" /> +254 700 000 000</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280' }}><Mail size={14} color="#7c3aed" /> info@nkoroimixed.sc.ke</div>
          </div>
        </div>

        {/* ── SECTION 3 — SCHOOL IDENTITY ─────────────────────────────────── */}
        <div style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, color: '#111827', margin: '0 0 16px', fontFamily: 'Space Grotesk, sans-serif' }}>🏛 School Identity</h2>
          <div className="identity-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {[
              { label: 'KNEC Code',       value: '31557224' },
              { label: 'Serial Number',   value: '1834' },
              { label: 'School Type',     value: 'Day School' },
              { label: 'Location',        value: 'Ongata Rongai, Kajiado County' },
              { label: 'County',          value: 'Kajiado' },
              { label: 'Curriculum',      value: '844 & CBC' },
              { label: 'Gender',          value: 'Mixed (Boys & Girls)' },
              { label: 'Established',     value: '1984' },
              { label: 'Academic Year',   value: '2025 / 2026' },
            ].map(item => (
              <div key={item.label} style={{ background: 'white', borderRadius: 14, padding: '16px 18px', border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 4 — PERFORMANCE HIGHLIGHTS ──────────────────────────── */}
        {subjectPerf.length > 0 && (
          <div style={{ marginTop: 36 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, color: '#111827', margin: '0 0 16px', fontFamily: 'Space Grotesk, sans-serif' }}>🏆 Performance Highlights</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
              {subjectPerf.map((s, i) => {
                const medals = ['🥇', '🥈', '🥉']
                const colors = ['#d97706', '#6b7280', '#b45309']
                return (
                  <div key={s.name} style={{ background: 'white', borderRadius: 18, border: '1px solid #f1f5f9', padding: '24px 20px', textAlign: 'center', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>{medals[i] ?? '🏅'}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: colors[i] ?? '#374151', fontFamily: 'Space Grotesk, sans-serif' }}>{s.avg}%</div>
                    <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginTop: 4 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Average Score</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── SECTION 5 — CALENDAR ─────────────────────────────────────────── */}
        <div style={{ marginTop: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: 19, fontWeight: 700, color: '#111827', margin: '0 0 2px', fontFamily: 'Space Grotesk, sans-serif' }}>📅 School Calendar 2025/2026</h2>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Updated by Administration</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {canAddEvent() && (
                <button onClick={() => setShowAddEvent(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2176FF', color: 'white', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <Plus size={14} /> Add Event
                </button>
              )}
              <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4 }}>
                <button onClick={() => setCalView('list')} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: calView === 'list' ? 600 : 400, background: calView === 'list' ? 'white' : 'none', color: calView === 'list' ? '#111827' : '#6b7280', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <List size={14} /> List
                </button>
                <button onClick={() => setCalView('month')} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: calView === 'month' ? 600 : 400, background: calView === 'month' ? 'white' : 'none', color: calView === 'month' ? '#111827' : '#6b7280', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Calendar size={14} /> Month
                </button>
              </div>
            </div>
          </div>

          {calView === 'list' ? (
            /* ── LIST VIEW ── */
            <div style={{ background: 'white', borderRadius: 20, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
              {grouped.map(([ym, evs]) => (
                <div key={ym}>
                  <div style={{ padding: '12px 20px', background: '#f9fafb', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {monthLabel(ym)}
                  </div>
                  {evs.map((ev, i) => {
                    const d = new Date(ev.date + 'T00:00:00')
                    const dayN  = d.getDate()
                    const dayW  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]
                    const color = ev.color || TYPE_COLORS[ev.type] || '#2176FF'
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderBottom: '1px solid #f9fafb', borderLeft: `4px solid ${color}` }}>
                        <div style={{ width: 48, textAlign: 'center', flexShrink: 0 }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', fontFamily: 'Space Grotesk, sans-serif', lineHeight: 1 }}>{dayN}</div>
                          <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>{dayW}</div>
                        </div>
                        <div style={{ flex: 1, fontSize: 14, color: '#374151', fontWeight: 500 }}>{ev.title}</div>
                        <span style={{ background: `${color}15`, color, border: `1px solid ${color}30`, borderRadius: 100, padding: '3px 10px', fontSize: 11, fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                          {ev.type}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          ) : (
            /* ── MONTH VIEW ── */
            <div style={{ background: 'white', borderRadius: 20, border: '1px solid #f1f5f9', overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
              {/* Month nav */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                <button onClick={() => setCalMonth(p => { const d = new Date(p.year, p.month - 1); return { year: d.getFullYear(), month: d.getMonth() } })} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif' }}>{MONTH_NAMES[month]} {year}</span>
                <button onClick={() => setCalMonth(p => { const d = new Date(p.year, p.month + 1); return { year: d.getFullYear(), month: d.getMonth() } })} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronRight size={16} />
                </button>
              </div>
              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #f1f5f9' }}>
                {DAY_NAMES.map(d => (
                  <div key={d} style={{ textAlign: 'center', padding: '10px 4px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d}</div>
                ))}
              </div>
              {/* Cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`e${i}`} style={{ minHeight: 80, borderRight: '1px solid #f9fafb', borderBottom: '1px solid #f9fafb', background: '#fafafa' }} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const dayEvs = eventsByDay.get(day) ?? []
                  const today  = new Date()
                  const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year
                  const isSelected = selectedDay === day
                  return (
                    <div key={day} onClick={() => setSelectedDay(isSelected ? null : day)} style={{ minHeight: 80, borderRight: '1px solid #f9fafb', borderBottom: '1px solid #f9fafb', padding: '8px 6px', cursor: 'pointer', background: isSelected ? '#eff6ff' : 'white', transition: 'background 0.15s' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: isToday ? 700 : 500, fontSize: 13, color: isToday ? 'white' : '#374151', background: isToday ? '#2176FF' : 'none', marginBottom: 4 }}>
                        {day}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        {dayEvs.slice(0, 3).map((ev, j) => (
                          <div key={j} style={{ width: 8, height: 8, borderRadius: '50%', background: ev.color }} />
                        ))}
                        {dayEvs.length > 3 && <div style={{ fontSize: 9, color: '#9ca3af' }}>+{dayEvs.length - 3}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Selected day popup */}
              {selectedDay !== null && (eventsByDay.get(selectedDay)?.length ?? 0) > 0 && (
                <div style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', background: '#f9fafb' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>
                    {MONTH_NAMES[month]} {selectedDay}, {year}
                  </div>
                  {eventsByDay.get(selectedDay)!.map((ev, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: ev.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: '#374151' }}>{ev.title}</span>
                      <span style={{ marginLeft: 'auto', background: `${ev.color}15`, color: ev.color, borderRadius: 100, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{ev.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── SECTION 6 — GALLERY ──────────────────────────────────────────── */}
        <div style={{ marginTop: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 19, fontWeight: 700, color: '#111827', margin: '0 0 2px', fontFamily: 'Space Grotesk, sans-serif' }}>📸 School Life</h2>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Official School Gallery</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => galleryRef.current?.scrollBy({ left: -300, behavior: 'smooth' })} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={16} /></button>
              <button onClick={() => galleryRef.current?.scrollBy({ left: 300, behavior: 'smooth' })} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={16} /></button>
            </div>
          </div>
          <div ref={galleryRef} className="gallery-scroll" style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 12 }}>
            {GALLERY.map((item, i) => (
              <div key={i} className="gallery-card" onClick={() => setLightbox(item)} style={{ position: 'relative', flexShrink: 0, width: 280, height: 220, borderRadius: 20, overflow: 'hidden' }}>
                <img src={item.url} alt={item.caption} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading={i === 0 ? 'eager' : 'lazy'} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)' }} />
                <span style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(255,255,255,0.9)', color: '#111827', borderRadius: 100, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{item.category}</span>
                <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, color: 'white', fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{item.caption}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 7 — DEPARTMENTS ──────────────────────────────────────── */}
        <div style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, color: '#111827', margin: '0 0 16px', fontFamily: 'Space Grotesk, sans-serif' }}>🎓 Academic Departments</h2>
          <div className="dept-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 14 }}>
            {(depts.length > 0 ? depts : DEPT_META.map(m => ({ ...m, hod: 'Loading…', count: 0 }))).map(dept => (
              <div key={dept.name} className="dept-card" style={{ background: 'white', borderRadius: 18, border: `1px solid ${dept.color}22`, padding: '20px 20px', borderLeft: `4px solid ${dept.color}`, boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: `${dept.color}15`, border: `1.5px solid ${dept.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                    {dept.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', fontFamily: 'Space Grotesk, sans-serif' }}>{dept.name}</div>
                    <div style={{ fontSize: 12, color: dept.color, fontWeight: 600, marginTop: 2 }}>HOD: {dept.hod}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {dept.subjects.map(s => (
                    <span key={s} style={{ background: `${dept.color}10`, color: dept.color, border: `1px solid ${dept.color}25`, borderRadius: 100, padding: '2px 10px', fontSize: 11, fontWeight: 500 }}>{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 8 — FOOTER ───────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginTop: 64, paddingTop: 28, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4, fontFamily: 'Space Grotesk, sans-serif' }}>
            Nkoroi Mixed Senior Secondary School · KNEC: 31557224 · S/N: 1834
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            Powered by <strong style={{ color: '#0891b2' }}>Sychar Copilot</strong>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}

      {/* Add Event modal */}
      {showAddEvent && <AddEventModal onClose={() => setShowAddEvent(false)} onSave={handleAddEvent} />}
    </div>
  )
}
