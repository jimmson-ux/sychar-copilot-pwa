/**
 * scripts/fix-auth.ts
 * Resets every loginable staff member's Supabase Auth password.
 * Uses the same password table as verify-passwords.ts.
 *
 * Run: npx tsx scripts/fix-auth.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Load env ──────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const k = t.slice(0, eq).trim()
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  } catch { /* no .env.local */ }
}
loadEnv()

const URL       = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SKEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SCHOOL_ID = process.env.NEXT_PUBLIC_SCHOOL_ID!

if (!URL || !SKEY || !SCHOOL_ID) { console.error('Missing env vars (SUPABASE_URL, SERVICE_ROLE_KEY, NEXT_PUBLIC_SCHOOL_ID)'); process.exit(1) }

const admin = createClient(URL, SKEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Password table (mirrors verify-passwords.ts) ──────────────────────────────
const EMAIL_PW: Record<string, string> = {
  'rita2thiringi@gmail.com':      'Nkoroi#Rita01',
  'danielmbugua232@gmail.com':    'Nkoroi#Dan02',
  'geraldmogere@gmail.com':       'Nkoroi#Ger03',
  'otienofelix909@gmail.com':     'Nkoroi#Fel13',
  'dlenairoshi@gmail.com':        'Nkoroi#Dean04',
  'jafwande@gmail.com':           'Nkoroi#Dean04',
  'joyceigwora82@gmail.com':      'Nkoroi#Couns06',
  'faithtirops@gmail.com':        'Nkoroi#App12',
  'denochep@gmail.com':           'Nkoroi#Sci08',
  'eunicemwangangi8@gmail.com':   'Nkoroi#Hum11',
  'eunicebedinaadegu@gmail.com':  'Nkoroi#Lang10',
  'rebeccamageria@gmail.com':     'Nkoroi#Mat09',
  'mulwanthemba@gmail.com':       'Nkoroi#Sci08',
  'nathannjuguna90@gmail.com':    'Nkoroi#Sci08',
  'bethnjoki1@gmail.com':         'Nkoroi#Store14',
  'wairimu0895@yahoo.com':        'Nkoroi#Acct15',
  'oliviaonyango5@gmail.com':     'Nkoroi#Sci08',
  'atoninyatigo@gmail.com':       'Nkoroi#Sci08',
}

const ROLE_PW: Record<string, string> = {
  dean_of_studies:       'Nkoroi#Dean04',
  dean_of_students:      'Nkoroi#Stud05',
  guidance_counselling:  'Nkoroi#Couns06',
  bursar:                'Nkoroi#Burs07',
  hod_sciences:          'Nkoroi#Sci08',
  hod_mathematics:       'Nkoroi#Mat09',
  hod_languages:         'Nkoroi#Lang10',
  hod_humanities:        'Nkoroi#Hum11',
  hod_applied_sciences:  'Nkoroi#App12',
  storekeeper:           'Nkoroi#Store14',
  accountant:            'Nkoroi#Acct15',
}

function pickPassword(email: string, sub_role: string, full_name: string, idx: number): string {
  const e = email.toLowerCase()
  if (EMAIL_PW[e]) return EMAIL_PW[e]
  if (ROLE_PW[sub_role]) return ROLE_PW[sub_role]
  const first = full_name.split(' ')[0] ?? full_name
  return `Nkoroi#${first}${String(16 + idx).padStart(2, '0')}`
}

interface StaffRow {
  id: string
  full_name: string
  email: string | null
  sub_role: string
  user_id: string | null
  can_login: boolean
}

async function verifyLogin(email: string, password: string): Promise<boolean> {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SKEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const d = await r.json() as { access_token?: string }
  return !!d.access_token
}

async function main() {
  console.log('Fetching staff records…\n')

  const { data: staffData, error: staffErr } = await admin
    .from('staff_records')
    .select('id, full_name, email, sub_role, user_id, can_login')
    .eq('school_id', SCHOOL_ID)
    .eq('is_active', true)

  if (staffErr || !staffData) { console.error('DB error:', staffErr?.message); process.exit(1) }

  const staff = staffData as StaffRow[]
  let ok = 0, fail = 0, skip = 0

  // Alphabetical index for fallback passwords
  const bucket = staff.filter(s => s.email).sort((a, b) => a.full_name.localeCompare(b.full_name))
  const idxMap = new Map(bucket.map((s, i) => [s.id, i]))

  for (const s of staff) {
    if (!s.email) {
      console.log(`  ⚠️  ${s.full_name} — no email, skip`)
      skip++; continue
    }

    const pw = pickPassword(s.email, s.sub_role, s.full_name, idxMap.get(s.id) ?? 0)
    const email = s.email.trim().toLowerCase()

    if (s.user_id) {
      // Existing auth user — reset password via admin API
      const { error } = await admin.auth.admin.updateUserById(s.user_id, {
        password: pw,
        email_confirm: true,
      })
      if (error) {
        console.log(`  ❌ ${s.full_name} (${s.sub_role}) — updateUserById: ${error.message}`)
        fail++; continue
      }
    } else {
      // No auth user — create one
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: pw,
        email_confirm: true,
      })
      if (createErr || !created.user) {
        console.log(`  ❌ ${s.full_name} (${s.sub_role}) — createUser: ${createErr?.message}`)
        fail++; continue
      }

      // Link to staff_records
      await admin.from('staff_records')
        .update({ user_id: created.user.id, can_login: true })
        .eq('id', s.id)
    }

    // Ensure can_login = true
    if (!s.can_login) {
      await admin.from('staff_records').update({ can_login: true }).eq('id', s.id)
    }

    // Verify the login actually works
    const works = await verifyLogin(email, pw)
    if (works) {
      console.log(`  ✅ ${s.full_name} (${s.sub_role}) — password set & verified`)
      ok++
    } else {
      console.log(`  ❌ ${s.full_name} (${s.sub_role}) — password set but verify FAILED`)
      fail++
    }
  }

  console.log(`\n── Result: ${ok} ✅  ${fail} ❌  ${skip} ⚠️  skipped\n`)

  if (fail > 0) {
    console.log('Some passwords failed. Check logs above.')
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
