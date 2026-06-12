/** READ-ONLY: prove PCEA/Nkoroi parent isolation — no data collision. */
import { createClient } from '@supabase/supabase-js'
const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const db = createClient(URL, SKEY, { auth: { persistSession: false } })
const PCEA = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'
const NKOROI = '68bd8d34-f2f0-4297-bd18-093328824d84'

// 1. School-code uniqueness: does MTSA / pceamatasia / 1834 / nkoroimixed resolve to exactly one tenant?
for (const code of ['MTSA', 'pceamatasia', '1834', 'nkoroimixed', 'NKOROI']) {
  const { data } = await db.from('tenant_configs').select('school_id, name')
    .or(`slug.eq.${code.toLowerCase()},school_short_code.eq.${code.toUpperCase()}`)
  console.log(`code "${code}" -> ${(data ?? []).length} tenant(s): ${(data ?? []).map(t => t.name).join(' | ') || '(none)'}`)
}

// 2. Cross-school NAME collisions (same full_name in both schools) — isolation must hold despite these.
const { data: p } = await db.from('students').select('full_name').eq('school_id', PCEA).eq('is_active', true)
const { data: n } = await db.from('students').select('full_name').eq('school_id', NKOROI).eq('is_active', true)
const nset = new Set((n ?? []).map(s => (s.full_name || '').trim().toLowerCase()))
const collisions = (p ?? []).map(s => (s.full_name || '').trim().toLowerCase()).filter(x => x && nset.has(x))
console.log(`\nPCEA students=${(p ?? []).length}, Nkoroi students=${(n ?? []).length}`)
console.log(`cross-school identical-name collisions: ${collisions.length}${collisions.length ? ' -> ' + [...new Set(collisions)].slice(0,5).join(', ') : ''}`)
console.log('(scoping is by school_id, so even identical names stay isolated as long as the parent enters the right school code)')

// 3. Shared guardian phones across schools (same parent_phone in both) — links are school-scoped so still isolated.
const { data: pp } = await db.from('students').select('parent_phone').eq('school_id', PCEA).not('parent_phone','is',null)
const { data: np } = await db.from('students').select('parent_phone').eq('school_id', NKOROI).not('parent_phone','is',null)
const npset = new Set((np ?? []).map(s => s.parent_phone))
const sharedPhones = [...new Set((pp ?? []).map(s => s.parent_phone).filter(x => npset.has(x)))]
console.log(`\nPCEA guardian phones on file: ${(pp ?? []).length}; shared-with-Nkoroi phones: ${sharedPhones.length}`)

// 4. parent_student_links cross-school leakage check: any link row whose student belongs to a different school_id?
const { data: links } = await db.from('parent_student_links').select('school_id, student_id, students(school_id)').limit(2000)
let mismatched = 0
for (const l of links ?? []) { const ss = l.students?.school_id; if (ss && ss !== l.school_id) mismatched++ }
console.log(`parent_student_links rows checked: ${(links ?? []).length}; school_id mismatches (leakage): ${mismatched}`)

// 5. host_staff_id nullability (PostgREST OpenAPI 'required' list)
const openapi = await fetch(`${URL}/rest/v1/`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } }).then(r => r.json())
const req = openapi.definitions?.visitor_log?.required ?? []
console.log(`\nvisitor_log NOT NULL columns: ${req.join(', ') || '(none)'}`)
console.log(`host_staff_id is ${req.includes('host_staff_id') ? 'NOT NULL (migration needed)' : 'already NULLABLE'}`)
