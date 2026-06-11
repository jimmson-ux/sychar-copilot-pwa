/**
 * Consolidate PCEA gate logins to a SINGLE shared "Gate Control" account.
 * - Linet (gate_guard): keep as the one gate login, password = PCEA2026, can_login=true.
 * - David (night_guard): retire login — can_login=false + delete the Auth user.
 * Both staff_records remain as reference data (names + ids) for the in-app shift sign-in.
 *
 * Run: node scripts/matasia-gate-control.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const SID  = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'
const GATE_PW = 'PCEA2026'
const admin = createClient(URL, SKEY, { auth: { persistSession: false } })

async function verifyLogin(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODgzMjksImV4cCI6MjA4ODU2NDMyOX0.kupDqFyVJ7ug348-cxYNjxrSTv69ajZjPzhcDLoTcPU', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return (await r.json()).access_token ? true : false
}

const { data: gates } = await admin.from('staff_records')
  .select('id, full_name, sub_role, email, user_id, can_login').eq('school_id', SID).in('sub_role', ['gate_guard', 'night_guard'])

for (const g of gates ?? []) {
  if (g.sub_role === 'gate_guard') {
    // The single shared Gate Control login.
    await admin.auth.admin.updateUserById(g.user_id, { password: GATE_PW, email_confirm: true })
    await admin.from('staff_records').update({ can_login: true, force_password_change: false }).eq('id', g.id)
    const ok = await verifyLogin(g.email, GATE_PW)
    console.log(`Gate Control: ${g.full_name} <${g.email}> pw=${GATE_PW} login=${ok ? 'OK ✅' : 'FAILED ❌'}`)
  } else {
    // Retire the night guard's login; keep the staff record as reference.
    await admin.from('staff_records').update({ can_login: false }).eq('id', g.id)
    if (g.user_id) {
      const { error } = await admin.auth.admin.deleteUser(g.user_id)
      // null out the link so nothing dangles
      await admin.from('staff_records').update({ user_id: null }).eq('id', g.id)
      console.log(`Retired login: ${g.full_name} — auth user deleted${error ? ' (' + error.message + ')' : ' ✅'}, kept as reference (can_login=false)`)
    } else {
      console.log(`Retired login: ${g.full_name} — no auth user, can_login=false ✅`)
    }
  }
}
process.exit(0)
