/**
 * Apply the biometric C2 + lifecycle migrations idempotently, then reload PostgREST.
 * Run: node scripts/apply-c2.mjs   (reads POSTGRES_URL / DATABASE_URL from .env.local)
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

// Load .env.local (no dependency on dotenv).
try {
  for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

const FILES = [
  '20260613280000_biometric_presence.sql',
  '20260614020000_staff_student_lifecycle.sql',
  '20260614010000_notices_relax.sql',
  '20260614030000_exeat_escalation.sql',
]

let conn = process.argv[2] || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL
if (!conn) { console.error('❌ No DB connection string (POSTGRES_URL / DATABASE_URL).'); process.exit(1) }
// Drop sslmode so our explicit ssl:{rejectUnauthorized:false} governs (Supabase uses a self-signed chain).
conn = conn.replace(/[?&]sslmode=[^&]*/i, '').replace(/[?&]uselibpqcompat=[^&]*/i, '')

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()
  console.log('Connected.\n')
  for (const f of FILES) {
    process.stdout.write(`  • ${f} … `)
    try {
      await client.query('BEGIN')
      await client.query(readFileSync(join(MIGRATIONS, f), 'utf8'))
      await client.query('COMMIT')
      console.log('ok')
    } catch (e) {
      await client.query('ROLLBACK')
      console.log('FAILED\n    ' + e.message)
    }
  }
  console.log('\nReloading PostgREST schema cache …')
  await client.query(`NOTIFY pgrst, 'reload schema'`)
  // Verify key objects.
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public'
         AND table_name IN ('student_presence','student_movements','device_health')
     UNION ALL
     SELECT 'exeat_requests.escalation_level' WHERE EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_name='exeat_requests' AND column_name='escalation_level')
     ORDER BY 1`)
  console.log('Present:', rows.map((r) => r.table_name).join(', ') || '(none!)')
  await client.end()
  console.log('\n✅ C2 DDL + cache reload done.')
}
main().catch(async (e) => { console.error(e.message); try { await client.end() } catch {} ; process.exit(1) })
