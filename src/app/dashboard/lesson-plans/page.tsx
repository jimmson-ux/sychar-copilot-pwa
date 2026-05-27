'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, CheckCircle2, Loader2, Brain, BookOpen, Heart,
  Lightbulb, ChevronRight, ChevronLeft, ThumbsUp, ThumbsDown, RefreshCw,
} from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'

// ─── Constants ───────────────────────────────────────────────────────────────

const COGNITIVE_VERBS  = ["Identify","Define","State","Describe","Explain","Calculate","Analyze","Apply","Evaluate","Construct","Solve","Compare","Classify","Demonstrate","Deduce","Investigate","Justify"]
const PSYCHOMOTOR_VERBS = ["Demonstrate","Construct","Perform","Draw","Assemble","Write","Create","Design","Present","Solve","Measure","Sketch"]
const AFFECTIVE_VERBS  = ["Appreciate","Value","Exhibit","Accept","Participate","Show","Respect","Support","Promote","Develop","Uphold","Advocate"]
const OBJ_VERBS        = [...new Set([...COGNITIVE_VERBS, ...PSYCHOMOTOR_VERBS])].sort()

const CORE_COMPETENCIES   = ["Communication and Collaboration","Critical Thinking and Problem Solving","Creativity and Imagination","Citizenship","Digital Literacy","Learning to Learn","Self-Efficacy"]
const CORE_VALUES         = ["Respect","Responsibility","Integrity","Unity","Patriotism","Social Justice","Love"]
const PCIS                = ["Citizenship & Patriotism","Environmental and Sustainability Education (ESD)","Health Education","Financial Literacy","Parental Empowerment","Gender","Disaster Risk Reduction","Social Cohesion","Peace Education"]
const CROSS_CUTTING       = ["Peace Education","HIV/AIDS Education","Human Rights","Gender Equity","Environmental Education","Financial Literacy","Drugs and Substance Abuse","Life Skills"]
const LEARNING_RESOURCES  = ["Approved Textbook (KICD / KIE certified)","Chalkboard / Whiteboard","Charts and Diagrams","Digital Devices / Projector","Realia (concrete objects)","Laboratory Apparatus","Past Paper Questions","Student Workbooks","Flash Cards"]

const STEPS = ["Admin","Curriculum","Resources","Reflection"] as const
type Step = (typeof STEPS)[number]

const HOD_ROLES   = new Set(['hod_sciences','hod_arts','hod_languages','hod_mathematics','hod_social_sciences','hod_technical','hod_pathways'])
const ADMIN_ROLES = new Set(['principal','deputy_principal','deputy_principal_academic','dean_of_studies'])

const ACADEMIC_YEAR = '2025/2026'

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const [cls, label] =
    status === 'approved'  ? ['bg-emerald-100 text-emerald-700', 'Approved'] :
    status === 'submitted' ? ['bg-blue-100 text-blue-700',       'Pending HOD'] :
    status === 'rejected'  ? ['bg-red-100 text-red-700',         'Rejected'] :
                             ['bg-amber-100 text-amber-700',     'Draft']
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>
}

function VerbSelect({ verbs, value, onChange }: { verbs: string[]; value: string; onChange: (v: string) => void }) {
  const parts = value.split(' ')
  const verb = verbs.includes(parts[0]) ? parts[0] : ''
  const rest = verb ? parts.slice(1).join(' ') : value
  return (
    <div className="flex gap-1.5">
      <select value={verb} onChange={e => onChange(e.target.value + (rest ? ' ' + rest : ''))}
        className="h-9 w-36 flex-none rounded-lg border border-slate-200 bg-white px-2 text-sm">
        <option value="">Action verb…</option>
        {verbs.map(v => <option key={v}>{v}</option>)}
      </select>
      <input value={rest} onChange={e => onChange((verb ? verb + ' ' : '') + e.target.value)}
        placeholder="…the concept using available resources"
        className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm" />
    </div>
  )
}

function Chips({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void
}) {
  const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o])
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <button key={o} type="button" onClick={() => toggle(o)}
            className={`rounded-full px-2.5 py-1 text-xs transition ${selected.includes(o)
              ? 'bg-indigo-600 text-white'
              : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-400'}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type StaffRow = { id: string; full_name: string; school_id: string; sub_role: string; assigned_class: string | null }
type Plan     = Record<string, any>

function isCBC(cls: string) { return /grade\s*\d+/i.test(cls) }

export default function LessonPlansPage() {
  const router = useRouter()
  const sb = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const [staff,        setStaff]        = useState<StaffRow | null>(null)
  const [role,         setRole]         = useState('')
  const [subjects,     setSubjects]     = useState<string[]>([])
  const [myPlans,      setMyPlans]      = useState<Plan[]>([])
  const [pendingPlans, setPendingPlans] = useState<Plan[]>([])

  const [step,      setStep]      = useState<Step>('Admin')
  const [saving,    setSaving]    = useState(false)
  const [approving, setApproving] = useState<string | null>(null)
  const [rejectId,  setRejectId]  = useState<string | null>(null)
  const [hodComment,setHodComment]= useState('')

  // ── Form state ──────────────────────────────────────────────────────────────
  const [subject,    setSubject]    = useState('')
  const [className,  setClassName]  = useState('')
  const [curriculum, setCurriculum] = useState<'CBC' | '8-4-4'>('8-4-4')
  const [dateTaught, setDateTaught] = useState(new Date().toISOString().slice(0, 10))
  const [period,     setPeriod]     = useState('P1')
  const [rollPresent,setRollPresent]= useState('')
  const [rollTotal,  setRollTotal]  = useState('')
  const [strand,     setStrand]     = useState('')
  const [subStrand,  setSubStrand]  = useState('')
  // CBC
  const [sloCog, setSloCog] = useState('')
  const [sloPsy, setSloPsy] = useState('')
  const [sloAff, setSloAff] = useState('')
  const [kiq,    setKiq]    = useState('')
  const [competencies, setCompetencies] = useState<string[]>([])
  const [values,       setValues]       = useState<string[]>([])
  const [pcis,         setPcis]         = useState<string[]>([])
  // 8-4-4
  const [obj1, setObj1] = useState('')
  const [obj2, setObj2] = useState('')
  const [crossCutting, setCrossCutting] = useState<string[]>([])
  // Shared
  const [resources,       setResources]       = useState<string[]>(['Approved Textbook (KICD / KIE certified)'])
  const [homework,        setHomework]        = useState('')
  const [reflPct,         setReflPct]         = useState('')
  const [reflWell,        setReflWell]        = useState('')
  const [reflChallenges,  setReflChallenges]  = useState('')

  // ── Data loaders ────────────────────────────────────────────────────────────

  async function loadMyPlans(staffId: string) {
    const { data } = await sb
      .from('lesson_plans')
      .select('id, subject_name, class_name, cbc_strand, date_taught, period_number, status, curriculum_type')
      .eq('teacher_id', staffId)
      .order('date_taught', { ascending: false })
      .limit(20)
    setMyPlans(data ?? [])
  }

  async function loadPendingPlans() {
    const res  = await fetch(`/api/lesson-plans?status=submitted&year=${ACADEMIC_YEAR}`)
    const json = await res.json().catch(() => ({}))
    setPendingPlans(json.plans ?? [])
  }

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/login'); return }
      const { data: sr } = await sb
        .from('staff_records')
        .select('id, full_name, school_id, sub_role, assigned_class')
        .eq('user_id', data.user.id)
        .maybeSingle()
      if (!sr) return
      setStaff(sr)
      setRole(sr.sub_role ?? '')
      setClassName(sr.assigned_class ?? '')
      setCurriculum(isCBC(sr.assigned_class ?? '') ? 'CBC' : '8-4-4')
      const { data: subs } = await sb
        .from('teacher_subject_assignments')
        .select('subject_name')
        .eq('teacher_id', sr.id)
        .eq('is_active', true)
      setSubjects((subs ?? []).map((s: any) => s.subject_name))
      await loadMyPlans(sr.id)
      if (HOD_ROLES.has(sr.sub_role) || ADMIN_ROLES.has(sr.sub_role)) {
        await loadPendingPlans()
      }
    })
  }, [])

  useEffect(() => { setCurriculum(isCBC(className) ? 'CBC' : '8-4-4') }, [className])

  // ── Form helpers ────────────────────────────────────────────────────────────

  const stepIdx = STEPS.indexOf(step)

  function canProceed() {
    if (step === 'Admin')      return !!subject.trim() && !!strand.trim() && !!dateTaught
    if (step === 'Curriculum') return curriculum === 'CBC'
      ? !!sloCog.trim() && !!sloPsy.trim() && !!sloAff.trim()
      : !!obj1.trim() && !!obj2.trim()
    return true
  }

  function resetForm() {
    setStep('Admin')
    setSubject(''); setStrand(''); setSubStrand('')
    setRollPresent(''); setRollTotal('')
    setSloCog(''); setSloPsy(''); setSloAff(''); setKiq('')
    setCompetencies([]); setValues([]); setPcis([])
    setObj1(''); setObj2(''); setCrossCutting([])
    setResources(['Approved Textbook (KICD / KIE certified)']); setHomework('')
    setReflPct(''); setReflWell(''); setReflChallenges('')
    setDateTaught(new Date().toISOString().slice(0, 10))
  }

  async function saveAs(submit: boolean) {
    if (!staff) return
    setSaving(true)
    try {
      const res = await fetch('/api/lesson-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id:    staff.school_id,
          teacher_id:   staff.id,
          subject_name: subject,
          class_name:   className,
          curriculum_type: curriculum,
          academic_year:   ACADEMIC_YEAR,
          date_taught:     dateTaught,
          period_number:   period ? parseInt(period.replace('P', '')) : null,
          roll_present:    rollPresent ? parseInt(rollPresent) : null,
          roll_total:      rollTotal   ? parseInt(rollTotal)   : null,
          cbc_strand:      strand,
          cbc_sub_strand:  subStrand,
          slo_cognitive:   sloCog || null,
          slo_psychomotor: sloPsy || null,
          slo_affective:   sloAff || null,
          key_inquiry_question: kiq || null,
          core_competencies:    competencies,
          values_core:          values,
          pcis,
          instructional_obj_1:  obj1 || null,
          instructional_obj_2:  obj2 || null,
          cross_cutting_issues: crossCutting,
          learning_resources:   resources,
          homework:             homework || null,
          reflection_pct:       reflPct ? parseInt(reflPct) : null,
          reflection_went_well: reflWell        || null,
          reflection_challenges:reflChallenges  || null,
          submit,
        }),
      })
      const json = await res.json()
      if (json.error) { alert(json.error); return }
      await loadMyPlans(staff.id)
      resetForm()
      alert(submit ? 'Lesson plan submitted to HOD.' : 'Draft saved.')
    } catch (e: any) {
      alert(e?.message ?? 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function approveAction(id: string, action: 'approve' | 'reject', comment?: string) {
    setApproving(id)
    try {
      const res = await fetch('/api/lesson-plans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, hod_comment: comment ?? null }),
      })
      const json = await res.json()
      if (json.error) { alert(json.error); return }
      setRejectId(null); setHodComment('')
      await loadPendingPlans()
    } catch (e: any) {
      alert(e?.message ?? 'Action failed.')
    } finally {
      setApproving(null)
    }
  }

  const isReviewer = HOD_ROLES.has(role) || ADMIN_ROLES.has(role)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 text-white">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Lesson Plans</h1>
          <p className="text-xs text-slate-500">CBC / 8-4-4 · KICD template · TSC TPAD · {ACADEMIC_YEAR}</p>
        </div>
      </div>

      {/* ── HOD / Admin: Pending Review ────────────────────────────────────── */}
      {isReviewer && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="font-semibold text-sm text-slate-800">
              Pending Review
              {pendingPlans.length > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white">
                  {pendingPlans.length}
                </span>
              )}
            </span>
            <button onClick={loadPendingPlans} title="Refresh" className="text-slate-400 hover:text-slate-600">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          {pendingPlans.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">No plans awaiting review.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingPlans.map((p: Plan) => (
                <div key={p.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {p.staff_records?.full_name ?? '—'} · {p.subject_name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {p.class_name} · {p.topic ?? '—'} · submitted {p.submitted_at?.slice(0, 10) ?? '—'}
                      </p>
                      {p.hod_comment && (
                        <p className="mt-1 text-xs text-red-500 italic">"{p.hod_comment}"</p>
                      )}
                    </div>
                    <StatusBadge status={p.status} />
                  </div>

                  {rejectId === p.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={hodComment}
                        onChange={e => setHodComment(e.target.value)}
                        placeholder="Rejection reason (optional)"
                        rows={2}
                        className="w-full resize-none rounded-lg border border-slate-200 p-2 text-xs"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setRejectId(null); setHodComment('') }}
                          className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs hover:bg-slate-50">
                          Cancel
                        </button>
                        <button
                          onClick={() => approveAction(p.id, 'reject', hodComment)}
                          disabled={approving === p.id}
                          className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50">
                          {approving === p.id
                            ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
                            : 'Confirm Reject'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => approveAction(p.id, 'approve')}
                        disabled={!!approving}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">
                        {approving === p.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <ThumbsUp className="h-3.5 w-3.5" />}
                        Approve
                      </button>
                      <button
                        onClick={() => { setRejectId(p.id); setHodComment('') }}
                        disabled={!!approving}
                        className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
                        <ThumbsDown className="h-3.5 w-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── New Plan Form ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm text-slate-800">
          New Lesson Plan
        </div>

        {/* Step tabs */}
        <div className="flex border-b border-slate-100">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => setStep(s)}
              className={`flex-1 py-2.5 text-xs font-medium transition ${
                s === step   ? 'border-b-2 border-violet-600 text-violet-700' :
                i < stepIdx  ? 'text-emerald-600' : 'text-slate-400'
              }`}>
              {i < stepIdx ? '✓ ' : ''}{s}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">

          {/* Step 1 — Admin */}
          {step === 'Admin' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {subjects.length > 0 ? (
                  <select value={subject} onChange={e => setSubject(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
                    <option value="">Learning Area…</option>
                    {subjects.map(s => <option key={s}>{s}</option>)}
                  </select>
                ) : (
                  <input value={subject} onChange={e => setSubject(e.target.value)}
                    placeholder="Learning Area (e.g. Mathematics)"
                    className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                )}
                <input value={className} onChange={e => setClassName(e.target.value)}
                  placeholder="Grade / Class (e.g. Grade 10)"
                  className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input type="date" value={dateTaught} onChange={e => setDateTaught(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                <select value={period} onChange={e => setPeriod(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
                  {['P1','P2','P3','P4','P5','P6','P7','P8'].map(p => <option key={p}>{p}</option>)}
                </select>
                <select value={curriculum} onChange={e => setCurriculum(e.target.value as 'CBC' | '8-4-4')}
                  className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
                  <option value="CBC">CBC (Grade 10–12)</option>
                  <option value="8-4-4">8-4-4 (Form 3–4)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={rollPresent} onChange={e => setRollPresent(e.target.value)}
                  placeholder="Roll present" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
                <input type="number" value={rollTotal} onChange={e => setRollTotal(e.target.value)}
                  placeholder="Roll total" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" />
              </div>
              <input value={strand} onChange={e => setStrand(e.target.value)}
                placeholder="Strand / Main Topic (from Curriculum Design)"
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" />
              <input value={subStrand} onChange={e => setSubStrand(e.target.value)}
                placeholder="Sub-Strand / Sub-Topic (optional)"
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </>
          )}

          {/* Step 2 — CBC Curriculum */}
          {step === 'Curriculum' && curriculum === 'CBC' && (
            <>
              <p className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-700">
                CBC · Specific Learning Outcomes + Core Competencies
              </p>
              <div className="space-y-2.5">
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Brain className="h-3.5 w-3.5 text-indigo-500" /> Cognitive Domain SLO
                  </p>
                  <VerbSelect verbs={COGNITIVE_VERBS} value={sloCog} onChange={setSloCog} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5 text-teal-500" /> Psychomotor / Practical Domain SLO
                  </p>
                  <VerbSelect verbs={PSYCHOMOTOR_VERBS} value={sloPsy} onChange={setSloPsy} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5 text-rose-500" /> Affective Domain SLO
                  </p>
                  <VerbSelect verbs={AFFECTIVE_VERBS} value={sloAff} onChange={setSloAff} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Key Inquiry Question
                </p>
                <textarea value={kiq} onChange={e => setKiq(e.target.value)} rows={2}
                  placeholder="e.g. How does this concept apply in daily life?"
                  className="w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm" />
              </div>
              <Chips label="Core Competencies" options={CORE_COMPETENCIES} selected={competencies} onChange={setCompetencies} />
              <div className="grid grid-cols-2 gap-3">
                <Chips label="Core Values" options={CORE_VALUES} selected={values} onChange={setValues} />
                <Chips label="PCIs" options={PCIS} selected={pcis} onChange={setPcis} />
              </div>
            </>
          )}

          {/* Step 2 — 8-4-4 Curriculum */}
          {step === 'Curriculum' && curriculum === '8-4-4' && (
            <>
              <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                8-4-4 · Instructional Objectives + Cross-Cutting Issues
              </p>
              <div className="space-y-2.5">
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-700">
                    Instructional Objective 1 <span className="font-normal text-slate-400">— specific facts/principles</span>
                  </p>
                  <VerbSelect verbs={OBJ_VERBS} value={obj1} onChange={setObj1} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-700">
                    Instructional Objective 2 <span className="font-normal text-slate-400">— apply to solve problems</span>
                  </p>
                  <VerbSelect verbs={OBJ_VERBS} value={obj2} onChange={setObj2} />
                </div>
              </div>
              <Chips label="Cross-Cutting Issues" options={CROSS_CUTTING} selected={crossCutting} onChange={setCrossCutting} />
            </>
          )}

          {/* Step 3 — Resources */}
          {step === 'Resources' && (
            <>
              <p className="text-xs font-semibold text-slate-700">
                Learning Resources <span className="font-normal text-slate-400">(select all used)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {LEARNING_RESOURCES.map(r => (
                  <button key={r} type="button"
                    onClick={() => setResources(resources.includes(r) ? resources.filter(x => x !== r) : [...resources, r])}
                    className={`rounded-full px-2.5 py-1 text-xs transition ${resources.includes(r)
                      ? 'bg-teal-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-teal-400'}`}>
                    {r}
                  </button>
                ))}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-700">Extended Learning Activity (Homework)</p>
                <textarea value={homework} onChange={e => setHomework(e.target.value)} rows={3}
                  placeholder="e.g. Research 3 examples and present in next lesson."
                  className="w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm" />
              </div>
            </>
          )}

          {/* Step 4 — Reflection */}
          {step === 'Reflection' && (
            <>
              <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Post-Lesson Reflection — fill after teaching · TSC TPAD verification
              </p>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-700">% of learners who achieved the SLOs</p>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={100} value={reflPct} onChange={e => setReflPct(e.target.value)}
                    placeholder="e.g. 80"
                    className="h-9 w-24 rounded-lg border border-slate-200 px-3 text-sm" />
                  <span className="text-sm text-slate-500">%</span>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-700">What went well</p>
                <textarea value={reflWell} onChange={e => setReflWell(e.target.value)} rows={3}
                  placeholder="e.g. Group activity was highly engaging."
                  className="w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm" />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-700">Challenges &amp; future interventions</p>
                <textarea value={reflChallenges} onChange={e => setReflChallenges(e.target.value)} rows={3}
                  placeholder="e.g. 8 learners struggled. Will use remedial worksheet next lesson."
                  className="w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm" />
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-2 pt-1">
            {stepIdx > 0 && (
              <button onClick={() => setStep(STEPS[stepIdx - 1])}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
            )}
            <div className="flex-1" />
            {stepIdx < STEPS.length - 1 ? (
              <button onClick={() => setStep(STEPS[stepIdx + 1])} disabled={!canProceed()}
                className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => saveAs(false)} disabled={saving}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-50">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save Draft'}
                </button>
                <button onClick={() => saveAs(true)} disabled={saving || !subject.trim() || !strand.trim()}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Submit to HOD
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── My Plans ──────────────────────────────────────────────────────── */}
      {myPlans.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm text-slate-800">My Plans</div>
          <div className="divide-y divide-slate-100">
            {myPlans.map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {p.subject_name} — {p.cbc_strand ?? p.subject_name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {p.class_name} · {p.date_taught ?? 'no date'} · P{p.period_number ?? '?'} · {p.curriculum_type}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
