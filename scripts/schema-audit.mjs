/**
 * Schema-drift audit: diff every column the PCEA server-fns reference against the LIVE
 * Supabase schema (PostgREST OpenAPI). Flags columns the code uses that don't exist on the
 * live table — the class of bug that silently broke visitor_log, fee_balances, adm_no, etc.
 *
 * Run: node scripts/schema-audit.mjs
 * Read-only. Prints a per-file report of suspicious column refs.
 */
import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const SRV_DIR = resolve(process.cwd(), '..', 'pceauppermatasiasenior', 'src', 'lib', 'server-fns')

// PostgREST query operators that take a column name as first arg.
const OPS = ['eq','neq','gt','gte','lt','lte','like','ilike','is','in','contains','order','overlaps','filter','not']

async function liveSchema() {
  const r = await fetch(`${URL}/rest/v1/`, { headers: { apikey: SKEY, Authorization: 'Bearer ' + SKEY } })
  const j = await r.json()
  const cols = {}
  for (const [t, def] of Object.entries(j.definitions ?? {})) cols[t] = new Set(Object.keys(def.properties ?? {}))
  return cols
}

// crude column extractor per .from("table") block — good enough to flag obvious drift
function refsFor(src) {
  const out = [] // {table, col, kind}
  // Split by .from("x") occurrences, attribute following refs to the nearest preceding table.
  const fromRe = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)/gi
  const marks = []
  let m
  while ((m = fromRe.exec(src))) marks.push({ idx: m.index, table: m[1] })
  const tableAt = (idx) => { let t = null; for (const k of marks) { if (k.idx <= idx) t = k.table; else break } return t }

  // select("a, b, t2(c, d)") — capture top-level cols + nested t(cols)
  const selRe = /\.select\(\s*["'`]([^"'`]*)["'`]/gi
  while ((m = selRe.exec(src))) {
    const table = tableAt(m.index); if (!table) continue
    const body = m[1]
    // nested relations like students(full_name, adm_no)
    const nestRe = /([a-z0-9_]+)\s*(?:!\w+)?\(([^)]*)\)/gi
    let nm; const nestedRanges = []
    while ((nm = nestRe.exec(body))) {
      nestedRanges.push([nm.index, nm.index + nm[0].length])
      const rel = nm[1]; const inner = nm[2]
      for (let c of inner.split(',')) {
        c = c.trim().split(':').pop().trim().split(/\s+/)[0]
        if (/^[a-z0-9_]+$/i.test(c) && c !== '*') out.push({ table: rel, col: c, kind: 'select-nested' })
      }
    }
    // top-level cols (strip nested ranges)
    let top = body
    for (let i = nestedRanges.length - 1; i >= 0; i--) top = top.slice(0, nestedRanges[i][0]) + top.slice(nestedRanges[i][1])
    for (let c of top.split(',')) {
      c = c.trim()
      if (!c || c === '*') continue
      c = c.split(':').pop().trim().split(/\s+/)[0] // alias:real -> real
      if (/^[a-z0-9_]+$/i.test(c)) out.push({ table, col: c, kind: 'select' })
    }
  }

  // .eq("col", ...) etc
  const opRe = new RegExp(`\\.(${OPS.join('|')})\\(\\s*["'\`]([a-z0-9_]+)["'\`]`, 'gi')
  while ((m = opRe.exec(src))) {
    const table = tableAt(m.index); if (!table) continue
    out.push({ table, col: m[2], kind: m[1] })
  }

  // insert({ col: ... }) / update({ col: ... }) — keys of the first object literal
  const mutRe = /\.(insert|update|upsert)\(\s*\{([^}]*)\}/gi
  while ((m = mutRe.exec(src))) {
    const table = tableAt(m.index); if (!table) continue
    const keyRe = /([a-z0-9_]+)\s*:/gi
    let km
    while ((km = keyRe.exec(m[2]))) out.push({ table, col: km[1], kind: m[1] })
  }
  return out
}

const cols = await liveSchema()
const files = readdirSync(SRV_DIR).filter((f) => f.endsWith('.ts'))
let flags = 0
for (const f of files) {
  const src = readFileSync(resolve(SRV_DIR, f), 'utf-8')
  const refs = refsFor(src)
  const bad = []
  const seen = new Set()
  for (const r of refs) {
    const live = cols[r.table]
    if (!live) continue // unknown table (view/embedded alias) — skip, can't validate
    if (!live.has(r.col)) {
      const k = `${r.table}.${r.col}`
      if (!seen.has(k)) { seen.add(k); bad.push(`${r.table}.${r.col} (${r.kind})`) }
    }
  }
  if (bad.length) { flags += bad.length; console.log(`\n${f}:`); for (const b of bad) console.log('   ⚠️ ' + b) }
}
console.log(`\n=== ${flags} suspicious column refs across ${files.length} files ===`)
console.log('(views/embedded relations are skipped — verify those manually)')
process.exit(0)
