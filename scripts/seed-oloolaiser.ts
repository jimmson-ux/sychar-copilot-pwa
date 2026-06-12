/**
 * Seed Oloolaiser High School — boys-only BOARDING national school (4th tenant).
 * Run: npx tsx scripts/seed-oloolaiser.ts
 *
 * Source: official Term 2 2026 class registers, duty rota, CBE combinations, rules PDF.
 * ZERO synthetic data. Teacher roster is NOT yet available — staff are seeded later.
 *
 * Seeds, idempotently (aborts if students already present):
 *   - School config: school_type=boarding, gender_profile=boys, curriculum_mix=fusion,
 *     features (boarding/nurse/gate/QR/strict geofence/biometric), genesis_max_delegates=2
 *   - 25 classes (Grade 10 A–M, Form 4 + Form 3 colour streams)
 *   - 1,283 students (all gender=male); ADM 8909 & 9359 kept as 2 students each (flagged)
 *   - Reference docs: school rules, CBE subject combinations, duty rota (for dashboards + RAG)
 *   - Academic terms mirrored from Nkoroi (Term 2 2026 = current)
 *
 * NOT seeded (pending teacher roster): staff_records, class_teacher assignments,
 * timetable, parent links. Run scripts/enable-genesis-flags.ts afterwards is optional —
 * this script already sets the Genesis flags for Oloolaiser.
 */
import { createClient } from '@supabase/supabase-js'
import { OLOOLAISER_STREAMS, OLOOLAISER_EXPECTED_TOTAL } from './data/oloolaiser-roster'

const SUPABASE_URL = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const NKOROI_ID    = '68bd8d34-f2f0-4297-bd18-093328824d84'

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// Oloolaiser crest — committed to public/branding; served from the school domain.
const LOGO_URL = 'https://oloolaiser.sychar.co.ke/branding/oloolaiser-crest.png'

const FEATURES = {
  boarding_module: true,
  school_nurse: true,
  gate_pass: true,
  dual_deputy: true,
  qr_lesson_attendance: true,
  strict_geofence: true,
  visitor_management: true,
  biometric_gate: true,
}

// ── Reference documents (config, not operational) ────────────────────────────
const SCHOOL_RULES = [
  'All students must respect and obey teachers, non-teaching staff, prefects and those in authority.',
  'Students are completely forbidden from smoking, taking any alcoholic drink or any other drug of addiction.',
  'Students must wear full school uniforms at all times while in school and going to/from home.',
  'Games are compulsory. Every student must register for a sport and be in games uniform during games.',
  'Students should adhere to the school daily routine — be at the right place at the right time.',
  'Fighting, stealing and other anti-social behaviours are completely forbidden (suspension + parent).',
  'Cell phones, pocket radios, flash disks/CD/DVD, bridge games, pads and gambling are not allowed.',
  'Student grievances must be channeled through prefects, class teacher, subject teacher or teacher on duty.',
  'Students must use official languages — Kiswahili and English — at all times.',
  'Students must be in school by 6:50 AM and leave not earlier than 5:00 PM.',
  'Students must not absent themselves without written permission/communication from a parent.',
]

const CBE_COMBINATIONS = {
  pathways: ['Arts and Sports Science', 'Social Sciences', 'STEM'],
  core_subjects: [
    { subject: 'English', lessons: 5 },
    { subject: 'Kiswahili', lessons: 5 },
    { subject: 'Essential/Core Mathematics', lessons: 5 },
    { subject: 'Community Service Learning (CSL)', lessons: 3 },
  ],
  support_subjects: [
    { subject: 'Physical Education', lessons: 3 },
    { subject: 'ICT', lessons: 2 },
    { subject: 'Pastoral/Religious Programme', lessons: 1 },
    { subject: 'Personal/Group Study', lessons: 1 },
  ],
  mathematics_types: ['Core Mathematics', 'Essential Mathematics', 'Advanced Mathematics'],
  selected_combinations: [
    { code: 94, pathway: 'Social Sciences', combination: 'CRE, Business Studies, Advanced Mathematics' },
    { code: 103, pathway: 'Social Sciences', combination: 'CRE, Geography, Advanced Mathematics' },
    { code: 113, pathway: 'Social Sciences', combination: 'CRE, History & Citizenship, Advanced Mathematics' },
    { code: 123, pathway: 'Social Sciences', combination: 'Geography, Business Studies, Advanced Mathematics' },
    { code: 286, pathway: 'STEM Applied', combination: 'Computer Studies, Business Studies, Advanced Mathematics' },
    { code: 308, pathway: 'STEM Pure', combination: 'Advanced Mathematics, Biology, Chemistry' },
    { code: 315, pathway: 'STEM Pure', combination: 'Advanced Mathematics, Biology, Physics' },
    { code: 328, pathway: 'STEM Pure', combination: 'Advanced Mathematics, Chemistry, Physics' },
    { code: 348, pathway: 'STEM Pure', combination: 'Advanced Mathematics, Physics, Geography' },
    { code: 354, pathway: 'STEM Pure', combination: 'Biology, Chemistry, Agriculture' },
    { code: 360, pathway: 'STEM Pure', combination: 'Biology, Chemistry, Geography' },
    { code: 321, pathway: 'STEM Pure', combination: 'Advanced Mathematics, Chemistry, Business Studies' },
  ],
}

const DUTY_ROTA = {
  operational_hours: { day: '06:30-17:30', night: '17:30-06:30' },
  aod_pool: ['MR NDIRANGU', 'MR MAINA', 'MR KIMANI'],
  term2_2026: [
    { week: 1, dates: '26 Apr – 1 May', day: ['MD PERIS MAYAKA', 'MD JOYCE KILWAKE'], night: ['MR MASINDE', 'MR VINCENT OGINGA'] },
    { week: 2, dates: '2 – 8 May', day: ['MD ELIZABETH NDUNG\'U', 'MR NIXON MAGICHO'], night: ['MR NYANDIBA'] },
    { week: 3, dates: '9 – 15 May', day: ['MD JESCA WARAMBO', 'MR VISCOUNT OKARI'], night: ['MR NYABIRA', 'MR BARASA'] },
    { week: 4, dates: '16 – 22 May', day: ['MD MARGARET MURUGI', 'MR VICTOR CHACHA'], night: ['MR JOSH', 'MR DENNIS NJOROGE'] },
    { week: 5, dates: '23 – 29 May', day: ['MD CAROLINE MWANGI', 'MR MICAH WANYONYI', 'MD MAUREEN BWARI'], night: ['MD MUCHA', 'MR EMOJEL'] },
    { week: 6, dates: '30 May – 5 Jun', day: ['MR MORRIS OBWOGE', 'MD MAUREEN NGULALE'], night: ['MD ONKEO', 'MR VICTOR MAENA'] },
    { week: 7, dates: '6 – 12 Jun', day: ['MD JENNIFER KURGAT', 'DR JUDITH AGUTTU'], night: ['MD ONYANGO', 'MR SIMON ONDIEKI'] },
    { week: 8, dates: '13 – 19 Jun', day: ['MR VINCENT BIRISI', 'MD LILAN BUSIENEI'], night: ['MD AGNES', 'MR KURIA'] },
    { week: 9, dates: '20 – 26 Jun', day: ['MR DUNCAN CHERUIYOT', 'MD DORIS NAIYANOI'], night: ['MR NYABIRA', 'MR VISCOUNT OKARI'] },
    { week: 10, dates: '27 Jun – 3 Jul', day: ['MD MARY GORETTI', 'MD METRINE LUGOSE'], night: ['MR MASINDE', 'MR VINCENT OGINGA'] },
    { week: 11, dates: '4 – 10 Jul', day: ['MD FAITH TENIK', 'MD CAREN WESONGA'], night: ['MR NYANDIBA', 'MR BARASA'] },
    { week: 12, dates: '11 – 17 Jul', day: ['MD PAULINE NJOROGE', 'MD BRIDGIT ADHIAMBO'], night: ['MD MAINA', 'MR DENNIS NJOROGE'] },
    { week: 13, dates: '18 – 24 Jul', day: ['MD MARY NGINA', 'MD ESTHER OIGARA'], night: ['MR JOSH', 'MR VICTOR MAENA'] },
    { week: 14, dates: '25 – 31 Jul', day: ['MD DAMARIS KORIR', 'MD AGNES NGIGE'], night: ['MD MUCHA', 'MR EMOJEL'] },
  ],
  term3_2026: [
    { week: 1, dates: '22 – 28 Aug', day: ['MD MICHELLE MANOTI', 'MD PENINNAH KAMAU'], night: ['MD ONKEO', 'MR SIMON ONDIEKI'] },
    { week: 2, dates: '29 Aug – 4 Sept', day: ['MD MARGARET NDUNGU', 'MD BILHA BOR'], night: ['MD ONYANGO', 'MR KURIA'] },
    { week: 3, dates: '5 – 11 Sept', day: ['MR THOMAS KIMANI', 'MR EDWARD KIRANTO'], night: ['MD AGNES', 'MR VISCOUNT OKARI'] },
    { week: 4, dates: '12 – 18 Sept', day: ['MD ANNETTE ORUKO', 'MR BERNARD CHELANG\'A'], night: ['MR NYABIRA', 'MR VINCENT OGINGA'] },
    { week: 5, dates: '19 – 25 Sept', day: ['MD GLADYS NJOGU', 'MD SHAMEEM KIOKO'], night: ['MR MASINDE', 'MR BARASA'] },
    { week: 6, dates: '26 Sept – 2 Oct', day: ['MD ANNE MAKUSTA', 'MD MARY OUMA'], night: ['MR NYANDIBA', 'MR DENNIS NJOROGE'] },
    { week: 7, dates: '3 – 9 Oct', day: ['MR ONYANGO OCHIENG', 'MD CAROLINE MWANGI'], night: ['MD MAINA', 'MR VICTOR MAENA'] },
    { week: 8, dates: '10 – 16 Oct', day: ['MR VICTOR CHACHA', 'MD MARGARET MURUGI'], night: ['MR JOSH', 'MR SIMON ONDIEKI'] },
    { week: 9, dates: '17 – 23 Oct', day: ['MD ELIZABETH NDUNG\'U', 'MR DUNCAN CHERUIYOT'], night: ['MD MUCHA', 'MR EMOJEL'] },
    { week: 10, dates: '24 – 30 Oct', day: ['MD PAULINE NJOROGE', 'MD AGNES NGIGE'], night: ['MD ONKEO', 'MR KURIA'] },
  ],
}

async function resolveSchool(): Promise<{ id: string } | null> {
  const { data } = await db
    .from('schools')
    .select('id, name, subdomain')
    .or('subdomain.eq.oloolaiser,name.ilike.%oloolaiser%')
    .maybeSingle()
  return (data as { id: string } | null) ?? null
}

async function upsertConfig(schoolId: string) {
  // school_metadata (frontend SchoolContext)
  const { data: meta } = await db.from('school_metadata').select('features_enabled, theme').eq('school_id', schoolId).maybeSingle()
  if (meta) {
    const merged = { ...((meta as any).features_enabled ?? {}), ...FEATURES }
    const theme = { ...((meta as any).theme ?? {}), logo_url: LOGO_URL }
    await db.from('school_metadata').update({
      features_enabled: merged,
      theme,
      school_type: 'boarding',
      curriculum_mix: 'fusion',
      gender_profile: 'boys',
    }).eq('school_id', schoolId)
    console.log('  ✓ school_metadata updated (boarding / boys / fusion / features / crest)')
  } else {
    console.log('  ! no school_metadata row — set school_type/features manually after onboarding')
  }

  // tenant_configs (server-side reads + edge functions)
  const { data: tc } = await db.from('tenant_configs').select('features').eq('school_id', schoolId).maybeSingle()
  if (tc) {
    const merged = { ...((tc as any).features ?? {}), ...FEATURES }
    await db.from('tenant_configs').update({
      features: merged,
      gender_profile: 'boys',
      genesis_max_delegates: 2,
      logo_url: LOGO_URL,
    }).eq('school_id', schoolId)
    console.log('  ✓ tenant_configs updated (features / boys / genesis_max_delegates=2)')
  } else {
    console.log('  ! no tenant_configs row — create tenant first, then re-run')
  }
}

async function main() {
  const school = await resolveSchool()
  if (!school) {
    console.error('❌ Oloolaiser school row not found (subdomain "oloolaiser" / name contains "oloolaiser").')
    console.error('   Create the tenant first (admin onboarding), then re-run this script.')
    process.exit(1)
  }
  const SCHOOL_ID = school.id
  console.log(`Oloolaiser school_id = ${SCHOOL_ID}`)

  // Idempotency guard
  const { count: existing } = await db.from('students').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID)
  if ((existing ?? 0) > 0) {
    console.log(`⚠️  ${existing} students already exist for Oloolaiser — aborting to avoid duplicates.`)
    return
  }

  // 1. Config
  console.log('Configuring school...')
  await upsertConfig(SCHOOL_ID)

  // 2. Classes
  console.log('Seeding 25 classes...')
  const classId = new Map<string, string>()
  const { data: haveCls } = await db.from('classes').select('id, name').eq('school_id', SCHOOL_ID)
  for (const c of haveCls ?? []) classId.set((c as any).name, (c as any).id)
  const newCls = OLOOLAISER_STREAMS
    .filter((s) => !classId.has(s.class_name))
    .map((s) => ({
      school_id: SCHOOL_ID,
      name: s.class_name,
      year_group: s.level,
      curriculum_type: s.curriculum,
      academic_year: '2026',
    }))
  if (newCls.length) {
    const { data, error } = await db.from('classes').insert(newCls).select('id, name')
    if (error) throw new Error('classes: ' + error.message)
    for (const c of data ?? []) classId.set((c as any).name, (c as any).id)
  }
  console.log(`  classes: ${classId.size}`)

  // 3. Students (all boys)
  console.log(`Seeding ${OLOOLAISER_EXPECTED_TOTAL} students...`)
  const students = OLOOLAISER_STREAMS.flatMap((s) =>
    s.students.map(([adm, name]) => ({
      school_id: SCHOOL_ID,
      class_id: classId.get(s.class_name)!,
      class_name: s.class_name,
      full_name: name,
      admission_no: adm,
      admission_number: adm,
      gender: 'male',
      form: s.form,
      grade: s.grade,
      pathway: 'Not_Applicable',
      is_active: true,
      is_in_school: false,
    })),
  )
  // admission_no = display (may duplicate, e.g. ADM 8909 / 9359);
  // admission_number = unique key — suffix on collision so both flagged dups survive.
  const seen = new Set<string>()
  for (const s of students) {
    let key = s.admission_number
    let n = 1
    while (seen.has(key)) key = `${s.admission_number}-${++n}`
    seen.add(key)
    s.admission_number = key
  }
  // Insert in chunks (1,283 rows).
  let inserted = 0
  for (let i = 0; i < students.length; i += 200) {
    const chunk = students.slice(i, i + 200)
    const { data, error } = await db.from('students').insert(chunk).select('id')
    if (error) throw new Error(`students chunk ${i}: ${error.message}`)
    inserted += data?.length ?? 0
  }
  console.log(`  inserted ${inserted} students`)

  // 4. Reference docs
  console.log('Seeding reference docs (rules / CBE combinations / duty rota)...')
  const refs = [
    { doc_type: 'school_rules', title: 'School Rules & Regulations', content: { rules: SCHOOL_RULES } },
    { doc_type: 'cbe_combinations', title: 'CBE Subject Combinations', content: CBE_COMBINATIONS },
    { doc_type: 'duty_rota', title: 'Teacher on Duty Rota 2026', content: DUTY_ROTA },
  ]
  for (const r of refs) {
    const { error } = await db.from('school_reference_docs')
      .upsert({ school_id: SCHOOL_ID, ...r }, { onConflict: 'school_id,doc_type' })
    if (error) console.log(`  ⚠️ ${r.doc_type}: ${error.message}`)
    else console.log(`  ✓ ${r.doc_type}`)
  }

  // 5. Academic terms — mirror Nkoroi 2026; current = Term 2.
  console.log('Seeding academic terms...')
  const { count: termCount } = await db.from('academic_terms').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID)
  if ((termCount ?? 0) === 0) {
    const { data: nkTerms } = await db.from('academic_terms')
      .select('name, term_number, academic_year, start_date, end_date').eq('school_id', NKOROI_ID).eq('academic_year', '2026')
    const terms = (nkTerms ?? []).map((t: any) => ({
      school_id: SCHOOL_ID, name: t.name, term_number: t.term_number, academic_year: t.academic_year,
      start_date: t.start_date, end_date: t.end_date, is_current: t.term_number === 2,
    }))
    if (terms.length) {
      const { error } = await db.from('academic_terms').insert(terms)
      if (error) console.log('  ⚠️ terms:', error.message)
      else console.log(`  inserted ${terms.length} terms (current = Term 2 2026)`)
    }
  } else console.log('  terms already present, skipping')

  // Verify
  const { count: finalStu } = await db.from('students').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID)
  console.log(`\n✅ Done. students=${finalStu}, classes=${classId.size}`)
  console.log('   FLAGGED dup ADMs kept as 2 students each: 8909 (G10-E/G10-J), 9359 (G10-C/G10-K).')
  console.log('   PENDING: teacher roster → staff_records, class teachers, timetable, parent links.')
}

main().catch((e) => { console.error(e); process.exit(1) })
