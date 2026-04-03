'use client'
// src/components/DutyGradingDashboard.tsx
// Principal/Deputy dashboard for viewing and submitting duty teacher grades

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Appraisal {
  id: string
  duty_date: string
  punctuality: number
  incident_handling: number
  report_quality: number
  student_welfare: number
  duty_overall: number
  overall_rating: string
  duty_notes: string
  graded_via: string
  staff_records: { full_name: string; sub_role: string }
}

interface TeacherSummary {
  teacher_id: string
  teacher_name: string
  sub_role: string
  avg_punctuality: number
  avg_incident: number
  avg_report: number
  avg_welfare: number
  avg_overall: number
  total_duties: number
  last_graded: string
  grades: Appraisal[]
}

interface GradeForm {
  teacher_id: string
  duty_date: string
  punctuality: number
  incident_handling: number
  report_quality: number
  student_welfare: number
  duty_notes: string
}

const RATING_COLOR: Record<string, string> = {
  'Excellent':          'bg-green-100 text-green-800',
  'Good':               'bg-blue-100 text-blue-800',
  'Satisfactory':       'bg-yellow-100 text-yellow-800',
  'Needs Improvement':  'bg-red-100 text-red-800',
}

const SCORE_COLOR = (score: number) =>
  score >= 8 ? 'text-green-700' :
  score >= 6 ? 'text-blue-700' :
  score >= 4 ? 'text-yellow-700' : 'text-red-700'

const ScoreBar = ({ value }: { value: number }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${
          value >= 8 ? 'bg-green-500' : value >= 6 ? 'bg-blue-500' : value >= 4 ? 'bg-yellow-500' : 'bg-red-500'
        }`}
        style={{ width: `${value * 10}%` }}
      />
    </div>
    <span className={`text-sm font-medium w-8 ${SCORE_COLOR(value)}`}>{value}</span>
  </div>
)

export default function DutyGradingDashboard({ schoolId, appraiserId }: { schoolId: string; appraiserId: string }) {
  const [summary, setSummary] = useState<TeacherSummary[]>([])
  const [selected, setSelected] = useState<TeacherSummary | null>(null)
  const [teachers, setTeachers] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [form, setForm] = useState<GradeForm>({
    teacher_id: '',
    duty_date: new Date().toISOString().split('T')[0],
    punctuality: 5,
    incident_handling: 5,
    report_quality: 5,
    student_welfare: 5,
    duty_notes: '',
  })

  useEffect(() => {
    fetchData()
    fetchTeachers()
  }, [])

  async function fetchData() {
    setLoading(true)
    const res = await fetch('/api/duty-appraisals')
    const json = await res.json()
    setSummary(json.summary || [])
    setLoading(false)
  }

  async function fetchTeachers() {
    const { data } = await createClient()
      .from('staff_records')
      .select('id, full_name, sub_role')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .order('full_name')
    setTeachers(data || [])
  }

  async function submitGrade() {
    if (!form.teacher_id) return showToast('Please select a teacher.')
    setSaving(true)

    const overall = Math.round(
      (form.punctuality + form.incident_handling + form.report_quality + form.student_welfare) / 4
    )
    const rating =
      overall >= 8 ? 'Excellent' :
      overall >= 6 ? 'Good' :
      overall >= 4 ? 'Satisfactory' : 'Needs Improvement'

    const { error } = await createClient().from('appraisals').insert({
      school_id: schoolId,
      appraiser_id: appraiserId,
      appraisee_id: form.teacher_id,
      appraisal_type: 'duty',
      duty_date: form.duty_date,
      punctuality: form.punctuality,
      incident_handling: form.incident_handling,
      report_quality: form.report_quality,
      student_welfare: form.student_welfare,
      duty_notes: form.duty_notes || null,
      overall_rating: rating,
      status: 'completed',
      academic_year: new Date().getFullYear().toString(),
      graded_via: 'dashboard',
    })

    setSaving(false)
    if (error) return showToast('Error saving. Please try again.')

    showToast('Grade saved successfully!')
    setShowForm(false)
    setForm({ ...form, teacher_id: '', duty_notes: '', punctuality: 5, incident_handling: 5, report_quality: 5, student_welfare: 5 })
    fetchData()
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const overall = Math.round(
    (form.punctuality + form.incident_handling + form.report_quality + form.student_welfare) / 4
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Duty teacher appraisals</h1>
          <p className="text-sm text-gray-500 mt-0.5">Grade teachers on their duty performance</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? 'Cancel' : '+ Grade a teacher'}
        </button>
      </div>

      {/* Grade Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-4">New duty appraisal</h2>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Teacher</label>
              <select
                value={form.teacher_id}
                onChange={e => setForm({ ...form, teacher_id: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Select teacher...</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Duty date</label>
              <input
                type="date"
                value={form.duty_date}
                onChange={e => setForm({ ...form, duty_date: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Score sliders */}
          <div className="space-y-4 mb-5">
            {[
              { key: 'punctuality',        label: 'Punctuality & presence',  desc: 'On time, remained present throughout duty' },
              { key: 'incident_handling',  label: 'Incident handling',        desc: 'Identified and resolved discipline/health issues' },
              { key: 'report_quality',     label: 'Report quality',           desc: 'Duty report submitted on time and complete' },
              { key: 'student_welfare',    label: 'Student welfare',          desc: 'Ensured student safety and wellbeing' },
            ].map(({ key, label, desc }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{label}</span>
                    <span className="text-xs text-gray-400 ml-2">{desc}</span>
                  </div>
                  <span className={`text-sm font-semibold ${SCORE_COLOR(form[key as keyof GradeForm] as number)}`}>
                    {form[key as keyof GradeForm]}/10
                  </span>
                </div>
                <input
                  type="range" min={1} max={10}
                  value={form[key as keyof GradeForm] as number}
                  onChange={e => setForm({ ...form, [key]: parseInt(e.target.value) })}
                  className="w-full accent-green-600"
                />
              </div>
            ))}
          </div>

          {/* Overall preview */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 mb-4">
            <div className="text-2xl font-bold text-gray-800">{overall}<span className="text-sm font-normal text-gray-400">/10</span></div>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${RATING_COLOR[
              overall >= 8 ? 'Excellent' : overall >= 6 ? 'Good' : overall >= 4 ? 'Satisfactory' : 'Needs Improvement'
            ]}`}>
              {overall >= 8 ? 'Excellent' : overall >= 6 ? 'Good' : overall >= 4 ? 'Satisfactory' : 'Needs Improvement'}
            </span>
            <span className="text-xs text-gray-400 ml-auto">Overall average</span>
          </div>

          <textarea
            value={form.duty_notes}
            onChange={e => setForm({ ...form, duty_notes: e.target.value })}
            placeholder="Additional feedback (optional)..."
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 mb-4 resize-none"
          />

          <button
            onClick={submitGrade}
            disabled={saving}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {saving ? 'Saving...' : 'Save appraisal'}
          </button>
        </div>
      )}

      {/* Leaderboard */}
      {loading ? (
        <div className="text-center text-sm text-gray-400 py-12">Loading appraisals...</div>
      ) : summary.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-12">
          No duty appraisals yet. Grade a teacher to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {summary.map((t, i) => (
            <div
              key={t.teacher_id}
              onClick={() => setSelected(selected?.teacher_id === t.teacher_id ? null : t)}
              className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-green-300 transition-colors"
            >
              <div className="flex items-center gap-4">
                {/* Rank */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  i === 0 ? 'bg-amber-100 text-amber-700' :
                  i === 1 ? 'bg-gray-100 text-gray-600' :
                  i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-400'
                }`}>
                  {i + 1}
                </div>

                {/* Name & role */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">{t.teacher_name}</span>
                    <span className="text-xs text-gray-400 capitalize">{t.sub_role?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{t.total_duties} duties graded · last: {t.last_graded}</div>
                </div>

                {/* Score bars */}
                <div className="hidden md:grid grid-cols-4 gap-3 w-80">
                  {[
                    { label: 'Punct.', value: t.avg_punctuality },
                    { label: 'Incident', value: t.avg_incident },
                    { label: 'Report', value: t.avg_report },
                    { label: 'Welfare', value: t.avg_welfare },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div className="text-xs text-gray-400 mb-1">{label}</div>
                      <ScoreBar value={value} />
                    </div>
                  ))}
                </div>

                {/* Overall */}
                <div className="text-right flex-shrink-0">
                  <div className={`text-xl font-bold ${SCORE_COLOR(t.avg_overall)}`}>{t.avg_overall}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RATING_COLOR[
                    t.avg_overall >= 8 ? 'Excellent' :
                    t.avg_overall >= 6 ? 'Good' :
                    t.avg_overall >= 4 ? 'Satisfactory' : 'Needs Improvement'
                  ]}`}>
                    {t.avg_overall >= 8 ? 'Excellent' : t.avg_overall >= 6 ? 'Good' : t.avg_overall >= 4 ? 'Satisfactory' : 'Needs Improvement'}
                  </span>
                </div>
              </div>

              {/* Expanded grade history */}
              {selected?.teacher_id === t.teacher_id && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs font-medium text-gray-500 mb-3">Grade history</div>
                  <div className="space-y-2">
                    {t.grades.map((g: Appraisal) => (
                      <div key={g.id} className="flex items-center gap-3 text-xs">
                        <span className="text-gray-400 w-24 flex-shrink-0">{g.duty_date}</span>
                        <div className="flex gap-2 flex-1">
                          {[g.punctuality, g.incident_handling, g.report_quality, g.student_welfare].map((s, i) => (
                            <span key={i} className={`font-medium ${SCORE_COLOR(s)}`}>{s}</span>
                          ))}
                        </div>
                        <span className={`px-2 py-0.5 rounded-full font-medium ${RATING_COLOR[g.overall_rating]}`}>
                          {g.overall_rating}
                        </span>
                        <span className="text-gray-300">{g.graded_via === 'whatsapp' ? 'WhatsApp' : 'Dashboard'}</span>
                        {g.duty_notes && (
                          <span className="text-gray-400 truncate max-w-xs" title={g.duty_notes}>"{g.duty_notes}"</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
