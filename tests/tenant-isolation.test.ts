/**
 * Multi-tenant isolation test (the highest-leverage regression guard).
 *
 * Seeds TWO schools in a DISPOSABLE database, signs in as a staff user of
 * school A (real `authenticated` JWT, anon key), and asserts that A cannot read
 * ANY of school B's sensitive rows. A single mis-scoped RLS policy (like the
 * `service_all_* TO public` leak we fixed) makes one of these assertions fail.
 *
 * Run against a Supabase preview branch or a dedicated staging project — NEVER
 * production. Configure via env:
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY
 * If unset, the suite skips (so CI stays green until a staging DB is wired).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL  = process.env.TEST_SUPABASE_URL
const ANON = process.env.TEST_SUPABASE_ANON_KEY
const SVC  = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY

// Safety: never run against the production project.
if (URL && /xwgtsldimlrhtgvpnjnd/.test(URL)) {
  throw new Error('Refusing to run the tenant-isolation test against the production database.')
}

const ready = Boolean(URL && ANON && SVC)
const suite = ready ? describe : describe.skip

// Tables/views that must NEVER leak across schools.
const SENSITIVE_TABLES = [
  'students', 'marks', 'fee_records', 'fee_structure_items',
  'staff_records', 'discipline_records', 'document_embeddings',
] as const

suite('tenant isolation (school A cannot read school B)', () => {
  let admin: SupabaseClient
  let aStaff: SupabaseClient // anon key, signed in as school A principal
  let schoolA = ''
  let schoolB = ''
  const created: { userIds: string[]; schools: string[] } = { userIds: [], schools: [] }
  const pw = 'Test!' + Math.random().toString(36).slice(2) + 'A9'

  async function provisionSchool(tag: string) {
    const email = `iso_${tag}_${Date.now()}@example.test`
    const { data: u, error: ue } = await admin.auth.admin.createUser({
      email, password: pw, email_confirm: true, user_metadata: { full_name: `ISO ${tag}` },
    })
    if (ue || !u.user) throw ue ?? new Error('createUser failed')
    created.userIds.push(u.user.id)
    const { data: schoolId, error: re } = await admin.rpc('register_school', {
      p_school_name: `ISO Test ${tag} ${Date.now()}`,
      p_county: 'Nairobi',
      p_admin_user_id: u.user.id,
      p_admin_name: `ISO ${tag}`,
      p_admin_email: email,
      p_admin_role: 'principal',
    })
    if (re || !schoolId) throw re ?? new Error('register_school failed')
    created.schools.push(schoolId as string)
    return { schoolId: schoolId as string, email }
  }

  beforeAll(async () => {
    admin = createClient(URL!, SVC!, { auth: { persistSession: false } })

    const a = await provisionSchool('A')
    const b = await provisionSchool('B')
    schoolA = a.schoolId
    schoolB = b.schoolId

    // Seed a student + fee_record in school B so a leak would be observable.
    const { data: stu } = await admin.from('students')
      .insert({ school_id: schoolB, full_name: 'B Student', admission_no: `B-${Date.now()}` })
      .select('id').single()
    if (stu?.id) {
      await admin.from('fee_records').insert({ school_id: schoolB, student_id: stu.id, amount: 1000 })
    }

    // Sign in as school A's principal on an ANON-key client -> authenticated role.
    aStaff = createClient(URL!, ANON!, { auth: { persistSession: false } })
    const { error: se } = await aStaff.auth.signInWithPassword({ email: a.email, password: pw })
    expect(se, 'school A principal sign-in').toBeNull()
  })

  afterAll(async () => {
    if (!admin) return
    // Best-effort cleanup (disposable DB).
    for (const s of created.schools) {
      for (const t of ['fee_records', 'students', 'staff_records']) {
        await admin.from(t).delete().eq('school_id', s)
      }
      await admin.from('schools').delete().eq('id', s)
    }
    for (const id of created.userIds) await admin.auth.admin.deleteUser(id).catch(() => {})
  })

  for (const table of SENSITIVE_TABLES) {
    it(`${table}: school A sees 0 of school B's rows`, async () => {
      const { data, error } = await aStaff.from(table).select('*').eq('school_id', schoolB)
      // RLS should scope to school A, so a query for B's rows returns nothing.
      expect(error, `${table} query error`).toBeNull()
      expect(data ?? [], `${table} leaked ${data?.length} of school B's rows to school A`).toHaveLength(0)
    })
  }

  it('students: school A self-read returns no school-B rows', async () => {
    const { data } = await aStaff.from('students').select('school_id')
    const leaked = (data ?? []).filter((r: { school_id: string }) => r.school_id === schoolB)
    expect(leaked, 'school A unfiltered read leaked school B students').toHaveLength(0)
  })
})
