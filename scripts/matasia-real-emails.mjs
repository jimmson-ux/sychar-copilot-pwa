/**
 * Set PCEA teachers' REAL Gmail addresses for login (Google + password).
 * Updates the EXISTING Supabase Auth user's email (SAME uid) so staff_records.user_id stays
 * linked, and updates staff_records.email. Password is preserved. Idempotent. Run:
 *   node scripts/matasia-real-emails.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODgzMjksImV4cCI6MjA4ODU2NDMyOX0.kupDqFyVJ7ug348-cxYNjxrSTv69ajZjPzhcDLoTcPU'
const SID  = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'
const admin = createClient(URL, SKEY, { auth: { persistSession: false } })

// match key (unique substring of full_name) -> real gmail
const MAP = [
  ['ALICE',   'alicemuturi001@gmail.com'],     // principal
  ['MILCAH',  'millymans41@gmail.com'],         // qaso
  ['NGIGI',   'njorongigi@gmail.com'],          // dean_of_students
  ['BRENDA',  'loicee89@gmail.com'],            // hod_languages
  ['OKINDO',  'evansmogire022@gmail.com'],      // hod_sciences
  ['KINOTI',  'kderic7@gmail.com'],             // dean_of_studies (already)
  ['MURUKA',  'atmurukambugua@gmail.com'],      // hod_humanities (Ann)
  ['MALABA',  'harrisonmalaba16@gmail.com'],    // hod_applied_sciences
  ['KIRUMBA', 'moses.kariu2019@gmail.com'],     // class_teacher (Moses)
]
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()

async function verifyLogin(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return (await r.json()).access_token ? true : false
}

const { data: staff } = await admin.from('staff_records')
  .select('id, full_name, sub_role, email, user_id').eq('school_id', SID).eq('can_login', true)

let ok = 0, fail = 0
for (const [key, gmail] of MAP) {
  const s = (staff ?? []).find((x) => x.full_name.toUpperCase().includes(key))
  if (!s) { console.log(`  ❌ no staff match for "${key}"`); fail++; continue }
  if (!s.user_id) { console.log(`  ❌ ${s.full_name} has no user_id`); fail++; continue }

  const lower = gmail.trim().toLowerCase()
  // 1) update Auth user email (same uid), keep it confirmed
  const { error: ae } = await admin.auth.admin.updateUserById(s.user_id, { email: lower, email_confirm: true })
  if (ae) { console.log(`  ❌ ${s.full_name} — auth email update: ${ae.message}`); fail++; continue }
  // 2) update staff_records.email
  await admin.from('staff_records').update({ email: lower }).eq('id', s.id)

  // 3) verify password login still works with the NEW email
  const pw = `Sychar#${cap(s.full_name.trim().split(/\s+/)[0])}@2026`
  const works = await verifyLogin(lower, pw)
  console.log(`  ${works ? '✅' : '⚠️ '} ${s.full_name.padEnd(24)} ${s.sub_role.padEnd(22)} -> ${lower}${works ? '' : ' (email set; pw-verify failed — Google will still work)'}`)
  works ? ok++ : fail++
}
console.log(`\n── ${ok} ok · ${fail} failed ──`)
console.log('Moti (deputy), Kebati (teacher), Esther (G10 class teacher) keep generated email+password until their Gmails are provided.')
process.exit(0)
