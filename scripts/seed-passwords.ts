/**
 * scripts/seed-passwords.ts
 * Sets Sychar#FirstName@2026 passwords for all Nkoroi staff.
 *
 * Usage:
 *   npx tsx scripts/seed-passwords.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'

require('dotenv').config({ path: '.env.local' })

const SCHOOL_ID = '68bd8d34-f2f0-4297-bd18-093328824d84'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function toFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? fullName.trim()
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

async function seedPasswords() {
  console.log('Fetching Nkoroi staff records…\n')

  const { data: staff, error: staffErr } = await supabase
    .from('staff_records')
    .select('user_id, full_name, email, sub_role')
    .eq('school_id', SCHOOL_ID)
    .eq('is_active', true)

  if (staffErr || !staff) {
    console.error('Failed to fetch staff:', staffErr?.message)
    process.exit(1)
  }

  console.log(`Found ${staff.length} active staff members.\n`)

  let ok = 0, fail = 0, skip = 0

  for (const s of staff) {
    if (!s.user_id) {
      console.warn(`⚠  ${s.full_name ?? s.email} — no user_id, skipping`)
      skip++
      continue
    }

    const firstName = toFirstName(s.full_name ?? s.email ?? 'Staff')
    const password  = `Sychar#${firstName}@2026`

    const { error } = await supabase.auth.admin.updateUserById(s.user_id, { password })
    if (error) {
      console.error(`✗  ${s.full_name} (${s.sub_role}) — ${error.message}`)
      fail++
    } else {
      console.log(`✓  ${s.full_name} (${s.sub_role}) — password: ${password}`)
      ok++
    }
  }

  console.log(`\nDone. ✓ ${ok} updated · ✗ ${fail} failed · ⚠ ${skip} skipped`)
}

seedPasswords()
