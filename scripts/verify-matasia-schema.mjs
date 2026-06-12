/**
 * READ-ONLY verification for the PCEA Upper Matasia wiring pass.
 * Confirms live columns for tables Tasks 1/4/6 reference + sample data checks.
 * Run: node scripts/verify-matasia-schema.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const SID  = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'
const db = createClient(URL, SKEY, { auth: { persistSession: false } })

// Pull the PostgREST OpenAPI definitions = authoritative live column list.
const openapi = await fetch(`${URL}/rest/v1/`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } }).then(r => r.json())
const defs = openapi.definitions ?? {}
const cols = (t) => defs[t] ? Object.keys(defs[t].properties ?? {}) : null

const TABLES = [
  'tod_master_schedule', 'visitor_log', 'discipline_records', 'daily_incident_logs',
  'student_attendance', 'attendance', 'attendance_records', 'lesson_attendance',
  'leave_applications', 'staff_leave', 'leave_requests',
  'parent_student_links', 'students', 'store_requisitions', 'staff_notifications',
  'counselling_sessions', 'fee_receipts', 'school_receipts', 'lesson_absence_reasons',
  'document_embeddings', 'tenant_configs',
]
console.log('=== LIVE COLUMNS (null = table absent) ===')
for (const t of TABLES) {
  const c = cols(t)
  console.log(`\n# ${t}${c ? '' : '  <<< ABSENT'}`)
  if (c) console.log('  ' + c.join(', '))
}

// Sample checks
console.log('\n=== SAMPLE DATA ===')
const { data: tc } = await db.from('tenant_configs').select('slug, school_short_code, settings').eq('school_id', SID).maybeSingle()
console.log('tenant_configs MTSA:', JSON.stringify(tc))

const { data: genders } = await db.from('students').select('gender').eq('school_id', SID).eq('is_active', true)
const gdist = {}
for (const g of genders ?? []) gdist[g.gender ?? 'null'] = (gdist[g.gender ?? 'null'] ?? 0) + 1
console.log('student gender distribution:', JSON.stringify(gdist))

const { data: classes } = await db.from('students').select('class_name').eq('school_id', SID).eq('is_active', true)
const cdist = {}
for (const c of classes ?? []) cdist[c.class_name ?? 'null'] = (cdist[c.class_name ?? 'null'] ?? 0) + 1
console.log('class_name distribution:', JSON.stringify(cdist))

const { data: tod } = await db.from('tod_master_schedule').select('*').eq('school_id', SID).limit(2)
console.log('tod_master_schedule rows for PCEA:', (tod ?? []).length, tod?.[0] ? Object.keys(tod[0]).join(',') : '(none)')

const { data: staff } = await db.from('staff_records').select('full_name, sub_role, assigned_class').eq('school_id', SID).not('assigned_class', 'is', null)
console.log('class teachers (assigned_class set):', JSON.stringify(staff))
