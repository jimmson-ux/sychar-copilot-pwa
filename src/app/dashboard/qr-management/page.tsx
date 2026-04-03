'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface QrCode {
  id: string
  qr_type: 'duty' | 'classroom'
  label: string
  url: string
  qr_data_url: string
  slug: string | null
  updated_at: string
}

interface DepartmentCode {
  id: string
  department: string
  code: string
  subjects: string[]
  color_primary: string
  color_secondary: string
  is_active: boolean
}

interface DeptQrItem {
  id: string
  department: string
  code: string
  subjects: string[]
  colorPrimary: string
  colorSecondary: string
  qrDataUrl: string
  qrUrl: string
}

type MainTab = 'qr' | 'dept_qr' | 'departments'
type QrFilter = 'all' | 'duty' | 'classroom'

const TERMS = ['Term 1', 'Term 2', 'Term 3'] as const

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QrManagementPage() {
  const [mainTab, setMainTab] = useState<MainTab>('qr')

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">QR & Department Management</h1>
        </div>

        {/* Top-level tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={() => setMainTab('qr')}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${
              mainTab === 'qr' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            📲 Classroom QRs
          </button>
          <button onClick={() => setMainTab('dept_qr')}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${
              mainTab === 'dept_qr' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            🏷️ Department QR Cards
          </button>
          <button onClick={() => setMainTab('departments')}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${
              mainTab === 'departments' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}>
            ⚙️ Dept Codes
          </button>
        </div>

        {mainTab === 'qr' && <QrTab />}
        {mainTab === 'dept_qr' && <DeptQrTab />}
        {mainTab === 'departments' && <DeptCodesTab />}
      </div>
    </div>
  )
}

// ─── QR Tab ───────────────────────────────────────────────────────────────────

function QrTab() {
  const [qrCodes, setQrCodes] = useState<QrCode[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [sendingLinks, setSendingLinks] = useState(false)
  const [linkResult, setLinkResult] = useState<{ sent: number; failed: number } | null>(null)
  const [error, setError] = useState('')
  const [activeFilter, setActiveFilter] = useState<QrFilter>('all')

  useEffect(() => { loadQrCodes() }, [])

  async function loadQrCodes() {
    setLoading(true)
    try {
      const res = await fetch('/api/qr/generate')
      const d = await res.json()
      if (res.ok) setQrCodes(d.qrCodes ?? [])
      else setError(d.error ?? 'Failed to load')
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  async function handleGenerate() {
    setGenerating(true); setError('')
    try {
      const res = await fetch('/api/qr/generate', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) setError(d.error ?? 'Failed to generate')
      else await loadQrCodes()
    } catch { setError('Network error') }
    finally { setGenerating(false) }
  }

  async function handleSendLinks() {
    setSendingLinks(true); setError(''); setLinkResult(null)
    try {
      const res = await fetch('/api/teacher/send-links', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) setError(d.error ?? 'Failed to send')
      else setLinkResult({ sent: d.sent, failed: d.failed })
    } catch { setError('Network error') }
    finally { setSendingLinks(false) }
  }

  function downloadQr(qr: QrCode) {
    const a = document.createElement('a')
    a.href = qr.qr_data_url
    a.download = `${qr.label.replace(/\s+/g, '-').toLowerCase()}-qr.png`
    a.click()
  }

  function printAll() {
    const html = `<html><head><title>QR Codes</title>
      <style>body{font-family:sans-serif}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;padding:24px}.card{text-align:center;border:1px solid #e5e7eb;border-radius:12px;padding:16px}.card img{width:180px;height:180px}.label{font-size:13px;font-weight:600;margin-top:8px}.type{font-size:11px;color:#6b7280}@media print{@page{margin:16px}}</style>
      </head><body><div class="grid">${visibleQrs.map(q => `<div class="card"><img src="${q.qr_data_url}" /><p class="label">${q.label}</p><p class="type">${q.qr_type === 'duty' ? 'Duty Station' : 'Classroom'}</p></div>`).join('')}</div></body></html>`
    const win = window.open('', '_blank')
    win?.document.write(html)
    win?.document.close()
    win?.print()
  }

  const visibleQrs = qrCodes.filter(q => activeFilter === 'all' || q.qr_type === activeFilter)
  const dutyQrs = qrCodes.filter(q => q.qr_type === 'duty')
  const classroomQrs = qrCodes.filter(q => q.qr_type === 'classroom')

  return (
    <div>
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-500">{dutyQrs.length} duty station · {classroomQrs.length} classrooms</p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleGenerate} disabled={generating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-xl">
            {generating ? 'Generating...' : 'Generate / Refresh QR Codes'}
          </button>
          <button onClick={handleSendLinks} disabled={sendingLinks}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-semibold rounded-xl">
            {sendingLinks ? 'Sending...' : 'Send WhatsApp Links to Teachers'}
          </button>
          {qrCodes.length > 0 && (
            <button onClick={printAll}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl">
              Print All
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {linkResult && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
          WhatsApp links sent: <strong>{linkResult.sent}</strong> teachers reached
          {linkResult.failed > 0 && <span className="text-orange-600"> · {linkResult.failed} failed</span>}
        </div>
      )}

      <div className="flex gap-2 mb-5">
        {(['all', 'duty', 'classroom'] as const).map(f => (
          <button key={f} onClick={() => setActiveFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors capitalize ${
              activeFilter === f ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300'
            }`}>
            {f === 'all' ? `All (${qrCodes.length})` : f === 'duty' ? `Duty (${dutyQrs.length})` : `Classrooms (${classroomQrs.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : visibleQrs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-5xl mb-4">📲</p>
          <p className="font-medium">No QR codes yet. Click &ldquo;Generate&rdquo; to create them.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {visibleQrs.map(qr => (
            <div key={qr.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col items-center text-center hover:shadow-md transition-shadow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.qr_data_url} alt={qr.label} className="w-40 h-40 rounded-lg" />
              <span className={`mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${qr.qr_type === 'duty' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                {qr.qr_type === 'duty' ? 'Duty' : 'Classroom'}
              </span>
              <p className="text-sm font-semibold text-gray-800 mt-1 leading-tight">{qr.label}</p>
              <p className="text-xs text-gray-400 mt-0.5 break-all">{qr.url.replace(/^https?:\/\//, '').slice(0, 40)}</p>
              <button onClick={() => downloadQr(qr)}
                className="mt-3 w-full text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 rounded-lg">
                Download PNG
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Department QR Cards Tab ─────────────────────────────────────────────────

const SCHOOL_NAME = 'Nkoroi Mixed Day Secondary School'
const CURRENT_YEAR = new Date().getFullYear()

function DeptQrTab() {
  const [depts, setDepts] = useState<DeptQrItem[]>([])
  const [loading, setLoading] = useState(true)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/department-codes/qr')
      .then(r => r.json())
      .then(d => { setDepts(d.departments ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function regenerate(deptId: string) {
    setRegeneratingId(deptId); setError('')
    try {
      const res = await fetch('/api/department-codes/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deptId }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Failed'); }
      else {
        setDepts(prev => prev.map(dept =>
          dept.id === deptId ? { ...dept, qrDataUrl: d.qrDataUrl, qrUrl: d.qrUrl } : dept
        ))
      }
    } catch { setError('Network error') }
    finally { setRegeneratingId(null) }
  }

  function printAll() {
    const html = `<!DOCTYPE html><html><head><title>Department QR Cards — ${SCHOOL_NAME}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; }
  @media print {
    @page { size: A5; margin: 8mm; }
    .card { page-break-after: always; }
    .card:last-child { page-break-after: avoid; }
    .no-print { display: none !important; }
  }
  .card {
    width: 148mm; height: 210mm;
    display: flex; flex-direction: column;
    border: 3px solid; border-radius: 12px;
    overflow: hidden; margin: 0 auto 24px;
  }
  .card-header {
    padding: 20px 16px 16px;
    text-align: center; color: white;
  }
  .dept-name { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
  .dept-sub  { font-size: 11px; font-weight: 600; opacity: 0.85; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.1em; }
  .card-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
  .qr-wrap { width: 200px; height: 200px; display: flex; align-items: center; justify-content: center; }
  .qr-wrap img { width: 200px; height: 200px; }
  .card-instruction { margin-top: 16px; font-size: 13px; font-weight: 600; color: #374151; text-align: center; }
  .card-subjects { margin-top: 8px; font-size: 11px; color: #6b7280; text-align: center; }
  .card-footer { border-top: 1px solid #e5e7eb; padding: 10px 16px; text-align: center; }
  .school-name { font-size: 11px; font-weight: 700; color: #374151; }
  .year-line   { font-size: 10px; color: #9ca3af; margin-top: 2px; }
  .watermark   { font-size: 10px; color: #ef4444; font-weight: 600; margin-top: 6px; letter-spacing: 0.05em; text-transform: uppercase; }
</style></head><body>
${depts.map(d => `
<div class="card" style="border-color: ${d.colorPrimary};">
  <div class="card-header" style="background: linear-gradient(135deg, ${d.colorPrimary}, ${d.colorSecondary});">
    <div class="dept-name">${d.department}</div>
    <div class="dept-sub">Department Portal</div>
  </div>
  <div class="card-body">
    <div class="qr-wrap"><img src="${d.qrDataUrl}" alt="QR" /></div>
    <p class="card-instruction">Staff scan to record teaching activities</p>
    <p class="card-subjects">${Array.isArray(d.subjects) ? d.subjects.join(' · ') : ''}</p>
  </div>
  <div class="card-footer">
    <div class="school-name">${SCHOOL_NAME}</div>
    <div class="year-line">Academic Year ${CURRENT_YEAR}</div>
    <div class="watermark">Staff Only — Do Not Share With Students</div>
  </div>
</div>`).join('')}
</body></html>`

    const win = window.open('', '_blank')
    win?.document.write(html)
    win?.document.close()
    setTimeout(() => win?.print(), 800)
  }

  function downloadCard(dept: DeptQrItem) {
    const a = document.createElement('a')
    a.href = dept.qrDataUrl
    a.download = `${dept.department.replace(/\s+/g, '-').toLowerCase()}-qr.png`
    a.click()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">
          One QR card per department. Print and display in department offices.
        </p>
        {depts.length > 0 && (
          <button onClick={printAll}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl">
            Print All Department QRs (A5)
          </button>
        )}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-purple-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {depts.map(dept => (
            <div key={dept.id}
              className="bg-white rounded-2xl border-2 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              style={{ borderColor: dept.colorPrimary }}>
              {/* Header */}
              <div className="px-4 py-4 text-center text-white"
                   style={{ background: `linear-gradient(135deg, ${dept.colorPrimary}, ${dept.colorSecondary})` }}>
                <p className="text-xs font-semibold uppercase tracking-widest opacity-80 mb-0.5">Department Portal</p>
                <p className="font-bold text-lg">{dept.department}</p>
              </div>

              {/* QR */}
              <div className="flex flex-col items-center px-4 py-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dept.qrDataUrl} alt={dept.department} className="w-44 h-44 rounded-lg" />
                <p className="text-xs text-gray-500 mt-2 text-center">
                  {Array.isArray(dept.subjects) ? dept.subjects.slice(0, 4).join(' · ') : ''}
                  {Array.isArray(dept.subjects) && dept.subjects.length > 4 ? ` +${dept.subjects.length - 4} more` : ''}
                </p>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 px-4 py-3 text-center">
                <p className="text-xs font-bold text-gray-700">{SCHOOL_NAME}</p>
                <p className="text-xs text-red-500 font-semibold mt-0.5 uppercase tracking-wide">Staff Only — Do Not Share</p>
              </div>

              {/* Actions */}
              <div className="border-t border-gray-100 px-4 py-3 flex gap-2">
                <button onClick={() => downloadCard(dept)}
                  className="flex-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 rounded-lg font-medium">
                  Download QR
                </button>
                <button
                  onClick={() => regenerate(dept.id)}
                  disabled={regeneratingId === dept.id}
                  className="flex-1 text-xs bg-orange-100 hover:bg-orange-200 disabled:bg-orange-50 text-orange-700 py-1.5 rounded-lg font-medium"
                  title="Old QR will stop working immediately"
                >
                  {regeneratingId === dept.id ? 'Regenerating...' : 'Regenerate QR'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Department Codes Tab ─────────────────────────────────────────────────────

function DeptCodesTab() {
  const [depts, setDepts] = useState<DepartmentCode[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCode, setEditCode] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [sendingDeptId, setSendingDeptId] = useState<string | null>(null)
  const [sendTerm, setSendTerm] = useState<typeof TERMS[number]>('Term 1')
  const [sendResults, setSendResults] = useState<Record<string, { sent: number; total: number }>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/department-codes')
      .then(r => r.json())
      .then(d => { setDepts(d.departments ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function saveEdit(id: string) {
    if (!editCode.trim()) return
    setSavingEdit(true)
    try {
      const res = await fetch('/api/department-codes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, code: editCode.trim().toUpperCase() }),
      })
      if (res.ok) {
        setDepts(prev => prev.map(d => d.id === id ? { ...d, code: editCode.trim().toUpperCase() } : d))
        setEditingId(null)
      } else {
        const d = await res.json(); setError(d.error ?? 'Failed to save')
      }
    } catch { setError('Network error') }
    finally { setSavingEdit(false) }
  }

  async function sendToDepart(deptId: string) {
    setSendingDeptId(deptId); setError('')
    try {
      const res = await fetch('/api/department-codes/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentCodeId: deptId, term: sendTerm }),
      })
      const d = await res.json()
      if (!res.ok) setError(d.error ?? 'Failed to send')
      else setSendResults(prev => ({ ...prev, [deptId]: { sent: d.sent, total: d.total } }))
    } catch { setError('Network error') }
    finally { setSendingDeptId(null) }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <label className="text-sm font-medium text-gray-700">Send for:</label>
        <select value={sendTerm} onChange={e => setSendTerm(e.target.value as typeof TERMS[number])}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
          {TERMS.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Department</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Code</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide hidden sm:table-cell">Subjects</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {depts.map(dept => (
                <tr key={dept.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: dept.color_primary }} />
                      <span className="font-medium text-gray-800">{dept.department}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {editingId === dept.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text" value={editCode}
                          onChange={e => setEditCode(e.target.value.toUpperCase())}
                          maxLength={10}
                          className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-xs font-mono text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        <button onClick={() => saveEdit(dept.id)} disabled={savingEdit}
                          className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-lg">{savingEdit ? '...' : 'Save'}</button>
                        <button onClick={() => setEditingId(null)}
                          className="text-xs text-gray-500 px-1">✕</button>
                      </div>
                    ) : (
                      <span className="font-mono font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{dept.code}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 hidden sm:table-cell">
                    <p className="text-xs text-gray-500 max-w-xs truncate">{dept.subjects.join(', ')}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dept.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {dept.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditingId(dept.id); setEditCode(dept.code) }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Edit Code
                      </button>
                      <button
                        onClick={() => sendToDepart(dept.id)}
                        disabled={sendingDeptId === dept.id}
                        className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-2.5 py-1 rounded-lg font-medium"
                      >
                        {sendingDeptId === dept.id ? 'Sending...' : 'Send via WhatsApp'}
                      </button>
                      {sendResults[dept.id] && (
                        <span className="text-xs text-green-600 font-medium">
                          ✓ {sendResults[dept.id].sent}/{sendResults[dept.id].total}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
