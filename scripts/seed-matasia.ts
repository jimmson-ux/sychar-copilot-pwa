/**
 * Seed PCEA Upper Matasia Senior Secondary School (3rd tenant).
 * Run: npx tsx scripts/seed-matasia.ts
 *
 * Source: official school bio-data (STAFF_DAT / NON_TEACHING_STAFF / class lists).
 * NO synthetic data — every student/staff row is from the documents. Fields not in the
 * source (gender, guardian phones, DOB, KCPE) are left NULL for the school to fill later.
 *
 * Seeds, idempotently (aborts if students already present):
 *   - 3 classes: Form 3 (844), Form 4 (844), Grade 10 (CBE) — single stream each
 *   - 100 students (F3=26, F4=40, G10=34); ADM 984 kept as TWO distinct students
 *   - 16 staff (12 teaching + 4 support) with sub_role + secondary_roles
 *   - class_teacher_id wired on each class
 *   - academic_terms mirrored from Nkoroi (Term 2 2026 = current); tenant current_term set
 *
 * Parent↔student links are NOT seeded — guardian phones are not in the source. Collect
 * phones, then run /api/admin/seed-parent-links and flip require_parent_phone=true.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const SCHOOL_ID    = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'
const NKOROI_ID    = '68bd8d34-f2f0-4297-bd18-093328824d84'

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// ── Classes (single stream each) ──────────────────────────────────
const CLASSES = [
  { name: 'Form 3',   year_group: 'Form 3',   curriculum_type: '844' },
  { name: 'Form 4',   year_group: 'Form 4',   curriculum_type: '844' },
  { name: 'Grade 10', year_group: 'Grade 10', curriculum_type: 'CBE' },
]

// ── Students (admission_no, full_name) per class, verbatim from class lists ──
const FORM3: Array<[string, string]> = [
  ['956','BRIAN LEMAIYAN SANTAMO'],['957','PETER SITONIK MUTUNKEI'],['958','EUNICE WANJA KARIUKI'],
  ['960','ISAIAH MATURETI ISABOKE'],['961','SHELLY KEMUNTO AOSA'],['962','HELLEN MERESO LANKISA'],
  ['963','BRIAN ANDAYI AMAKOBE'],['964','SHARON KAVINDU WAITA'],['965','SYLIVIA NAMYAK'],
  ['966','EMMACULATE NASIMOI'],['968','GRACE NAISIMOI PARSALIA'],['969','MWANGI JOSEPH NJOGU'],
  ['971','CATHERINE WANJIRU KIBUTHA'],['974','SAMUEL OTIENO'],['975','PURITY NAISOI'],
  ['976','MARRIAM ABUBAKAR'],['978','NOAH MOITALEL'],['981','ISAAC MITEKAI'],
  ['984','CHARLES MEMUSI'],['985','TIMOTHY SIRONKA'],['997','EDWIN NGEMI'],['999','SHEILA BOSIBORI'],
  ['1001','DEBORAH M BOSIRE'],['1005','ELIJAH MUREGA'],['1027','LEWIS CHEGE'],['1046','GEORGE JOMO'],
]
const FORM4: Array<[string, string]> = [
  ['928','ISAIAH NTUYUTO MELENTA'],['932','CHRISTINE NAMUNYAK'],['934','JOSHUA SAKANA'],
  ['935','SOLOMON SELIAN'],['936','SIMON MUKUNDI'],['937','REBECCA SIMANTOI'],['938','NAOMI NAISOLA'],
  ['939','QUEEN KALECHE'],['942','MICHAEL LUYALI'],['943','SAUL NAKITALE'],['945','LEONARD NTETE'],
  ['946','BENJAMIN MWANGI'],['947','JACKLINE NAISOI'],['950','ELIZABETH SETEYIAN'],
  ['951','ROS AKUYOYI AMAKOMBE'],['959',"STEPHEN SANE THIONG'O"],['970','ROSE SOINTA'],
  ['982','TED MAGARA'],['983','CYNTHIA THUKU'],['984','DOUGHLAS LEKINYOTU'],['989','AINEX OTIENO KINUTHIA'],
  ['991','FRANCIS MULU'],['992','WAMBUI SAMUEL KARANJA'],['998','FAITH GESARE'],['1000','JOSEPH MATINKOE'],
  ['1002','BARAKA ANDOLE'],['1003','JOHN NDUNGU'],['1004','SHAWN W KOKAI'],['1006','RAMS MUHIA'],
  ['1007','VINCENT LIKIMANI'],['1008','PRECIOUS WAMBUI'],['1009','DANIEL KINGOO'],['1010','MARION NJERI'],
  ['1011','DAMARIS WANJIRU'],['1012','JOHN KARANJA'],['1013','JAMES MAINA KABINA'],['1015','VIVIAN NYOKABI'],
  ['1016','ROSE WAITHERA'],['1025','JOYCE WANJIKU'],['1034','JUDY MWANTA'],
]
const GRADE10: Array<[string, string]> = [
  ['1017',"DENNIS NG'ANGA"],['1018','ABIGAEL WANGARI'],['1019','LAWRENCE KAMAU'],
  ['1020','BONFACE KOIKAI SHUMARI'],['1021','ABIGAEL MUTHONI'],['1022','HAZEL WAMBUI'],
  ['1023','MARGARET WANJERI'],['1024','LAWRENCE WACHIRA'],['1026','SUSAN WACHEKE'],
  ['1028','LINET WAITHERA'],['1029','JUMA WOYIE'],['1030','PETER GATACHI'],['1031','JACKTONE OTIENO'],
  ['1032','ANTONY MEMUSI'],['1033','BREVIN SHAKAVA'],['1035','MATUNKE TEEKA'],['1036','PETER WAINAINA'],
  ['1037','MARTHA WAIRIMU'],['1038','MICHAEL KIMANI'],['1039','STEPHEN RAILA'],['1040','JAMES IMBALI'],
  ['1041','MARY NYAKIO'],['1042','MASENA KARIMI'],['1043','ELIZABETH NDUNGE'],['1045','ERICK MOISARI'],
  ['1047','DAVIS MBAHA'],['1048','DANCAN GITAU'],['1049','CHRISTABEL KHALENYA'],['1050','ANNE LASOI'],
  ['1051','JOAN MACHARIA'],['1053','PETER W KABIRA'],['1056','SAMUEL NAMUNTE'],['1057','CALEB KANITHI'],
  ['1058','DANSON CHEGE'],
]

// ── Staff. sub_role is authoritative; secondary_roles carry documented dual roles. ──
type Staff = {
  full_name: string; sub_role: string; secondary_roles?: string[]
  tsc_number?: string; national_id?: string; phone?: string; email?: string
  department?: string; subjects?: string[]; assigned_class?: string
  employment_type: string; can_login: boolean; push_recipient: boolean
  note?: string
}
const TEACHING: Staff[] = [
  { full_name:'ALICE WANJIKU NJAU', sub_role:'principal', tsc_number:'347894', national_id:'10975251', phone:'0723227341', department:'Administration', subjects:['Geography','Mathematics'], employment_type:'tsc', can_login:true, push_recipient:true },
  { full_name:'MOTI ABEL NYAKUNDI', sub_role:'deputy_principal_admin', secondary_roles:['bursar','storekeeper','subject_teacher'], tsc_number:'297555', national_id:'10019455', phone:'0725170356', department:'Administration', subjects:['CRE','Kiswahili'], employment_type:'tsc', can_login:true, push_recipient:true, note:'Understaffed school: deputy also = bursar + storekeeper + subject teacher (multi-role)' },
  { full_name:'EVANS NGIGI NJOROGE', sub_role:'dean_of_students', secondary_roles:['guidance_counselling'], tsc_number:'423769', national_id:'13395122', phone:'0726690063', department:'Humanities', subjects:['Kiswahili','Geography'], employment_type:'tsc', can_login:true, push_recipient:true, note:'Senior Master, G&C' },
  { full_name:'KINOTI DERRICK KITHINJI', sub_role:'dean_of_studies', tsc_number:'520148', national_id:'24575340', phone:'0725470310', email:'Kderic7@gmail.com', department:'Humanities', subjects:['History','CRE','ICT'], employment_type:'tsc', can_login:true, push_recipient:true, note:'Dean of Studies, ICT admin' },
  { full_name:'EVANS OKINDO MOGIRE', sub_role:'hod_sciences', secondary_roles:['class_teacher'], tsc_number:'556735', national_id:'24958794', phone:'0716792492', department:'Sciences', subjects:['Biology','Chemistry'], assigned_class:'Form 3', employment_type:'tsc', can_login:true, push_recipient:true, note:'HOD Sciences + Form 3 class teacher' },
  { full_name:'KEBATI ALFRED NYAIRO', sub_role:'teacher', tsc_number:'510571', national_id:'23938802', phone:'0723668502', department:'Languages', subjects:['English','Literature'], employment_type:'tsc', can_login:true, push_recipient:true, note:'Scouts patron' },
  { full_name:'MALABA HARISSON BARAZA', sub_role:'hod_applied_sciences', tsc_number:'649347', national_id:'13719108', phone:'0702004725', department:'Technical', subjects:['Agriculture','Biology'], employment_type:'tsc', can_login:true, push_recipient:true, note:'HOD Technicals' },
  { full_name:'ANN MURUKA MBUGUA', sub_role:'hod_humanities', secondary_roles:['guidance_counselling'], tsc_number:'603171', national_id:'25794529', phone:'0724260714', department:'Humanities', subjects:['CRE','Kiswahili'], employment_type:'tsc', can_login:true, push_recipient:true, note:'HOD Humanities, G&C' },
  { full_name:'BRENDA AGINA OMONDI', sub_role:'hod_languages', tsc_number:'602770', national_id:'27646531', phone:'0715261046', department:'Languages', subjects:['English','Literature'], employment_type:'tsc', can_login:true, push_recipient:true, note:'HOD Languages, Welfare' },
  { full_name:'KIRUMBA MOSES KARIU', sub_role:'class_teacher', tsc_number:'865407', national_id:'29802235', phone:'0717391902', department:'Sciences', subjects:['Physics','Chemistry'], assigned_class:'Form 4', employment_type:'tsc', can_login:true, push_recipient:true, note:'Form 4 class teacher, Clubs & Societies' },
  { full_name:'MILCAH MUTANU MANYALA', sub_role:'qaso', tsc_number:'724615', national_id:'30120047', phone:'0704844510', department:'Sciences', subjects:['Mathematics','Physics'], employment_type:'tsc', can_login:true, push_recipient:true, note:'Exams Officer, Asst Dean of Studies' },
  { full_name:'ESTHER NUNGA KARIUKI', sub_role:'class_teacher', tsc_number:'638145', national_id:'2519125', phone:'0728631382', department:'Languages', subjects:['Kiswahili','CRE'], assigned_class:'Grade 10', employment_type:'tsc', can_login:true, push_recipient:true, note:'Grade 10 class teacher' },
]
const SUPPORT: Staff[] = [
  { full_name:'LINET ANGAJU AMBWAYA', sub_role:'gate_guard', national_id:'26022191', phone:'0725525243', department:'Support', employment_type:'bom', can_login:false, push_recipient:false },
  { full_name:'LUCY WANGARI', sub_role:'cook', national_id:'28830452', phone:'0718082654', department:'Support', employment_type:'bom', can_login:false, push_recipient:false },
  { full_name:'MARK WACHIYE KISEKEL', sub_role:'groundsman', national_id:'13716914', phone:'0710930454', department:'Support', employment_type:'bom', can_login:false, push_recipient:false },
  { full_name:'DAVID MBARANI', sub_role:'night_guard', department:'Support', employment_type:'bom', can_login:false, push_recipient:false, note:'No ID/contact in source' },
]
const CLASS_TEACHERS: Record<string, string> = {
  'Form 3': 'EVANS OKINDO MOGIRE',
  'Form 4': 'KIRUMBA MOSES KARIU',
  'Grade 10': 'ESTHER NUNGA KARIUKI',
}

async function main() {
  // Safety: idempotency guard.
  const { count: existing } = await db.from('students').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID)
  if ((existing ?? 0) > 0) {
    console.log(`⚠️  ${existing} students already exist for PCEA Matasia — aborting to avoid duplicates.`)
    console.log('   Delete them first if you intend to re-seed.')
    return
  }

  // 1. Classes
  console.log('Seeding classes...')
  const classId = new Map<string, string>()
  const { data: haveCls } = await db.from('classes').select('id, name').eq('school_id', SCHOOL_ID)
  for (const c of haveCls ?? []) classId.set((c as any).name, (c as any).id)
  const newCls = CLASSES.filter((c) => !classId.has(c.name))
  if (newCls.length) {
    const { data, error } = await db.from('classes')
      .insert(newCls.map((c) => ({ school_id: SCHOOL_ID, name: c.name, year_group: c.year_group, curriculum_type: c.curriculum_type, academic_year: '2026' })))
      .select('id, name')
    if (error) throw new Error('classes: ' + error.message)
    for (const c of data ?? []) classId.set((c as any).name, (c as any).id)
  }
  console.log('  classes:', [...classId.keys()].join(', '))

  // 2. Students
  console.log('Seeding 100 students...')
  const buildStu = (rows: Array<[string, string]>, className: string, form: number | null, grade: number | null) =>
    rows.map(([adm, name]) => ({
      school_id: SCHOOL_ID,
      class_id: classId.get(className)!,
      class_name: className,
      full_name: name,
      admission_no: adm,
      admission_number: adm,
      form,
      grade,
      pathway: 'Not_Applicable',
      is_active: true,
      is_in_school: false,
    }))
  const students = [
    ...buildStu(FORM3, 'Form 3', 3, null),
    ...buildStu(FORM4, 'Form 4', 4, null),
    ...buildStu(GRADE10, 'Grade 10', null, 10),
  ]
  // admission_no = display (may duplicate, e.g. ADM 984); admission_number = unique key.
  // Suffix admission_number on collision so the flagged duplicate survives as 2 students.
  const seen = new Set<string>()
  for (const s of students) {
    let key = s.admission_number
    let n = 1
    while (seen.has(key)) key = `${s.admission_number}-${++n}`
    seen.add(key)
    s.admission_number = key
  }
  const { data: stuIns, error: stuErr } = await db.from('students').insert(students).select('id')
  if (stuErr) throw new Error('students: ' + stuErr.message)
  console.log(`  inserted ${stuIns?.length} students (F3=${FORM3.length}, F4=${FORM4.length}, G10=${GRADE10.length})`)

  // 3. Staff
  console.log('Seeding 16 staff...')
  const staffRow = (s: Staff) => ({
    school_id: SCHOOL_ID,
    full_name: s.full_name,
    sub_role: s.sub_role,
    secondary_roles: s.secondary_roles ?? null,
    tsc_number: s.tsc_number ?? null,
    national_id: s.national_id ?? null,
    phone: s.phone ?? null,
    email: s.email ?? null,
    department: s.department ?? null,
    departments: s.department ? [s.department] : [],
    subject_specialization: s.subjects ?? [],
    teacher_subjects: s.subjects ?? [],
    assigned_class: s.assigned_class ?? null,
    assigned_class_name: s.assigned_class ?? null,
    employment_type: s.employment_type,
    is_active: true,
    can_login: s.can_login,
    force_password_change: s.can_login,
    push_recipient: s.push_recipient,
  })
  const allStaff = [...TEACHING, ...SUPPORT]
  const { data: staffIns, error: staffErr } = await db.from('staff_records').insert(allStaff.map(staffRow)).select('id, full_name')
  if (staffErr) throw new Error('staff: ' + staffErr.message)
  console.log(`  inserted ${staffIns?.length} staff (teaching=${TEACHING.length}, support=${SUPPORT.length})`)
  const staffId = new Map<string, string>()
  for (const s of staffIns ?? []) staffId.set((s as any).full_name, (s as any).id)

  // 4. Wire class teachers. NOTE: classes.class_teacher_id has a FK that staff_records.id
  // does NOT satisfy (Nkoroi leaves it null too) — the platform resolves class teachers via
  // staff_records.assigned_class / assigned_class_id, so we set those.
  console.log('Wiring class teachers (via assigned_class_id)...')
  for (const [cname, tname] of Object.entries(CLASS_TEACHERS)) {
    const cid = classId.get(cname); const tid = staffId.get(tname)
    if (!cid || !tid) { console.log(`  ⚠️ skip ${cname} -> ${tname} (missing id)`); continue }
    const { error } = await db.from('staff_records').update({ assigned_class_id: cid }).eq('id', tid)
    console.log(`  ${cname} -> ${tname}${error ? ' ERR ' + error.message : ''}`)
  }

  // 5. Academic terms — mirror Nkoroi's calendar; set current = Term 2 2026.
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
    } else {
      console.log('  ⚠️ no Nkoroi 2026 terms to mirror — seed terms manually')
    }
  } else console.log('  terms already present, skipping')

  // 6. tenant_configs current term/year
  const { data: tc } = await db.from('tenant_configs').select('settings').eq('school_id', SCHOOL_ID).maybeSingle()
  if (tc) {
    const settings = { ...(tc as any).settings, current_term: 2, current_year: 2026 }
    await db.from('tenant_configs').update({ settings }).eq('school_id', SCHOOL_ID)
    console.log('  tenant_configs current_term=2 current_year=2026')
  }

  // Verify
  const { count: finalStu } = await db.from('students').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID)
  const { count: finalStaff } = await db.from('staff_records').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID)
  console.log(`\n✅ Done. students=${finalStu}, staff=${finalStaff}, classes=${classId.size}`)
  console.log('   ADM 984 intentionally kept as 2 students (Doughlas Lekinyotu F4 / Charles Memusi F3).')
  console.log('   PENDING: guardian phones → parent_student_links → flip require_parent_phone=true.')
}

main().catch((e) => { console.error(e); process.exit(1) })
