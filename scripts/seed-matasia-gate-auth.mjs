/**
 * Make PCEA Upper Matasia's two gatekeepers logins (Linet = day gate_guard, David = night
 * night_guard — they alternate shifts). Enables can_login, creates Supabase Auth users with
 * generated institutional emails, links staff_records.user_id, login-verifies. Idempotent.
 *
 * Run: node scripts/seed-matasia-gate-auth.mjs
 *
 * Cook + groundsman stay non-users (can_login=false) per requirement.
 */
import { createClient } from '@supabase/supabase-js'

const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const SCHOOL_ID = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'
const DOMAIN = 'pceamatasia.sychar.co.ke'
const GATE_ROLES = ['gate_guard', 'night_guard']

const admin = createClient(URL, SKEY, { auth: { autoRefreshToken: false, persistSession: false } })
const cap  = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

function genEmail(fullName, used) {
  const parts = fullName.trim().split(/\s+/)
  const base = parts.length > 1 ? `${slug(parts[0])}.${slug(parts[parts.length - 1])}` : slug(parts[0])
  let email = `${base}@${DOMAIN}`, n = 1
  while (used.has(email)) email = `${base}${++n}@${DOMAIN}`
  used.add(email)
  return email
}

async function findAuthUserByEmail(email) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return (data?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase()) ?? null
}

async function verifyLogin(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: SKEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const d = await r.json()
  return !!d.access_token
}

async function main() {
  const { data: gates, error } = await admin
    .from('staff_records')
    .select('id, full_name, email, sub_role, user_id, can_login')
    .eq('school_id', SCHOOL_ID)
    .in('sub_role', GATE_ROLES)
    .order('full_name')

  if (error || !gates) { console.error('DB error:', error?.message); process.exit(1) }
  console.log(`Found ${gates.length} gatekeepers:`, gates.map((g) => `${g.full_name}(${g.sub_role})`).join(', '), '\n')

  const used = new Set()
  // Reserve any emails already in use across the whole school to avoid collisions.
  const { data: allEmails } = await admin.from('staff_records').select('email').eq('school_id', SCHOOL_ID)
  for (const r of allEmails ?? []) if (r.email) used.add(r.email.toLowerCase())

  const creds = []
  let ok = 0, fail = 0

  for (const s of gates) {
    const email = (s.email && s.email.trim()) ? s.email.trim().toLowerCase() : genEmail(s.full_name, used)
    const first = cap(s.full_name.trim().split(/\s+/)[0] ?? 'Guard')
    const password = `Sychar#${first}@2026`

    let userId = s.user_id
    if (userId) {
      const { error: e } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true })
      if (e) { console.log(`  ❌ ${s.full_name} — updateUserById: ${e.message}`); fail++; continue }
    } else {
      const { data: created, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
      if (ce || !created?.user) {
        const existing = await findAuthUserByEmail(email)
        if (!existing) { console.log(`  ❌ ${s.full_name} — createUser: ${ce?.message}`); fail++; continue }
        userId = existing.id
        await admin.auth.admin.updateUserById(userId, { password, email_confirm: true })
      } else {
        userId = created.user.id
      }
    }

    const patch = { user_id: userId, can_login: true, force_password_change: true }
    if (!s.email) patch.email = email
    const { error: le } = await admin.from('staff_records').update(patch).eq('id', s.id)
    if (le) { console.log(`  ❌ ${s.full_name} — link: ${le.message}`); fail++; continue }

    const works = await verifyLogin(email, password)
    if (works) { console.log(`  ✅ ${s.full_name} (${s.sub_role})`); creds.push({ name: s.full_name, role: s.sub_role, email, password }); ok++ }
    else { console.log(`  ⚠️  ${s.full_name} — set but login verify FAILED (${email})`); fail++ }
  }

  console.log(`\n── ${ok} ok · ${fail} failed ──\n`)
  console.log('GATEKEEPER LOGINS (distribute; reset on first login):')
  console.log('NAME'.padEnd(24), 'ROLE'.padEnd(13), 'EMAIL'.padEnd(42), 'PASSWORD')
  for (const c of creds) console.log(c.name.padEnd(24), c.role.padEnd(13), c.email.padEnd(42), c.password)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
