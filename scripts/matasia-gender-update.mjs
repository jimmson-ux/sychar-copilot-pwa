/**
 * Apply REAL gender from the official PCEA register (Section 3 per-class lists — the
 * internally-consistent source matching the 57M/43F totals). Keyed by admission_no + class_name
 * so the ADM 984 duplicate (Charles Memusi F3 / Doughlas Lekinyotu F4 — both male) resolves
 * exactly. Idempotent. NOT synthetic — sourced from school documents.
 *
 * ⚠️ Two students where the source document contradicted itself (Section 3 vs Section 5):
 *    989 AINEX OTIENO KINUTHIA (F4) → Section 3 = male  (Section 5/notes said female)
 *    934 JOSHUA SAKANA        (F4) → Section 3 = female (Section 5 said male)
 *    992 WAMBUI SAMUEL KARANJA (F4) → female (both sections agree; name-ambiguous)
 *    These follow the per-class register; flip with one update if the school confirms otherwise.
 *
 * Run: node scripts/matasia-gender-update.mjs
 */
import { createClient } from '@supabase/supabase-js'
const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const SID  = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'
const db = createClient(URL, SKEY, { auth: { persistSession: false } })

const REG = {
  'Form 3': {
    male:   [956,963,984,997,1005,1046,981,960,1027,969,978,957,974,985],
    female: [971,1001,966,958,968,962,976,975,964,999,961,965],
  },
  'Form 4': {
    male:   [989,1002,946,1009,984,991,928,1013,1003,1012,1000,945,942,1006,943,1004,936,935,959,982,1007],
    female: [932,983,1011,950,998,947,1010,938,1025,934,1034,1008,939,937,951,970,1016,1015,992],
  },
  'Grade 10': {
    male:   [1032,1020,1057,1048,1058,1047,1017,1045,1031,1040,1029,1019,1024,1042,1035,1038,1030,1036,1053,1056,1039,1033],
    female: [1021,1018,1050,1049,1043,1022,1051,1028,1023,1037,1041,1026],
  },
}

let ok = 0, missing = []
for (const [cls, byGender] of Object.entries(REG)) {
  for (const [gender, adms] of Object.entries(byGender)) {
    for (const adm of adms) {
      const { data, error } = await db.from('students')
        .update({ gender })
        .eq('school_id', SID).eq('class_name', cls).eq('admission_no', String(adm))
        .select('id')
      if (error) { console.log(`ERR ${cls} ${adm}: ${error.message}`); continue }
      if (!data || data.length === 0) missing.push(`${cls}/${adm}`)
      else ok += data.length
    }
  }
}
console.log(`updated rows: ${ok}`)
console.log(`no-match (verify adm/class): ${missing.length ? missing.join(', ') : 'none'}`)

// Verify resulting distribution
const { data: all } = await db.from('students').select('gender, class_name').eq('school_id', SID).eq('is_active', true)
const tally = {}
for (const s of all || []) {
  const k = s.class_name; tally[k] = tally[k] || { male: 0, female: 0, null: 0 }
  tally[k][s.gender ?? 'null']++
}
console.log('post-update by class:', JSON.stringify(tally))
const tot = (all || []).reduce((a, s) => (a[s.gender ?? 'null'] = (a[s.gender ?? 'null'] || 0) + 1, a), {})
console.log('school total:', JSON.stringify(tot))
