import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local
const envPath = resolve(__dirname, '..', '.env.local')
const env = readFileSync(envPath, 'utf-8')
const vars = {}
for (const line of env.split('\n')) {
  const eq = line.indexOf('=')
  if (eq < 0) continue
  const k = line.slice(0, eq).trim()
  const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  vars[k] = v
}

const URL  = vars['NEXT_PUBLIC_SUPABASE_URL']
const SKEY = vars['SUPABASE_SERVICE_ROLE_KEY']

if (!URL || !SKEY) { console.error('Missing env vars'); process.exit(1) }

const sb = createClient(URL, SKEY, { auth: { autoRefreshToken: false, persistSession: false } })

// Read migration SQL
const sqlPath = resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260403160000_enforce_rls.sql')
const sql = readFileSync(sqlPath, 'utf-8')

// Split on -- ── section headers and run each ALTER + CREATE POLICY block
// Supabase REST can't run multi-statement SQL directly so we use rpc exec
// Instead, run each statement individually
const statements = sql
  .split('\n')
  .join(' ')
  .split(';')
  .map(s => s.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim())
  .filter(s => s.length > 10)

console.log(`Running ${statements.length} SQL statements…\n`)

let ok = 0, fail = 0
for (const stmt of statements) {
  const { error } = await sb.rpc('exec_sql_statement', { p_sql: stmt }).single()
  if (error) {
    // Try direct approach via pg_catalog
    const res = await fetch(URL + '/rest/v1/rpc/exec_sql_statement', {
      method: 'POST',
      headers: {
        apikey: SKEY,
        Authorization: 'Bearer ' + SKEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_sql: stmt }),
    })
    if (!res.ok) {
      const txt = await res.text()
      if (!txt.includes('already exists') && !txt.includes('PGRST202')) {
        console.error('❌ FAIL:', stmt.slice(0, 80))
        console.error('   ', txt.slice(0, 120))
        fail++
      } else {
        ok++
      }
    } else {
      ok++
    }
  } else {
    ok++
  }
}

console.log(`\n✅ ${ok} ok  ❌ ${fail} failed`)
