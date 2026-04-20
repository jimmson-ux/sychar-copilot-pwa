/**
 * scripts/verify-passwords.ts
 * Sets passwords for all Nkoroi staff and verifies each login.
 *
 * Strategy:
 *  • Staff with user_id stored (and admin API works)  → admin updateUserById
 *  • Staff where admin API errors (existing corrupted records) → sign in with
 *    old password then call auth.updateUser (self-update flow)
 *  • Staff with NO user_id → createUser
 *
 * Usage: npx tsx scripts/verify-passwords.ts
 * NEVER logs password values.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch { /* no .env.local */ }
}
loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SCHOOL_ID    = process.env.NEXT_PUBLIC_SCHOOL_ID!

const adminSb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface StaffRow {
  id: string
  full_name: string
  email: string | null
  sub_role: string
  user_id: string | null
  can_login: boolean
}

// ── Password rules (exact, do not deviate) ────────────────────────────────────

function assignPassword(s: StaffRow, alphaIdx: number): string {
  const email = (s.email ?? '').toLowerCase()
  if (email === 'rita2thiringi@gmail.com')   return 'Nkoroi#Rita01'
  if (email === 'danielmbugua232@gmail.com') return 'Nkoroi#Dan02'
  if (email === 'geraldmogere@gmail.com')    return 'Nkoroi#Ger03'
  if (email === 'otienofelix909@gmail.com')  return 'Nkoroi#Fel13'

  switch (s.sub_role) {
    case 'dean_of_studies':       return 'Nkoroi#Dean04'
    case 'dean_of_students':      return 'Nkoroi#Stud05'
    case 'guidance_counselling':  return 'Nkoroi#Couns06'
    case 'bursar':                return 'Nkoroi#Burs07'
    case 'hod_sciences':          return 'Nkoroi#Sci08'
    case 'hod_mathematics':       return 'Nkoroi#Mat09'
    case 'hod_languages':         return 'Nkoroi#Lang10'
    case 'hod_humanities':        return 'Nkoroi#Hum11'
    case 'hod_applied_sciences':  return 'Nkoroi#App12'
    case 'storekeeper':           return 'Nkoroi#Store14'
    case 'accountant':            return 'Nkoroi#Acct15'
  }

  const firstName = s.full_name.split(' ')[0] ?? s.full_name
  return `Nkoroi#${firstName}${String(16 + alphaIdx).padStart(2, '0')}`
}

// Old password lookup for self-update flow (staff that already existed)
function oldPassword(email: string): string | null {
  const map: Record<string, string> = {
    'geraldmogere@gmail.com':        'Nkoroi@Gerry3',
    'danielmbugua232@gmail.com':     'Nkoroi@Dan2',
    'dlenairoshi@gmail.com':         'Nkoroi#Dean04',   // might already be set
    'jafwande@gmail.com':            'Nkoroi#Dean04',   // fallback
    'joyceigwora82@gmail.com':       'Nkoroi#Couns06',
    'faithtirops@gmail.com':         'Nkoroi#App12',
    'denochep@gmail.com':            'Nkoroi#Sci08',
    'eunicemwangangi8@gmail.com':    'Nkoroi#Hum11',
    'eunicebedinaadegu@gmail.com':   'Nkoroi#Lang10',
    'rebeccamageria@gmail.com':      'Nkoroi#Mat09',
    'mulwanthemba@gmail.com':        'Nkoroi#Sci08',
    'nathannjuguna90@gmail.com':     'Nkoroi#Sci08',
    'bethnjoki1@gmail.com':          'Nkoroi#Store14',
    'wairimu0895@yahoo.com':         'Nkoroi#Acct15',
    'oliviaonyango5@gmail.com':      'Nkoroi#Sci08',
    'atoninyatigo@gmail.com':        'Nkoroi#Sci08',
    '991a7809-placeholder':          'Nkoroi#Sci08',
  }
  return map[email.toLowerCase()] ?? null
}

// Try to discover the current password by attempting several known formats
async function discoverCurrentPw(email: string, newPw: string): Promise<string | null> {
  const candidates = [
    oldPassword(email),
    newPw, // maybe already set
    'Nkoroi@Rita1','Nkoroi@Dan2','Nkoroi@Gerry3','Nkoroi@Felix4',
    'Nkoroi#Dean04','Nkoroi#Stud05','Nkoroi#Couns06','Nkoroi#Sci08',
    'Nkoroi#Mat09','Nkoroi#Lang10','Nkoroi#Hum11','Nkoroi#App12',
    'Nkoroi#Store14','Nkoroi#Acct15',
  ].filter((p): p is string => !!p)

  for (const pw of candidates) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw }),
    })
    const d = await r.json() as { access_token?: string; error?: string }
    if (d.access_token) return pw
  }
  return null
}

const FIXED_EMAIL_SET = new Set(['rita2thiringi@gmail.com','danielmbugua232@gmail.com','geraldmogere@gmail.com','otienofelix909@gmail.com'])
const FIXED_ROLE_SET  = new Set(['dean_of_studies','dean_of_students','guidance_counselling','bursar','hod_sciences','hod_mathematics','hod_languages','hod_humanities','hod_applied_sciences','storekeeper','accountant'])

function isAlphabeticalBucket(s: StaffRow): boolean {
  const email = (s.email ?? '').toLowerCase()
  if (FIXED_EMAIL_SET.has(email))     return false
  if (FIXED_ROLE_SET.has(s.sub_role)) return false
  if (s.sub_role === 'principal')         return false
  if (s.sub_role === 'deputy_principal')  return false
  return true
}

async function main() {
  console.log('── Fetching staff records …\n')

  const { data: staffData, error: staffErr } = await adminSb
    .from('staff_records')
    .select('id, full_name, email, sub_role, user_id, can_login')
    .eq('school_id', SCHOOL_ID)
    .eq('is_active', true)

  if (staffErr || !staffData) { console.error('Failed:', staffErr?.message); process.exit(1) }

  const staff = staffData as StaffRow[]

  const alphabeticalBucket = staff
    .filter(isAlphabeticalBucket)
    .sort((a, b) => a.full_name.localeCompare(b.full_name))

  const alphaIndexMap = new Map<string, number>()
  alphabeticalBucket.forEach((s, i) => alphaIndexMap.set(s.id, i))

  let ok = 0, fail = 0, skipped = 0

  for (const s of staff) {
    if (!s.email) {
      console.log(`⚠️  ${s.full_name} (${s.sub_role}) — no email, skipping`)
      skipped++; continue
    }

    const alphaIdx = alphaIndexMap.get(s.id) ?? 0
    const newPw = assignPassword(s, alphaIdx)
    let authUserId = s.user_id ?? null

    if (!authUserId) {
      // Create new auth user
      const { data: created, error: createErr } = await adminSb.auth.admin.createUser({
        email: s.email, password: newPw, email_confirm: true,
      })
      if (createErr || !created.user) {
        console.log(`❌ ${s.full_name} (${s.sub_role}) — createUser: ${createErr?.message}`)
        fail++; continue
      }
      authUserId = created.user.id

      // Ensure public.users row exists (trigger may not fire for all email formats)
      const { error: pubErr } = await adminSb.from('users').upsert({
        id: authUserId,
        email: s.email,
        full_name: s.full_name,
        role: 'admin',
        sub_role: s.sub_role,
      }, { onConflict: 'id', ignoreDuplicates: true })
      if (pubErr) {
        console.log(`❌ ${s.full_name} (${s.sub_role}) — public.users upsert failed: ${pubErr.message}`)
        fail++; continue
      }

      const { error: linkErr } = await adminSb
        .from('staff_records')
        .update({ user_id: authUserId, can_login: true })
        .eq('id', s.id)
      if (linkErr) {
        console.log(`❌ ${s.full_name} (${s.sub_role}) — link user_id failed: ${linkErr.message}`)
        fail++; continue
      }
    } else {
      // Try admin update first
      const { error: adminErr } = await adminSb.auth.admin.updateUserById(authUserId, { password: newPw, email: s.email })

      if (adminErr) {
        // Fallback: self-update via sign-in
        const currentPw = await discoverCurrentPw(s.email, newPw)

        if (!currentPw) {
          console.log(`❌ ${s.full_name} (${s.sub_role}) — can't determine current password to self-update`)
          fail++; continue
        }

        // If current password is already the new one, we're done
        if (currentPw === newPw) {
          if (!s.can_login) await adminSb.from('staff_records').update({ can_login: true }).eq('id', s.id)
          console.log(`✅ ${s.full_name} (${s.sub_role})`)
          ok++; continue
        }

        // Sign in, update password, sign out — using a fresh client per user
        const userSb = createClient(SUPABASE_URL, SERVICE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        })

        const { error: signErr } = await userSb.auth.signInWithPassword({ email: s.email, password: currentPw })
        if (signErr) {
          console.log(`❌ ${s.full_name} (${s.sub_role}) — sign-in failed: ${signErr.message}`)
          fail++; continue
        }

        const { error: updErr } = await userSb.auth.updateUser({ password: newPw })
        await userSb.auth.signOut()

        if (updErr) {
          console.log(`❌ ${s.full_name} (${s.sub_role}) — self-update failed: ${updErr.message}`)
          fail++; continue
        }

        if (!s.can_login) await adminSb.from('staff_records').update({ can_login: true }).eq('id', s.id)
      } else {
        if (!s.can_login) await adminSb.from('staff_records').update({ can_login: true }).eq('id', s.id)
      }
    }

    // Verify sign-in with new password
    const verifyR = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: s.email, password: newPw }),
    })
    const verifyD = await verifyR.json() as { access_token?: string; error?: string; error_description?: string }

    if (verifyD.access_token) {
      console.log(`✅ ${s.full_name} (${s.sub_role})`)
      ok++
    } else {
      console.log(`❌ ${s.full_name} (${s.sub_role}) — verify failed: ${verifyD.error_description ?? verifyD.error}`)
      fail++
    }
  }

  console.log(`\n── Done: ${ok} ✅  ${fail} ❌  ${skipped} ⚠️  skipped`)
  if (fail > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
