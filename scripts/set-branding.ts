/**
 * Ensure all schools have logo + name + motto for document branding.
 * Run: npx tsx scripts/set-branding.ts
 *
 * - Uploads the Oloolaiser crest (public/branding/oloolaiser-crest.png) and the
 *   Nkoroi crest (public/branding/nkoroi-crest.jpg) to the shared school-gallery
 *   bucket and points each tenant_configs.logo_url at it.
 * - Sets mottos: Oloolaiser "Study for Service" (from crest), PCEA "Juhudi Ni Fanaka",
 *   Nkoroi "Service Beyond Self" (from crest). All 3 schools now have logo + name + motto.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const URL = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const NK = '68bd8d34-f2f0-4297-bd18-093328824d84'
const OL = 'd228b049-1185-4bf5-9577-52f7f9c714e9'
const MT = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'

async function main() {
  // 1. Upload Oloolaiser crest → school-gallery/branding/oloolaiser-crest.png
  let oloLogo = 'https://oloolaiser.sychar.co.ke/branding/oloolaiser-crest.png'
  try {
    const buf = readFileSync('public/branding/oloolaiser-crest.png')
    const path = 'branding/oloolaiser-crest.png'
    const up = await db.storage.from('school-gallery').upload(path, buf, { contentType: 'image/png', upsert: true })
    if (up.error) console.log('  ⚠️ crest upload:', up.error.message)
    else {
      const { data } = db.storage.from('school-gallery').getPublicUrl(path)
      oloLogo = data.publicUrl
      console.log('  ✓ crest uploaded →', oloLogo)
    }
  } catch (e) { console.log('  ⚠️ crest read:', (e as Error).message) }

  // 1b. Upload Nkoroi crest → school-gallery/branding/nkoroi-crest.jpg
  let nkLogo: string | null = null
  try {
    const buf = readFileSync('public/branding/nkoroi-crest.jpg')
    const path = 'branding/nkoroi-crest.jpg'
    const up = await db.storage.from('school-gallery').upload(path, buf, { contentType: 'image/jpeg', upsert: true })
    if (up.error) console.log('  ⚠️ nkoroi crest upload:', up.error.message)
    else {
      const { data } = db.storage.from('school-gallery').getPublicUrl(path)
      nkLogo = data.publicUrl
      console.log('  ✓ nkoroi crest uploaded →', nkLogo)
    }
  } catch (e) { console.log('  ⚠️ nkoroi crest read:', (e as Error).message) }

  // 2. Branding per school (motto + logo). name comes from tenant_configs.name (set).
  const updates: Array<[string, string, Record<string, unknown>]> = [
    ['Oloolaiser', OL, { motto: 'Study for Service', logo_url: oloLogo }],
    ['PCEA Upper Matasia', MT, { motto: 'Juhudi Ni Fanaka' }],
    ['Nkoroi', NK, { motto: 'Service Beyond Self', ...(nkLogo ? { logo_url: nkLogo } : {}) }],
  ]
  for (const [label, id, patch] of updates) {
    const { error } = await db.from('tenant_configs').update(patch).eq('school_id', id)
    console.log(error ? `  x ${label}: ${error.message}` : `  ✓ ${label}: ${JSON.stringify(patch).slice(0, 80)}`)
  }

  // 3. Verify
  console.log('\nBranding:')
  for (const [label, id] of [['Nkoroi', NK], ['Oloolaiser', OL], ['Matasia', MT]] as const) {
    const { data } = await db.from('tenant_configs').select('name, motto, logo_url').eq('school_id', id).maybeSingle()
    const d = data as { name: string; motto: string | null; logo_url: string | null } | null
    console.log(`  ${label}: name="${d?.name}" motto="${d?.motto}" logo=${d?.logo_url ? 'set' : 'MISSING'}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
