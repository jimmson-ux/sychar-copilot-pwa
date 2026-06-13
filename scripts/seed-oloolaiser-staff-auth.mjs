/**
 * Create Supabase Auth login users for Oloolaiser NON-TEACHING staff with can_login=true
 * (Secretary, Nurse, Storekeeper, Procurement, Counsellor, Bursar, Accounts) and link them
 * to staff_records (user_id). Idempotent: reuses existing auth users; safe to re-run.
 *
 * Run: node scripts/seed-oloolaiser-staff-auth.mjs   (after seed-oloolaiser-staff.ts)
 *
 * No emails in the source → institutional emails are GENERATED
 * (<first>.<last>@oloolaiser.sychar.co.ke). Default password Sychar#<First>@2026;
 * force_password_change is already true so they reset on first login.
 */
import { createClient } from '@supabase/supabase-js'

const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const DOMAIN = 'oloolaiser.sychar.co.ke'

const admin = createClient(URL, SKEY, { auth: { autoRefreshToken: false, persistSession: false } })

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

function genEmail(fullName, used) {
  const parts = fullName.trim().split(/\s+/)
  const first = slug(parts[0] ?? 'staff')
  const last  = slug(parts[parts.length - 1] ?? '')
  let base = last ? `${first}.${last}` : first
  let email = `${base}@${DOMAIN}`
  let n = 1
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

async function resolveSchool() {
  const { data } = await admin.from('schools').select('id, subdomain, name')
    .or('subdomain.eq.oloolaiser,name.ilike.%oloolaiser%').maybeSingle()
  return data?.id ?? null
}

async function main() {
  const SCHOOL_ID = await resolveSchool()
  if (!SCHOOL_ID) { console.error('❌ Oloolaiser school not found'); process.exit(1) }

  const { data: staff, error } = await admin
    .from('staff_records')
    .select('id, full_name, email, sub_role, user_id, can_login')
    .eq('school_id', SCHOOL_ID).eq('is_active', true).eq('can_login', true)
    .order('full_name')
  if (error || !staff) { console.error('DB error:', error?.message); process.exit(1) }
  console.log(`Found ${staff.length} loginable Oloolaiser non-teaching staff.\n`)

  const used = new Set(staff.map((s) => (s.email ?? '').toLowerCase()).filter(Boolean))
  const creds = []
  let ok = 0, fail = 0

  for (const s of staff) {
    const email = (s.email && s.email.trim()) ? s.email.trim().toLowerCase() : genEmail(s.full_name, used)
    const first = cap(s.full_name.trim().split(/\s+/)[0] ?? 'Staff')
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

    const patch = { user_id: userId, can_login: true }
    if (!s.email) patch.email = email
    const { error: le } = await admin.from('staff_records').update(patch).eq('id', s.id)
    if (le) { console.log(`  ❌ ${s.full_name} — link: ${le.message}`); fail++; continue }

    const works = await verifyLogin(email, password)
    if (works) { console.log(`  ✅ ${s.full_name} (${s.sub_role})`); creds.push({ name: s.full_name, role: s.sub_role, email, password }); ok++ }
    else { console.log(`  ⚠️  ${s.full_name} — set but login verify FAILED (${email})`); fail++ }
  }

  console.log(`\n── ${ok} ok · ${fail} failed ──\n`)
  console.log('LOGIN CREDENTIALS (distribute to staff; they reset on first login):')
  console.log('NAME'.padEnd(26), 'ROLE'.padEnd(22), 'EMAIL'.padEnd(42), 'PASSWORD')
  for (const c of creds) console.log(c.name.padEnd(26), c.role.padEnd(22), c.email.padEnd(42), c.password)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
