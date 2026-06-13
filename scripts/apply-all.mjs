/**
 * Apply ALL sprint DDL end-to-end and fix the stale PostgREST schema cache.
 * Run: node scripts/apply-all.mjs "postgresql://postgres:<PASSWORD>@db.xwgtsldimlrhtgvpnjnd.supabase.co:5432/postgres"
 *   (or set DATABASE_URL / SUPABASE_DB_URL in the env and run with no arg)
 *
 * Steps:
 *   1. Run every sprint migration (all are idempotent — IF NOT EXISTS / DROP POLICY IF EXISTS).
 *   2. NOTIFY pgrst,'reload schema'  → makes new tables/columns visible immediately.
 *   3. Set Oloolaiser tenant_configs: secretary_module=true, gender_profile=boys,
 *      genesis_max_delegates=2 (idempotent).
 *
 * After this completes, run the data seeds (service-key, no DB password needed):
 *   npx tsx scripts/seed-oloolaiser.ts
 *   npx tsx scripts/seed-oloolaiser-staff.ts
 *   node  scripts/seed-oloolaiser-staff-auth.mjs
 *   npx tsx scripts/enable-genesis-flags.ts
 *   npx tsx scripts/set-branding.ts
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(HERE, '..', 'supabase', 'migrations')

// Sprint migrations in dependency order. All idempotent — safe to re-run.
const FILES = [
  '20260610120000_staff_record_secondary_roles.sql',
  '20260611120000_gate_shift_log.sql',
  '20260612120000_genesis_delegations.sql',
  '20260612130000_school_reference_docs.sql',
  '20260612140000_nurse_module.sql',
  '20260612150000_gate_shift_fingerprint_exeat.sql',
  '20260612160000_tod_daily_report.sql',
  '20260612170000_nurse_staff_ledger_stock.sql',
  '20260612180000_nurse_followup.sql',
  '20260612190000_substitution.sql',
  '20260613210000_secretary_meetings_admin.sql',
]

const OLOOLAISER_ID = 'd228b049-1185-4bf5-9577-52f7f9c714e9'

const conn = process.argv[2] || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
if (!conn) {
  console.error('❌ Provide the DB connection string as arg 1, or set DATABASE_URL.')
  console.error('   node scripts/apply-all.mjs "postgresql://postgres:<PASSWORD>@db.xwgtsldimlrhtgvpnjnd.supabase.co:5432/postgres"')
  process.exit(1)
}

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()
  console.log('Connected.\n')

  for (const f of FILES) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8')
    process.stdout.write(`  • ${f} … `)
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('COMMIT')
      console.log('ok')
    } catch (e) {
      await client.query('ROLLBACK')
      console.log('FAILED')
      console.error(`    ${e.message}`)
      // Continue — an already-applied non-idempotent stmt shouldn't abort the rest.
    }
  }

  console.log('\nReloading PostgREST schema cache …')
  await client.query(`NOTIFY pgrst, 'reload schema'`)
  // Also bump the config-reload channel some PostgREST versions listen on.
  try { await client.query(`NOTIFY pgrst, 'reload config'`) } catch {}
  console.log('  ✓ NOTIFY pgrst reload sent')

  console.log('\nSetting Oloolaiser tenant_configs flags …')
  const r = await client.query(
    `UPDATE public.tenant_configs
       SET features = coalesce(features, '{}'::jsonb) || '{"secretary_module": true}'::jsonb,
           gender_profile = 'boys',
           genesis_max_delegates = 2
     WHERE school_id = $1`,
    [OLOOLAISER_ID],
  )
  console.log(`  ✓ tenant_configs updated (${r.rowCount} row)`)

  // Verify the new tables are now visible.
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name IN ('meetings','secretary_correspondence','school_deliveries','principal_digital_desk','secretary_tasks')
      ORDER BY table_name`,
  )
  console.log('\nNew tables present:', rows.map((x) => x.table_name).join(', ') || '(none!)')

  await client.end()
  console.log('\n✅ DDL + cache reload + flags done. Now run the seed scripts (see header).')
}

main().catch(async (e) => { console.error(e); try { await client.end() } catch {} ; process.exit(1) })
