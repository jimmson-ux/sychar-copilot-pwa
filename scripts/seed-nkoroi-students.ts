/**
 * Seed 606 students for Nkoroi Mixed Day Senior Secondary School.
 * Run: npx tsx scripts/seed-nkoroi-students.ts
 *
 * Distribution (606 total):
 *   Grade 10: Winners 51 | Achievers 51 | Victors 50 | Champions 50  = 202
 *   Form 3:   Winners 51 | Achievers 51 | Victors 50 | Champions 50  = 202
 *   Form 4:   Winners 51 | Achievers 51 | Victors 27 | Champions 23  = 152
 *                                                               Total = 606
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const SCHOOL_ID    = '68bd8d34-f2f0-4297-bd18-093328824d84'

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Name pools ────────────────────────────────────────────────────
const BOYS_FIRST = [
  'James','John','Peter','David','Michael','Daniel','Samuel','Joseph','Robert',
  'Paul','Francis','Patrick','Kevin','Brian','Eric','Dennis','Felix','Victor',
  'Martin','Anthony','George','Philip','Simon','Moses','Isaac','Emmanuel',
  'Geoffrey','Lawrence','Timothy','Nicholas','Benjamin','Stephen','Charles',
  'Edward','Henry','Thomas','Richard','William','Andrew','Joshua','Caleb',
  'Nathan','Aaron','Levi','Elijah','Ezekiel','Nehemiah','Gideon','Elisha',
]
const GIRLS_FIRST = [
  'Mary','Grace','Faith','Hope','Joy','Mercy','Esther','Ruth','Lydia','Priscilla',
  'Deborah','Miriam','Hannah','Eunice','Naomi','Rebecca','Rachel','Elizabeth',
  'Susan','Caroline','Catherine','Diana','Vivian','Sharon','Agnes','Alice',
  'Beatrice','Christine','Dorothy','Edna','Florence','Gloria','Irene','Janet',
  'Judith','Karen','Linda','Margaret','Nancy','Patricia','Rose','Sylvia',
  'Teresa','Victoria','Winnie','Yvonne','Zipporah','Charity','Dorcas','Purity',
]
const SURNAMES = [
  // Kikuyu
  'Kamau','Njoroge','Mwangi','Kariuki','Gitau','Wanjiku','Njoki','Wangari',
  'Muigai','Gatheru','Gacheri','Murimi','Muthoni','Ndung\'u',
  // Luo
  'Otieno','Ochieng','Odhiambo','Akinyi','Adhiambo','Awino','Onyango',
  'Omondi','Ogola','Owino','Ochola','Owuor','Mboya','Nyambura',
  // Kalenjin
  'Kibet','Kiplagat','Koech','Rutto','Mutai','Chemutai','Jelimo','Lagat',
  // Kamba
  'Mutuku','Muthama','Mwilu','Nzomo','Ngumbau','Makau','Musyoka','Mutua',
  // Luhya
  'Wanjala','Barasa','Simiyu','Khisa','Wafula','Nafula','Naliaka','Nekesa',
]

// ── Helpers ───────────────────────────────────────────────────────
let rngSeed = 42
function rng(): number {
  rngSeed = (rngSeed * 1664525 + 1013904223) & 0xffffffff
  return (rngSeed >>> 0) / 0xffffffff
}
function pick<T>(arr: T[]): T { return arr[Math.floor(rng() * arr.length)] }
function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}
function randDate(from: string, to: string): string {
  const f = new Date(from).getTime()
  const t = new Date(to).getTime()
  return new Date(f + rng() * (t - f)).toISOString().split('T')[0]
}
function nemisNo(): string {
  let s = ''
  for (let i = 0; i < 12; i++) s += Math.floor(rng() * 10)
  return s
}

// Correct class IDs already in the classes table
const CLASS_IDS: Record<string, string> = {
  'Grade 10 Winners':   'abf4c0ec-4e94-4d4d-943c-77ccd4c4c063',
  'Grade 10 Achievers': 'cae86c29-13ab-4998-acf2-0dc53c1f8140',
  'Grade 10 Victors':   'd58ba8fc-5f0b-49bf-9c38-f97388a42763',
  'Grade 10 Champions': '991b5c5d-0c14-49f9-b8f4-2abbac103585',
  'Form 3 Winners':     'a039c405-e915-4a4b-9729-daac1ce4dfb7',
  'Form 3 Achievers':   '3c108a98-52fd-4c8f-84cc-2b5099eaacb7',
  'Form 3 Victors':     'acf3d426-8572-4675-8993-2ac8bccec767',
  'Form 3 Champions':   '6cb3cac3-c6c2-40a8-a733-25ceaeb7a6fd',
  'Form 4 Winners':     '8f81269f-b9e8-46de-a948-801b1de7e3a9',
  'Form 4 Achievers':   '9e152240-dbaa-48be-a248-d34627667071',
  'Form 4 Victors':     '80e8f27f-d056-4f0d-9a11-3a5d73a5d6dd',
  'Form 4 Champions':   'cab530b9-ecbb-4100-a187-534ac720ff13',
}

interface StudentRow {
  school_id:    string
  full_name:    string
  admission_no: string
  gender:       'male' | 'female'
  class_name:   string
  stream_name:  string
  class_id:     string
  date_of_birth: string
  kcpe_marks:   number | null
  nemis_no:     string
  is_active:    boolean
}

function buildStudents(
  className: string,
  streamName: string,
  count: number,
  admPrefix: string,
  admStart: number,
  dobFrom: string,
  dobTo: string,
  kcpeRange: [number, number] | null,
  boysCount: number,
  classId: string,
): StudentRow[] {
  const rows: StudentRow[] = []
  const names: Array<{ first: string; surname: string; gender: 'male'|'female' }> = []

  // Generate names — boys first, then girls
  for (let i = 0; i < boysCount; i++) {
    names.push({ first: pick(BOYS_FIRST), surname: pick(SURNAMES), gender: 'male' })
  }
  for (let i = boysCount; i < count; i++) {
    names.push({ first: pick(GIRLS_FIRST), surname: pick(SURNAMES), gender: 'female' })
  }
  // Shuffle
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]]
  }

  for (let i = 0; i < count; i++) {
    const n = names[i]
    const seqNo = String(admStart + i).padStart(3, '0')
    rows.push({
      school_id:     SCHOOL_ID,
      full_name:     `${n.first} ${n.surname}`,
      admission_no:  `${admPrefix}/${seqNo}`,
      gender:        n.gender,
      class_name:    className,
      stream_name:   streamName,
      class_id:      classId,
      date_of_birth: randDate(dobFrom, dobTo),
      kcpe_marks:    kcpeRange ? randInt(kcpeRange[0], kcpeRange[1]) : null,
      nemis_no:      nemisNo(),
      is_active:     true,
    })
  }
  return rows
}

// ── Class distribution (606 total: 294 boys, 312 girls) ──────────
// boys ≈ 48%, girls ≈ 52%
const CLASSES: Array<{
  class_name: string; stream_name: string; count: number
  adm_prefix: string; adm_start: number
  dob_from: string; dob_to: string
  kcpe: [number,number] | null; boys: number
}> = [
  // Grade 10 — 202 students, DOB 2008-2010, no KCPE
  { class_name:'Grade 10', stream_name:'Winners',   count:51, adm_prefix:'NMS/2024', adm_start:1,   dob_from:'2008-01-01', dob_to:'2010-12-31', kcpe:null,      boys:25 },
  { class_name:'Grade 10', stream_name:'Achievers', count:51, adm_prefix:'NMS/2024', adm_start:52,  dob_from:'2008-01-01', dob_to:'2010-12-31', kcpe:null,      boys:24 },
  { class_name:'Grade 10', stream_name:'Victors',   count:50, adm_prefix:'NMS/2024', adm_start:103, dob_from:'2008-01-01', dob_to:'2010-12-31', kcpe:null,      boys:24 },
  { class_name:'Grade 10', stream_name:'Champions', count:50, adm_prefix:'NMS/2024', adm_start:153, dob_from:'2008-01-01', dob_to:'2010-12-31', kcpe:null,      boys:24 },
  // Form 3 — 202 students, DOB 2007-2009, KCPE 220-380
  { class_name:'Form 3',   stream_name:'Winners',   count:51, adm_prefix:'NMS/2022', adm_start:1,   dob_from:'2007-01-01', dob_to:'2009-12-31', kcpe:[220,380], boys:25 },
  { class_name:'Form 3',   stream_name:'Achievers', count:51, adm_prefix:'NMS/2022', adm_start:52,  dob_from:'2007-01-01', dob_to:'2009-12-31', kcpe:[220,380], boys:24 },
  { class_name:'Form 3',   stream_name:'Victors',   count:50, adm_prefix:'NMS/2022', adm_start:103, dob_from:'2007-01-01', dob_to:'2009-12-31', kcpe:[220,380], boys:24 },
  { class_name:'Form 3',   stream_name:'Champions', count:50, adm_prefix:'NMS/2022', adm_start:153, dob_from:'2007-01-01', dob_to:'2009-12-31', kcpe:[220,380], boys:24 },
  // Form 4 — 152 students, DOB 2006-2008, KCPE 230-390
  { class_name:'Form 4',   stream_name:'Winners',   count:51, adm_prefix:'NMS/2021', adm_start:1,   dob_from:'2006-01-01', dob_to:'2008-12-31', kcpe:[230,390], boys:25 },
  { class_name:'Form 4',   stream_name:'Achievers', count:51, adm_prefix:'NMS/2021', adm_start:52,  dob_from:'2006-01-01', dob_to:'2008-12-31', kcpe:[230,390], boys:24 },
  { class_name:'Form 4',   stream_name:'Victors',   count:27, adm_prefix:'NMS/2021', adm_start:103, dob_from:'2006-01-01', dob_to:'2008-12-31', kcpe:[230,390], boys:13 },
  { class_name:'Form 4',   stream_name:'Champions', count:23, adm_prefix:'NMS/2021', adm_start:130, dob_from:'2006-01-01', dob_to:'2008-12-31', kcpe:[230,390], boys:11 },
]

async function main() {
  console.log('Building 606 students...')

  const allStudents: StudentRow[] = []
  for (const cls of CLASSES) {
    const classKey = `${cls.class_name} ${cls.stream_name}`
    const classId  = CLASS_IDS[classKey]
    if (!classId) throw new Error(`No class_id for "${classKey}"`)
    const rows = buildStudents(
      cls.class_name, cls.stream_name, cls.count,
      cls.adm_prefix, cls.adm_start,
      cls.dob_from, cls.dob_to,
      cls.kcpe, cls.boys, classId,
    )
    allStudents.push(...rows)
    console.log(`  ${cls.class_name} ${cls.stream_name}: ${rows.length} students`)
  }

  console.log(`\nTotal built: ${allStudents.length}`)
  console.log('Upserting to Supabase (batches of 50)...\n')

  let inserted = 0
  const BATCH = 50
  for (let i = 0; i < allStudents.length; i += BATCH) {
    const batch = allStudents.slice(i, i + BATCH)
    const { error } = await db.from('students').insert(batch)

    if (error) {
      console.error(`Batch ${Math.floor(i/BATCH)+1} error:`, error.message)
    } else {
      inserted += batch.length
      process.stdout.write(`\r  Progress: ${inserted}/${allStudents.length}`)
    }
  }

  console.log('\n\nVerifying counts...')
  const { data: counts } = await db
    .from('students')
    .select('class_name, stream_name')
    .eq('school_id', SCHOOL_ID)
    .eq('is_active', true)

  const tally: Record<string, number> = {}
  for (const s of counts ?? []) {
    const k = `${s.class_name} ${s.stream_name}`
    tally[k] = (tally[k] ?? 0) + 1
  }

  let total = 0
  for (const [cls, cnt] of Object.entries(tally).sort()) {
    console.log(`  ${cls.padEnd(24)} ${cnt}`)
    total += cnt
  }
  console.log(`  ${'TOTAL'.padEnd(24)} ${total}`)

  if (total >= 606) {
    console.log('\n✅ 606 students seeded successfully.')
  } else {
    console.log(`\n⚠️  Only ${total} students found — check for upsert conflicts.`)
  }

  // Now reseed seat maps since students now exist
  console.log('\nTriggering seat map reseed...')
  const { error: seatErr } = await db.rpc('reseed_nkoroi_seats' as never)
  if (seatErr) {
    console.log('ℹ️  Seat map reseed via RPC not available — run the SQL migration manually or push a reseed migration.')
  } else {
    console.log('✅ Seat maps reseeded.')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
