/**
 * Replace Nkoroi's synthetic roster with the REAL 606 students.
 * Run: npx tsx scripts/seed-nkoroi-real.ts
 *
 * Parses the verbatim official SQL (scripts/sql/nkoroi-{g10,f3,f4}.sql) — no hand
 * re-typing of names/marks — then: deletes the current Nkoroi students (and their
 * parent_student_links, which pointed at the synthetic rows), and inserts the 606.
 *
 * Expected: 182 Grade 10 (CBE) + 237 Form 3 (844) + 187 Form 4 (844) = 606.
 * Sets admission_number = admission_no (suffixed on the rare collision so the
 * unique key survives while admission_no stays the real display value).
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const NKOROI = '68bd8d34-f2f0-4297-bd18-093328824d84'
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// ── SQL parsing ──────────────────────────────────────────────────
function tokenizeTuple(inner: string): (string | number | boolean | null)[] {
  const out: (string | number | boolean | null)[] = []
  let i = 0
  const n = inner.length
  while (i < n) {
    while (i < n && /\s/.test(inner[i])) i++
    if (i >= n) break
    if (inner[i] === "'") {
      // quoted string; handle '' escape
      let s = ''; i++
      while (i < n) {
        if (inner[i] === "'" && inner[i + 1] === "'") { s += "'"; i += 2; continue }
        if (inner[i] === "'") { i++; break }
        s += inner[i++]
      }
      out.push(s)
    } else {
      let tok = ''
      while (i < n && inner[i] !== ',') { tok += inner[i++] }
      tok = tok.trim()
      if (/^gen_random_uuid\(\)$/i.test(tok)) out.push('__ID__')
      else if (/^null$/i.test(tok)) out.push(null)
      else if (/^true$/i.test(tok)) out.push(true)
      else if (/^false$/i.test(tok)) out.push(false)
      else if (/^-?\d+$/.test(tok)) out.push(Number(tok))
      else out.push(tok)
    }
    while (i < n && /\s/.test(inner[i])) i++
    if (i < n && inner[i] === ',') i++
  }
  return out
}

function parseSql(path: string): Record<string, unknown>[] {
  const raw = readFileSync(path, 'utf8')
  // columns from header
  const headerMatch = raw.match(/INSERT INTO students\s*\(([^)]*)\)\s*VALUES/i)
  if (!headerMatch) throw new Error('no INSERT header in ' + path)
  const cols = headerMatch[1].split(',').map((c) => c.trim())
  // body after VALUES
  const body = raw.slice(raw.indexOf('VALUES') + 6)
  const rows: Record<string, unknown>[] = []
  // each row begins "(gen_random_uuid()" — split on lines and balance parens per row
  const lines = body.split('\n')
  for (let line of lines) {
    line = line.replace(/--.*$/, '').trim()           // strip trailing SQL comment
    if (!line.startsWith('(gen_random_uuid()')) continue
    const inner = line.slice(1, line.lastIndexOf(')'))
    const toks = tokenizeTuple(inner)
    if (toks.length !== cols.length) throw new Error(`col mismatch in ${path}: got ${toks.length} want ${cols.length}\n${line}`)
    const obj: Record<string, unknown> = {}
    cols.forEach((c, idx) => { if (c !== 'id') obj[c] = toks[idx] })
    rows.push(obj)
  }
  return rows
}

async function main() {
  const g10 = parseSql('scripts/sql/nkoroi-g10.sql')
  const f3  = parseSql('scripts/sql/nkoroi-f3.sql')
  const f4  = parseSql('scripts/sql/nkoroi-f4.sql')
  const all = [...g10, ...f3, ...f4]
  console.log(`Parsed: G10=${g10.length} F3=${f3.length} F4=${f4.length} TOTAL=${all.length}`)
  if (all.length !== 606) { console.error('❌ expected 606'); process.exit(1) }

  // Build insert rows; ensure unique admission_number (display admission_no kept).
  const seen = new Set<string>()
  const rows = all.map((r) => {
    let key = String(r.admission_no)
    let k = 1
    while (seen.has(key)) key = `${r.admission_no}-${++k}`
    seen.add(key)
    return {
      school_id: NKOROI,
      class_id: r.class_id,
      full_name: r.full_name,
      admission_no: r.admission_no,
      admission_number: key,
      gender: r.gender,
      curriculum_type: r.curriculum_type,
      kcpe_marks: r.kcpe_marks ?? null,
      kcpe_year: r.kcpe_year ?? null,
      is_active: true,
      class_name: r.class_name,
      stream_name: r.stream_name,
    }
  })

  // ── Clear synthetic Nkoroi roster ──────────────────────────────
  console.log('Clearing current Nkoroi students + their parent links...')
  // delete parent_student_links pointing at Nkoroi students (paged)
  let from = 0
  while (true) {
    const { data: ids } = await db.from('students').select('id').eq('school_id', NKOROI).range(from, from + 999)
    if (!ids || !ids.length) break
    const idList = ids.map((x: any) => x.id)
    await db.from('parent_student_links').delete().in('student_id', idList)
    if (ids.length < 1000) break
    from += 1000
  }
  const { error: delErr } = await db.from('students').delete().eq('school_id', NKOROI)
  if (delErr) { console.error('❌ delete students:', delErr.message); process.exit(1) }
  const { count: afterDel } = await db.from('students').select('id', { count: 'exact', head: true }).eq('school_id', NKOROI)
  console.log(`  students after delete: ${afterDel}`)
  if ((afterDel ?? 0) !== 0) { console.error('❌ delete incomplete (FK blocking?)'); process.exit(1) }

  // ── Insert the real 606 ────────────────────────────────────────
  console.log('Inserting 606 real students...')
  let inserted = 0
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await db.from('students').insert(rows.slice(i, i + 200)).select('id')
    if (error) { console.error(`❌ insert chunk ${i}:`, error.message); process.exit(1) }
    inserted += data?.length ?? 0
  }
  console.log(`  inserted ${inserted}`)

  // ── Verify ─────────────────────────────────────────────────────
  const { count: total } = await db.from('students').select('id', { count: 'exact', head: true }).eq('school_id', NKOROI)
  const byClass: Record<string, number> = {}
  let pg = 0
  while (true) {
    const { data } = await db.from('students').select('class_name').eq('school_id', NKOROI).range(pg, pg + 999)
    if (!data || !data.length) break
    for (const s of data as any[]) byClass[s.class_name] = (byClass[s.class_name] || 0) + 1
    if (data.length < 1000) break
    pg += 1000
  }
  console.log(`\n✅ Nkoroi total=${total}`)
  Object.entries(byClass).sort().forEach(([c, n]) => console.log(`   ${n}  ${c}`))
  console.log('   PENDING: parent_student_links must be re-collected/linked for the real roster.')
}

main().catch((e) => { console.error(e); process.exit(1) })
