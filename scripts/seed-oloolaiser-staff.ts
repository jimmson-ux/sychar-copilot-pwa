/**
 * Seed Oloolaiser High School NON-TEACHING staff (23, VERBATIM from the official
 * support-staff roster — names/designations/phones). Run: npx tsx scripts/seed-oloolaiser-staff.ts
 *
 * ZERO synthetic data. Teaching staff arrive with the teacher roster separately.
 *
 * Login + dashboard (can_login=true) — the roles the user named as needing a PWA,
 * plus the core finance + G&C dashboards that exist at every school:
 *   - Secretary       AGNES MURIITHI        sub_role=secretary            (+ secretary_module)
 *   - Nurse           CAROLYNE JUMA         sub_role=nurse                (+ school_nurse)
 *   - Storekeeper     ISABEL WAITHERA       sub_role=storekeeper
 *   - Procurement     ANN SIPILON ROGEI     sub_role=procurement_officer
 *   - Counsellor      MARY NGUMBI           sub_role=guidance_counselling (FULL-TIME, not a teacher)
 *   - Bursar          MARGARET NYAMBURA     sub_role=bursar
 *   - Accounts        PRISCILLA MAKORI      sub_role=accounts_clerk
 * Everyone else (reception, librarian, cooks, drivers, messengers, lab techs,
 * cleaner, cateress, artisan) is reference-only: can_login=false, push_recipient=false.
 *
 * Idempotent: matches existing by full_name; re-running updates rather than duplicates.
 * After this, run: node scripts/seed-oloolaiser-staff-auth.mjs to mint logins.
 */
import { createClient } from '@supabase/supabase-js'

const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'

const db = createClient(URL, SKEY, { auth: { autoRefreshToken: false, persistSession: false } })

interface Staff {
  full_name: string; sub_role: string; designation: string
  phone: string; department: string
  can_login: boolean; push_recipient: boolean
}

// sub_role is authoritative (memory: queries use sub_role, never role).
const STAFF: Staff[] = [
  { full_name: 'ANN SIPILON ROGEI',     sub_role: 'procurement_officer',  designation: 'Procurement Officer', phone: '0723086635', department: 'Procurement',    can_login: true,  push_recipient: true },
  { full_name: 'PAUL NDUHIU',           sub_role: 'driver',               designation: 'Driver',              phone: '0727522587', department: 'Transport',      can_login: false, push_recipient: false },
  { full_name: 'CAROLYNE JUMA',         sub_role: 'nurse',                designation: 'School Nurse',        phone: '0721441498', department: 'Health',         can_login: true,  push_recipient: true },
  { full_name: 'SOSNES ALUSA',          sub_role: 'cook',                 designation: 'Cook',                phone: '0725667846', department: 'Catering',       can_login: false, push_recipient: false },
  { full_name: 'KEZIAH WANJIRU MWANGI', sub_role: 'messenger',            designation: 'Messenger',           phone: '0723663937', department: 'Administration', can_login: false, push_recipient: false },
  { full_name: 'MARGARET NYAMBURA',     sub_role: 'bursar',               designation: 'Bursar',              phone: '0714738729', department: 'Finance',        can_login: true,  push_recipient: true },
  { full_name: 'MOSES MWANGI',          sub_role: 'cook',                 designation: 'Cook',                phone: '0737426242', department: 'Catering',       can_login: false, push_recipient: false },
  { full_name: 'JAMES WAINAINA',        sub_role: 'lab_technician',       designation: 'Laboratory Technician', phone: '0716245921', department: 'Sciences',     can_login: false, push_recipient: false },
  { full_name: 'RAPHAEL NDAMBUKI',      sub_role: 'cook',                 designation: 'Cook',                phone: '0719774210', department: 'Catering',       can_login: false, push_recipient: false },
  { full_name: 'JACOB MWENDA',          sub_role: 'cook',                 designation: 'Cook',                phone: '0708611521', department: 'Catering',       can_login: false, push_recipient: false },
  { full_name: 'FRANCIS KARIUKI',       sub_role: 'lab_technician',       designation: 'Laboratory Technician', phone: '0710284864', department: 'Sciences',     can_login: false, push_recipient: false },
  { full_name: 'RUTH MARITIM',          sub_role: 'librarian',            designation: 'Librarian',           phone: '0721485948', department: 'Library',        can_login: false, push_recipient: false },
  { full_name: 'ISABEL WAITHERA',       sub_role: 'storekeeper',          designation: 'Storekeeper',         phone: '0724671252', department: 'Stores',         can_login: true,  push_recipient: true },
  { full_name: 'ANDREW MULI',           sub_role: 'messenger',            designation: 'Messenger',           phone: '0702517597', department: 'Administration', can_login: false, push_recipient: false },
  { full_name: 'PAUL MBURU MUIGAI',     sub_role: 'cook',                 designation: 'Cook',                phone: '0758455504', department: 'Catering',       can_login: false, push_recipient: false },
  { full_name: 'YOBESH ISOE',           sub_role: 'cook',                 designation: 'Cook',                phone: '0724768135', department: 'Catering',       can_login: false, push_recipient: false },
  { full_name: 'AGNES MURIITHI',        sub_role: 'secretary',            designation: 'School Secretary',    phone: '0712127419', department: 'Administration', can_login: true,  push_recipient: true },
  { full_name: 'FRANCIS KAMAU',         sub_role: 'artisan',              designation: 'Artisan / Maintenance', phone: '0721492627', department: 'Maintenance',  can_login: false, push_recipient: false },
  { full_name: 'PRISCILLA MAKORI',      sub_role: 'accounts_clerk',       designation: 'Accounts Clerk',      phone: '0707389052', department: 'Finance',        can_login: true,  push_recipient: true },
  { full_name: 'GLADYS MUSYOKA',        sub_role: 'receptionist',         designation: 'Receptionist',        phone: '0706313590', department: 'Administration', can_login: false, push_recipient: false },
  { full_name: 'GERALD MUIRURI',        sub_role: 'cleaner',              designation: 'Compound Cleaner',    phone: '0729066446', department: 'Support',        can_login: false, push_recipient: false },
  { full_name: 'MARY NGUMBI',           sub_role: 'guidance_counselling', designation: 'Counsellor (Full-time)', phone: '0707440184', department: 'Guidance & Counselling', can_login: true, push_recipient: true },
  { full_name: 'JANET JOSHUA',          sub_role: 'cateress',             designation: 'Cateress',            phone: '0721370976', department: 'Catering',       can_login: false, push_recipient: false },
]

async function resolveSchool(): Promise<string | null> {
  const { data } = await db.from('schools').select('id, name, subdomain')
    .or('subdomain.eq.oloolaiser,name.ilike.%oloolaiser%').maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

async function main() {
  const SCHOOL_ID = await resolveSchool()
  if (!SCHOOL_ID) { console.error('❌ Oloolaiser school row not found.'); process.exit(1) }
  console.log(`Oloolaiser school_id = ${SCHOOL_ID}\n`)

  const { data: have } = await db.from('staff_records')
    .select('id, full_name').eq('school_id', SCHOOL_ID)
  const byName = new Map<string, string>()
  for (const s of have ?? []) byName.set((s as any).full_name.toUpperCase(), (s as any).id)

  let created = 0, updated = 0
  for (const s of STAFF) {
    const row = {
      school_id: SCHOOL_ID,
      full_name: s.full_name,
      sub_role: s.sub_role,
      phone: s.phone,
      department: s.department,
      departments: [s.department],
      employment_type: 'bom',
      is_active: true,
      can_login: s.can_login,
      force_password_change: s.can_login,
      push_recipient: s.push_recipient,
    }
    const existingId = byName.get(s.full_name.toUpperCase())
    if (existingId) {
      const { error } = await db.from('staff_records').update(row).eq('id', existingId)
      if (error) { console.log(`  ❌ ${s.full_name}: ${error.message}`); continue }
      updated++; console.log(`  ↻ ${s.full_name.padEnd(24)} ${s.sub_role}${s.can_login ? '  [login]' : ''}`)
    } else {
      const { error } = await db.from('staff_records').insert(row)
      if (error) { console.log(`  ❌ ${s.full_name}: ${error.message}`); continue }
      created++; console.log(`  ✓ ${s.full_name.padEnd(24)} ${s.sub_role}${s.can_login ? '  [login]' : ''}`)
    }
  }

  const login = STAFF.filter((s) => s.can_login)
  console.log(`\n✅ Done. created=${created}, updated=${updated}, total=${STAFF.length}`)
  console.log(`   Login-enabled (${login.length}): ${login.map((s) => `${s.full_name} (${s.sub_role})`).join(', ')}`)
  console.log('   Reference-only (no PWA): the remaining 16 support staff.')
  console.log('   NEXT: node scripts/seed-oloolaiser-staff-auth.mjs  → mint Supabase Auth logins.')
}

main().catch((e) => { console.error(e); process.exit(1) })
