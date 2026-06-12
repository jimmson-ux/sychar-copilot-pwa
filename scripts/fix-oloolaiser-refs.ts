/**
 * Fix residual Oloolaiser config that earlier hit the flapping PostgREST cache:
 *   - school_reference_docs (rules / CBE combinations / duty rota)
 *   - tenant_configs.genesis_max_delegates = 2
 * Cache-tolerant (retries on "schema cache" errors). Idempotent.
 * Run: npx tsx scripts/fix-oloolaiser-refs.ts
 */
import { createClient } from '@supabase/supabase-js'

const URL = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const RULES = [
  'All students must respect and obey teachers, non-teaching staff, prefects and those in authority.',
  'Students are completely forbidden from smoking, alcohol or any drug of addiction.',
  'Students must wear full school uniform at all times to/from and in school.',
  'Games are compulsory; every student must register for a sport and be in games uniform.',
  'Adhere to the school daily routine — be at the right place at the right time.',
  'Fighting, stealing and anti-social behaviour are forbidden (suspension + parent).',
  'Cell phones, radios, flash disks, gambling items are not allowed and will be confiscated.',
  'Channel grievances through prefects, class teacher, subject teacher or teacher on duty.',
  'Use official languages — Kiswahili and English — at all times.',
  'Be in school by 6:50 AM and leave not earlier than 5:00 PM.',
  'No absence without written permission/communication from a parent.',
]
const CBE = {
  pathways: ['Arts and Sports Science', 'Social Sciences', 'STEM'],
  core: ['English (5)', 'Kiswahili (5)', 'Essential/Core Mathematics (5)', 'Community Service Learning (3)'],
  support: ['PE (3)', 'ICT (2)', 'Pastoral/Religious (1)', 'Personal/Group Study (1)'],
  mathematics: ['Core Mathematics', 'Essential Mathematics', 'Advanced Mathematics'],
  total_lessons: 40,
}
const ROTA = { operational_hours: { day: '06:30-17:30', night: '17:30-06:30' }, note: 'Term 2/Term 3 2026 day+night TOD rota on file; staff names captured as reference pending staff import.' }

async function withRetry<T>(label: string, fn: () => Promise<{ error: any } & T>): Promise<boolean> {
  for (let i = 0; i < 8; i++) {
    const { error } = await fn()
    if (!error) { console.log(`  ✓ ${label}`); return true }
    if (!/schema cache|find the (table|column)/.test(error.message)) { console.log(`  x ${label}: ${error.message}`); return false }
    await sleep(3000)
  }
  console.log(`  ! ${label}: cache still unstable after retries`)
  return false
}

async function main() {
  const { data: school } = await db.from('schools').select('id').or('subdomain.eq.oloolaiser,name.ilike.%oloolaiser%').maybeSingle()
  if (!school) { console.error('Oloolaiser not found'); process.exit(1) }
  const id = (school as { id: string }).id
  console.log('Oloolaiser', id)

  console.log('Reference docs:')
  await withRetry('school_rules', () => db.from('school_reference_docs').upsert({ school_id: id, doc_type: 'school_rules', title: 'School Rules & Regulations', content: { rules: RULES } }, { onConflict: 'school_id,doc_type' }) as any)
  await withRetry('cbe_combinations', () => db.from('school_reference_docs').upsert({ school_id: id, doc_type: 'cbe_combinations', title: 'CBE Subject Combinations', content: CBE }, { onConflict: 'school_id,doc_type' }) as any)
  await withRetry('duty_rota', () => db.from('school_reference_docs').upsert({ school_id: id, doc_type: 'duty_rota', title: 'Teacher on Duty Rota 2026', content: ROTA }, { onConflict: 'school_id,doc_type' }) as any)

  console.log('genesis_max_delegates:')
  await withRetry('Oloolaiser genesis_max_delegates=2', () => db.from('tenant_configs').update({ genesis_max_delegates: 2 }).eq('school_id', id) as any)

  // Verify
  const { data: refs } = await db.from('school_reference_docs').select('doc_type').eq('school_id', id)
  const { data: tc } = await db.from('tenant_configs').select('features, genesis_max_delegates, gender_profile').eq('school_id', id).maybeSingle()
  console.log('\nVerify:')
  console.log('  reference_docs:', (refs ?? []).map((r: any) => r.doc_type).join(', ') || 'none')
  console.log('  genesis_max_delegates:', (tc as any)?.genesis_max_delegates)
  console.log('  gender_profile:', (tc as any)?.gender_profile)
  console.log('  features.qr_lesson_attendance:', (tc as any)?.features?.qr_lesson_attendance, '| strict_geofence:', (tc as any)?.features?.strict_geofence, '| school_nurse:', (tc as any)?.features?.school_nurse)
}
main().catch((e) => { console.error(e); process.exit(1) })
