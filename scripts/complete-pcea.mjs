/**
 * Complete PCEA Upper Matasia: dean-of-studies flag, subject catalogue (with codes for
 * timetabling) + teacher-subject assignments from the real 12 teaching staff.
 * Run: node scripts/complete-pcea.mjs
 * Service key only; idempotent. Students↔class-teacher already wired via assigned_class_name.
 */
import { createClient } from '@supabase/supabase-js'

const URL = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const MT = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'
const db = createClient(URL, SKEY, { auth: { autoRefreshToken: false, persistSession: false } })

// Subject catalogue (8-4-4 Form 3/4 + carried for Grade 10). code used by timetabling.
// [name, code, department, lessons_per_week, category(enum), is_core]
const SUBJECTS = [
  ['Mathematics', 'MATH', 'Mathematics', 5, 'compulsory', true],
  ['English', 'ENG', 'Languages', 5, 'compulsory', true],
  ['Kiswahili', 'KIS', 'Languages', 5, 'compulsory', true],
  ['Literature', 'LIT', 'Languages', 3, '844_elective', false],
  ['Biology', 'BIO', 'Sciences', 4, 'stem', false],
  ['Chemistry', 'CHEM', 'Sciences', 4, 'stem', false],
  ['Physics', 'PHY', 'Sciences', 4, 'stem', false],
  ['Geography', 'GEO', 'Humanities', 4, 'social_science', false],
  ['History & Government', 'HIST', 'Humanities', 4, 'social_science', false],
  ['CRE', 'CRE', 'Humanities', 3, 'social_science', false],
  ['Agriculture', 'AGRI', 'Technical & Applied', 4, 'technical', false],
  ['Computer Studies', 'COMP', 'Technical & Applied', 3, 'technical', false],
]

// teacher full_name → [subject names they teach] (from the official staff list specializations)
const TEACH = {
  'ALICE WANJIKU NJAU': ['Geography', 'Mathematics'],
  'MOTI ABEL NYAKUNDI': ['CRE', 'Kiswahili'],
  'EVANS NGIGI NJOROGE': ['Kiswahili', 'Geography'],
  'KINOTI DERRICK KITHINJI': ['History & Government', 'CRE', 'Computer Studies'],
  'EVANS OKINDO MOGIRE': ['Biology', 'Chemistry'],
  'KEBATI ALFRED NYAIRO': ['English', 'Literature'],
  'MALABA HARISSON BARAZA': ['Agriculture', 'Biology'],
  'ANN MURUKA MBUGUA': ['CRE', 'Kiswahili'],
  'BRENDA AGINA OMONDI': ['English', 'Literature'],
  'KIRUMBA MOSES KARIU': ['Physics', 'Chemistry'],
  'MILCAH MUTANU MANYALA': ['Mathematics', 'Physics'],
  'ESTHER NUNGA KARIUKI': ['Kiswahili', 'CRE'],
}
const CLASS_LEVELS = ['Form 3', 'Form 4', 'Grade 10']

async function main() {
  // 1. Dean-of-studies flag (PCEA DOES have a dean — Kinoti Derrick Kithinji).
  const { data: tc } = await db.from('tenant_configs').select('features').eq('school_id', MT).maybeSingle()
  const features = { ...(tc?.features ?? {}), has_dean: true }
  await db.from('tenant_configs').update({ features }).eq('school_id', MT)
  console.log('✓ has_dean = true')

  // 2. Subjects (idempotent by name).
  const { data: have } = await db.from('subjects').select('id, name, code').eq('school_id', MT)
  const byName = new Map((have ?? []).map((s) => [s.name, s]))
  const codeId = new Map()
  for (const [name, code, dept, lpw, category, core] of SUBJECTS) {
    if (byName.has(name)) { codeId.set(name, byName.get(name).id); continue }
    const { data, error } = await db.from('subjects').insert({
      school_id: MT, name, code, category,
      curriculum: '844', curriculum_type: 'Both', department: dept,
      lessons_per_week: lpw, is_core: core, is_examinable: true, is_active: true,
      applicable_grades: [3, 4, 10],
    }).select('id').single()
    if (error) { console.log('  ! subject ' + name + ': ' + error.message); continue }
    codeId.set(name, data.id)
  }
  console.log(`✓ subjects: ${codeId.size}/${SUBJECTS.length}`)

  // 3. Teacher-subject assignments (idempotent: clear PCEA then re-insert).
  const { data: staff } = await db.from('staff_records')
    .select('id, full_name, sub_role').eq('school_id', MT).eq('employment_type', 'tsc')
  const staffByName = new Map((staff ?? []).map((s) => [s.full_name, s]))
  const codeFor = new Map(SUBJECTS.map(([name, code]) => [name, code]))
  const deptFor = new Map(SUBJECTS.map(([name, , dept]) => [name, dept]))

  await db.from('teacher_subject_assignments').delete().eq('school_id', MT)
  let n = 0
  for (const [name, subjects] of Object.entries(TEACH)) {
    const t = staffByName.get(name)
    if (!t) { console.log('  ! no staff: ' + name); continue }
    for (const subj of subjects) {
      const { error } = await db.from('teacher_subject_assignments').insert({
        school_id: MT, teacher_id: t.id, subject_name: subj, subject_code: codeFor.get(subj),
        department: deptFor.get(subj), curriculum_type: '844', class_levels: CLASS_LEVELS,
        is_hod_for_this_subject: (t.sub_role || '').startsWith('hod_'),
        is_principal_teaching: t.sub_role === 'principal',
        academic_year: '2026', is_active: true,
      })
      if (error) { console.log('  ! assign ' + name + '/' + subj + ': ' + error.message); continue }
      n++
    }
  }
  console.log(`✓ teacher_subject_assignments: ${n}`)

  // Verify
  const { count: sc } = await db.from('subjects').select('id', { count: 'exact', head: true }).eq('school_id', MT)
  const { count: ac } = await db.from('teacher_subject_assignments').select('id', { count: 'exact', head: true }).eq('school_id', MT)
  console.log(`\n✅ PCEA complete: subjects=${sc}, assignments=${ac}, has_dean=true. Class teachers wired via assigned_class_name (F3/F4/G10).`)
}
main().catch((e) => { console.error(e); process.exit(1) })
