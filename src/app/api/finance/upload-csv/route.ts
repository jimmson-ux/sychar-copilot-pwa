// POST /api/finance/upload-csv
// Receives parsed CSV rows from the bursar PWA, fuzzy-matches students,
// and returns a staging payload for confirmation before allocation.
// Bursar / principal only.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { rateLimit, LIMITS } from '@/lib/rateLimit'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set(['bursar', 'principal', 'deputy_principal', 'accountant'])

// Simple Levenshtein distance for server-side fuzzy matching
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen
}

function findBestMatch(
  description: string,
  students: Array<{ id: string; full_name: string; admission_no: string | null }>
) {
  const desc = description.toLowerCase()

  // First try exact admission number match
  const adm = students.find(
    (s) => s.admission_no && desc.includes(s.admission_no.toLowerCase())
  )
  if (adm) return { student: adm, confidence: 1.0, method: 'admission_no' }

  // Fuzzy name match — score each word in description against student names
  let best: (typeof students)[0] | null = null
  let bestScore = 0

  for (const s of students) {
    const nameParts = s.full_name.toLowerCase().split(/\s+/)
    let score = 0
    for (const part of nameParts) {
      if (part.length < 3) continue
      if (desc.includes(part)) { score = Math.max(score, 0.85) }
      else {
        const words = desc.split(/\s+/)
        for (const w of words) {
          if (w.length < 3) continue
          const sim = similarity(part, w)
          if (sim > 0.75) score = Math.max(score, sim * 0.9)
        }
      }
    }
    if (score > bestScore) { bestScore = score; best = s }
  }

  if (best && bestScore >= 0.65) {
    return { student: best, confidence: bestScore, method: 'fuzzy_name' }
  }
  return null
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`csv-upload:${ip}`, 10, 60_000)
  if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Bursar or principal access required' }, { status: 403 })
  }

  let body: { rows: Array<Record<string, string>> } = { rows: [] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.rows?.length) {
    return NextResponse.json({ error: 'No CSV rows provided' }, { status: 400 })
  }
  if (body.rows.length > 1000) {
    return NextResponse.json({ error: 'Maximum 1000 rows per upload' }, { status: 400 })
  }

  const db = svc()

  // Load all active students for this school
  const { data: students, error: sErr } = await db
    .from('students')
    .select('id, full_name, admission_no, class_name')
    .eq('school_id', auth.schoolId!)
    .eq('is_active', true)
    .limit(3000)

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
  const studentList = (students ?? []) as Array<{
    id: string; full_name: string; admission_no: string | null; class_name: string | null
  }>

  // Normalise header names (banks use different column names)
  const headers = body.rows[0] ? Object.keys(body.rows[0]) : []
  function col(row: Record<string, string>, candidates: string[]): string {
    for (const c of candidates) {
      const k = headers.find((h) => h.toLowerCase().includes(c.toLowerCase()))
      if (k && row[k]) return row[k].trim()
    }
    return ''
  }

  const staged = body.rows.map((row, idx) => {
    const description = col(row, ['description', 'narration', 'details', 'particulars', 'reference'])
    const creditRaw   = col(row, ['credit', 'deposit', 'amount in', 'paid in', 'cr'])
    const date        = col(row, ['date', 'value date', 'trans date'])
    const ref         = col(row, ['ref', 'reference', 'cheque', 'trans id'])

    const credit = parseFloat(creditRaw.replace(/[^0-9.]/g, '')) || 0

    const match = description ? findBestMatch(description, studentList) : null

    return {
      row_index:   idx,
      description,
      date,
      ref,
      credit,
      student_id:    match?.student.id ?? null,
      student_name:  match?.student.full_name ?? null,
      admission_no:  match?.student.admission_no ?? null,
      class_name:    (match?.student as { class_name?: string | null } | undefined)?.class_name ?? null,
      confidence:    match?.confidence ?? 0,
      match_method:  match?.method ?? 'none',
      status: credit > 0 && match ? 'matched' : credit > 0 ? 'unmatched' : 'skip',
    }
  })

  const matched   = staged.filter((r) => r.status === 'matched').length
  const unmatched = staged.filter((r) => r.status === 'unmatched').length
  const skipped   = staged.filter((r) => r.status === 'skip').length
  const totalCredit = staged.reduce((s, r) => s + r.credit, 0)

  return NextResponse.json({ staged, matched, unmatched, skipped, totalCredit })
}
