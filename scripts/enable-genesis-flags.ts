/**
 * Enable Genesis lesson-attendance + strict geofencing across all live tenants.
 * Run: npx tsx scripts/enable-genesis-flags.ts
 *
 * Sets, idempotently, for Nkoroi, PCEA Upper Matasia and Oloolaiser:
 *   - qr_lesson_attendance = true   (teacher lesson-attendance QR)
 *   - strict_geofence      = true   (mandatory geofence + room lock on every scan)
 * in BOTH feature stores the platform reads:
 *   - school_metadata.features_enabled  (frontend SchoolContext / useFeatureFlag)
 *   - tenant_configs.features           (server tenantHasFeature + scan-lesson-qr edge fn)
 *
 * Also sets tenant_configs.genesis_max_delegates:
 *   - Oloolaiser = 2  (deputy + one of choice; extensive boarding campus)
 *   - others     = null (unlimited additional delegates)
 *
 * The deputy principal + principal are ALWAYS implicitly allowed regardless of cap.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'

const NKOROI_ID  = '68bd8d34-f2f0-4297-bd18-093328824d84'
const MATASIA_ID = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const GENESIS_FLAGS = { qr_lesson_attendance: true, strict_geofence: true }

async function resolveOloolaiser(): Promise<string | null> {
  const { data } = await db
    .from('schools')
    .select('id, name, subdomain')
    .or('subdomain.eq.oloolaiser,name.ilike.%oloolaiser%')
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

async function mergeJsonbColumn(
  table: string,
  column: string,
  schoolId: string,
  patch: Record<string, unknown>,
) {
  const { data } = await db.from(table).select(column).eq('school_id', schoolId).maybeSingle()
  if (!data) {
    console.warn(`  ! no ${table} row for ${schoolId} — skipping ${column}`)
    return
  }
  const current = ((data as any)[column] ?? {}) as Record<string, unknown>
  const merged = { ...current, ...patch }
  const { error } = await db.from(table).update({ [column]: merged }).eq('school_id', schoolId)
  if (error) console.error(`  x ${table}.${column}:`, error.message)
  else console.log(`  ✓ ${table}.${column} updated`)
}

async function enableForSchool(schoolId: string, label: string, maxDelegates: number | null) {
  console.log(`\n→ ${label} (${schoolId})`)
  await mergeJsonbColumn('school_metadata', 'features_enabled', schoolId, GENESIS_FLAGS)
  await mergeJsonbColumn('tenant_configs', 'features', schoolId, GENESIS_FLAGS)
  const { error } = await db
    .from('tenant_configs')
    .update({ genesis_max_delegates: maxDelegates })
    .eq('school_id', schoolId)
  if (error) console.error('  x genesis_max_delegates:', error.message)
  else console.log(`  ✓ genesis_max_delegates = ${maxDelegates ?? 'unlimited'}`)
}

async function main() {
  await enableForSchool(NKOROI_ID, 'Nkoroi Mixed', null)
  await enableForSchool(MATASIA_ID, 'PCEA Upper Matasia', null)

  const oloolaiser = await resolveOloolaiser()
  if (oloolaiser) {
    await enableForSchool(oloolaiser, 'Oloolaiser High', 2)
  } else {
    console.warn('\n! Oloolaiser school row not found yet — run scripts/seed-oloolaiser.ts first, then re-run this.')
  }

  console.log('\nDone.')
}

main().catch((e) => { console.error(e); process.exit(1) })
