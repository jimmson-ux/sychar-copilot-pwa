/**
 * Per-school data backup — snapshots key tables to the `documents` bucket as a single
 * timestamped JSON file (school_id-scoped). Complements Supabase's own point-in-time
 * recovery; this gives an operator-restorable, per-tenant export.
 *
 * Run: node scripts/backup-school.mjs <school_id|all>
 * (Service key only — no DB password needed. Schedule via QStash/cron for daily/weekly.)
 */
import { createClient } from '@supabase/supabase-js'

const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const db = createClient(URL, SKEY, { auth: { autoRefreshToken: false, persistSession: false } })

// Operational tables worth snapshotting per school (config + records; not analytics logs).
// school_id-scoped operational tables. (marks excluded — it has no school_id; it is
// covered by Supabase point-in-time recovery.)
const TABLES = [
  'students', 'staff_records', 'classes', 'subjects', 'academic_terms',
  'fee_payments', 'fee_balances', 'payment_claims', 'discipline_records',
  'attendance_records', 'requisitions', 'purchase_orders', 'suppliers',
  'maintenance_requests', 'incident_reports', 'meetings', 'school_reference_docs',
  'safeguard_cases', 'dormitories', 'dorm_assignments', 'tenant_configs',
]

// PostgREST caps at 1000 rows/request — page through with .range() to capture everything.
async function fetchAll(table, schoolId) {
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select('*').eq('school_id', schoolId).range(from, from + 999)
    if (error) throw new Error(error.message)
    all.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return all
}

async function backupSchool(schoolId) {
  const snapshot = { school_id: schoolId, taken_at: new Date().toISOString(), tables: {} }
  for (const t of TABLES) {
    try { snapshot.tables[t] = await fetchAll(t, schoolId) }
    catch (e) { console.log(`  ! ${t}: ${e.message}`) }
  }
  const path = `backups/${schoolId}/${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`
  const { error: upErr } = await db.storage.from('documents')
    .upload(path, new Blob([JSON.stringify(snapshot)], { type: 'application/json' }), { upsert: true })
  if (upErr) { console.log(`  ❌ upload ${schoolId}: ${upErr.message}`); return }
  const counts = Object.entries(snapshot.tables).map(([t, r]) => `${t}=${r.length}`).join(' ')
  console.log(`  ✓ ${schoolId} → ${path}`)
  console.log(`    ${counts}`)
}

async function main() {
  const arg = process.argv[2]
  if (!arg) { console.error('Usage: node scripts/backup-school.mjs <school_id|all>'); process.exit(1) }
  let ids = [arg]
  if (arg === 'all') {
    const { data } = await db.from('schools').select('id, name')
    ids = (data ?? []).map((s) => s.id)
    console.log(`Backing up ${ids.length} schools...`)
  }
  for (const id of ids) await backupSchool(id)
  console.log('✅ Backup complete.')
}
main().catch((e) => { console.error(e); process.exit(1) })
