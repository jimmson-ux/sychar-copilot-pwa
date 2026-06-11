/**
 * Gate Control = ONE generic shared login used by two guards who alternate shifts.
 * - Generic login "Gate Control" (gatecontrol@pceamatasia.sychar.co.ke / PCEA2026), gate_guard.
 * - Linet (gate_guard) + David (night_guard) → reference only (can_login=false, real names+IDs
 *   kept) so the in-app shift sign-in can list + validate who is on duty. Linet's old personal
 *   login is removed (her name no longer fronts the shared account).
 * Run: node scripts/matasia-gate-control.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODgzMjksImV4cCI6MjA4ODU2NDMyOX0.kupDqFyVJ7ug348-cxYNjxrSTv69ajZjPzhcDLoTcPU'
const SID  = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'
const GATE_EMAIL = 'gatecontrol@pceamatasia.sychar.co.ke'
const GATE_PW = 'PCEA2026'
const admin = createClient(URL, SKEY, { auth: { persistSession: false } })

async function findAuthUserByEmail(email) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return (data?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase()) ?? null
}
async function verifyLogin(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return (await r.json()).access_token ? true : false
}

const { data: gates } = await admin.from('staff_records')
  .select('id, full_name, sub_role, email, user_id, can_login').eq('school_id', SID).in('sub_role', ['gate_guard', 'night_guard'])

// 1. Demote the two real guards to reference; drop Linet's personal auth user.
for (const g of gates ?? []) {
  if (g.full_name === 'Gate Control') continue
  if (g.user_id) { await admin.auth.admin.deleteUser(g.user_id).catch(() => {}) }
  await admin.from('staff_records').update({ can_login: false, user_id: null }).eq('id', g.id)
  console.log(`Reference guard: ${g.full_name} (${g.sub_role}) — can_login=false, login removed`)
}

// 2. Generic shared "Gate Control" login (idempotent).
let gc = (gates ?? []).find((g) => g.full_name === 'Gate Control')
let authUser = await findAuthUserByEmail(GATE_EMAIL)
if (!authUser) {
  const { data: created, error } = await admin.auth.admin.createUser({ email: GATE_EMAIL, password: GATE_PW, email_confirm: true })
  if (error) { console.error('createUser:', error.message); process.exit(1) }
  authUser = created.user
} else {
  await admin.auth.admin.updateUserById(authUser.id, { password: GATE_PW, email_confirm: true })
}
if (!gc) {
  const { data: ins, error } = await admin.from('staff_records').insert({
    school_id: SID, full_name: 'Gate Control', sub_role: 'gate_guard', email: GATE_EMAIL,
    user_id: authUser.id, can_login: true, is_active: true, employment_type: 'bom',
    department: 'Support', force_password_change: false,
  }).select('id').single()
  if (error) { console.error('insert Gate Control:', error.message); process.exit(1) }
  gc = ins
} else {
  await admin.from('staff_records').update({ user_id: authUser.id, can_login: true, email: GATE_EMAIL }).eq('id', gc.id)
}

const ok = await verifyLogin(GATE_EMAIL, GATE_PW)
console.log(`\nGate Control login: ${GATE_EMAIL} / ${GATE_PW} — ${ok ? 'OK ✅' : 'FAILED ❌'}`)
const { data: ref } = await admin.from('staff_records').select('full_name, sub_role, national_id').eq('school_id', SID).in('sub_role', ['gate_guard','night_guard']).eq('can_login', false)
console.log('Reference guards (selectable for shift sign-in):', JSON.stringify(ref))
process.exit(0)
