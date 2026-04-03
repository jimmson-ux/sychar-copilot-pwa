/**
 * scripts/reset-passwords.ts
 * Resets staff passwords using the Supabase Admin API.
 *
 * Usage:
 *   npx ts-node -e "$(cat scripts/reset-passwords.ts)"
 *   — or —
 *   npx tsx scripts/reset-passwords.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'

// Load env vars when running outside Next.js
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const STAFF: Array<{ email: string; password: string; name: string }> = [
  { email: 'rita2thiringi@gmail.com',   password: 'Nkoroi@Rita1',  name: 'Rita (Principal)' },
  { email: 'danielmbugua232@gmail.com', password: 'Nkoroi@Dan2',   name: 'Daniel (Deputy Academic)' },
  { email: 'geraldmogere@gmail.com',    password: 'Nkoroi@Gerry3', name: 'Gerald (Deputy Discipline)' },
  { email: 'otienofelix909@gmail.com',  password: 'Nkoroi@Felix4', name: 'Felix (BOM Teacher)' },
]

async function resetPasswords() {
  console.log('Fetching all auth users...\n')

  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) {
    console.error('Failed to list users:', listError.message)
    process.exit(1)
  }

  const emailToId: Record<string, string> = {}
  for (const u of users) {
    if (u.email) emailToId[u.email.toLowerCase()] = u.id
  }

  for (const staff of STAFF) {
    const userId = emailToId[staff.email.toLowerCase()]
    if (!userId) {
      console.warn(`⚠  ${staff.name} <${staff.email}> — not found in auth.users, skipping`)
      continue
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: staff.password,
    })

    if (error) {
      console.error(`✗  ${staff.name} — ${error.message}`)
    } else {
      console.log(`✓  ${staff.name} — password updated`)
    }
  }

  console.log('\nDone.')
}

resetPasswords()
