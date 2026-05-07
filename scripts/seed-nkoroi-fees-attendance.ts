/**
 * Seed fee balances + attendance records for Nkoroi's 556 students.
 * Run: npx tsx scripts/seed-nkoroi-fees-attendance.ts
 *
 * Fee distribution  : 30% fully paid | 45% partial | 25% unpaid
 * Attendance windows: last 20 weekdays (~4 school weeks), 6% daily absence rate
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const SCHOOL_ID    = '68bd8d34-f2f0-4297-bd18-093328824d84'
const FULL_FEES    = 12000  // KES annual fee

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let rngSeed = 99
function rng(): number {
  rngSeed = (rngSeed * 1664525 + 1013904223) & 0xffffffff
  return (rngSeed >>> 0) / 0xffffffff
}
function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

function lastNWeekdays(n: number): string[] {
  const dates: string[] = []
  const d = new Date('2026-05-07')  // today
  while (dates.length < n) {
    d.setDate(d.getDate() - 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) {
      dates.push(d.toISOString().split('T')[0])
    }
  }
  return dates
}

async function seedFees(students: Array<{ id: string }>) {
  console.log('\n── Fee Balances ──────────────────────────────')

  // Delete existing fee balances for Nkoroi students
  const studentIds = students.map(s => s.id)
  const { error: delErr } = await db
    .from('fee_balances')
    .delete()
    .in('student_id', studentIds)
  if (delErr) console.log('  delete existing:', delErr.message)

  const rows: object[] = []
  for (let i = 0; i < students.length; i++) {
    const sid = students[i].id
    const bucket = rng()

    let total_billed: number
    let total_paid: number

    if (bucket < 0.30) {
      // 30% fully paid
      total_billed = FULL_FEES
      total_paid   = FULL_FEES
    } else if (bucket < 0.75) {
      // 45% partially paid (between 25% and 75% of fees)
      total_billed = FULL_FEES
      total_paid   = randInt(Math.floor(FULL_FEES * 0.25), Math.floor(FULL_FEES * 0.75))
    } else {
      // 25% unpaid
      total_billed = FULL_FEES
      total_paid   = 0
    }

    rows.push({
      student_id:    sid,
      total_billed,
      total_paid,
      balance_due:   Math.max(0, total_billed - total_paid),
      academic_year: '2026/2027',
    })
  }

  let inserted = 0
  const BATCH = 100
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from('fee_balances').insert(rows.slice(i, i + BATCH))
    if (error) {
      console.error(`  batch ${Math.floor(i / BATCH) + 1} error:`, error.message)
    } else {
      inserted += Math.min(BATCH, rows.length - i)
      process.stdout.write(`\r  Progress: ${inserted}/${rows.length}`)
    }
  }
  console.log(`\n  ✓ ${inserted} fee balance rows inserted`)

  // Quick summary
  const paid   = rows.filter((r: any) => r.balance_due === 0).length
  const partial = rows.filter((r: any) => r.balance_due > 0 && r.total_paid > 0).length
  const unpaid  = rows.filter((r: any) => r.total_paid === 0).length
  console.log(`  Fully paid: ${paid} | Partial: ${partial} | Unpaid: ${unpaid}`)
}

async function seedAttendance(students: Array<{ id: string; class_name: string; stream_name: string }>) {
  console.log('\n── Attendance Records (last 20 weekdays) ────')

  const dates = lastNWeekdays(20)
  console.log(`  Dates: ${dates[dates.length - 1]} → ${dates[0]}`)
  console.log(`  Students: ${students.length} | Dates: ${dates.length} | Expected rows: ~${students.length * dates.length}`)

  // Delete old attendance records for these students (TEXT student_id)
  const studentIds = students.map(s => s.id)
  // attendance_records student_id is TEXT — delete by school_id + date range
  const { error: delErr } = await db
    .from('attendance_records')
    .delete()
    .eq('school_id', SCHOOL_ID)
    .gte('date', dates[dates.length - 1])
    .lte('date', dates[0])
  if (delErr) console.log('  delete existing:', delErr.message)

  const rows: object[] = []
  for (const date of dates) {
    for (const s of students) {
      const absent = rng() < 0.06   // 6% absence
      const late   = !absent && rng() < 0.04  // 4% of present are late
      rows.push({
        school_id:    SCHOOL_ID,
        teacher_id:   'SYSTEM',
        class_name:   s.class_name,
        subject:      null,
        date,
        student_id:   s.id,           // TEXT column — UUID string still valid
        student_name: null,
        status:       absent ? 'absent' : late ? 'late' : 'present',
      })
    }
  }

  let inserted = 0
  const BATCH = 200
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from('attendance_records').insert(rows.slice(i, i + BATCH))
    if (error) {
      console.error(`  batch ${Math.floor(i / BATCH) + 1} error:`, error.message.substring(0, 100))
    } else {
      inserted += Math.min(BATCH, rows.length - i)
      process.stdout.write(`\r  Progress: ${inserted}/${rows.length}`)
    }
  }
  console.log(`\n  ✓ ${inserted} attendance rows inserted`)

  const absent = rows.filter((r: any) => r.status === 'absent').length
  console.log(`  Absent: ${absent} (${((absent / rows.length) * 100).toFixed(1)}%) | Present/Late: ${rows.length - absent}`)
}

async function main() {
  console.log('Fetching 556 students...')
  const { data: students, error } = await db
    .from('students')
    .select('id,class_name,stream_name')
    .eq('school_id', SCHOOL_ID)
    .eq('is_active', true)
    .order('class_name')
    .order('stream_name')

  if (error || !students?.length) {
    console.error('Failed to load students:', error?.message ?? 'no data')
    process.exit(1)
  }
  console.log(`Loaded ${students.length} students`)

  await seedFees(students)
  await seedAttendance(students)

  console.log('\n✅ Done. Fee balances + attendance records seeded for Nkoroi.')
}

main().catch(e => { console.error(e); process.exit(1) })
