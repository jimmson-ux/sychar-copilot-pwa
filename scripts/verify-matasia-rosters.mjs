/** READ-ONLY: confirm PCEA teacher class rosters resolve correctly (no errors). */
import { createClient } from '@supabase/supabase-js'
const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const SID  = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'
const db = createClient(URL, SKEY, { auth: { persistSession: false } })

for (const cls of ['Form 3', 'Form 4', 'Grade 10']) {
  const { data, error } = await db.from('students')
    .select('full_name, admission_no').eq('school_id', SID).eq('class_name', cls).eq('is_active', true).order('full_name')
  console.log(`${cls}: ${error ? 'ERROR ' + error.message : `${data.length} students — e.g. ${data[0]?.full_name ?? '-'}`}`)
}
const { error: re } = await db.from('store_requisitions').select('id', { count: 'exact', head: true }).eq('school_id', SID)
console.log('store_requisitions queryable:', re ? 'ERROR ' + re.message : 'yes')
const { error: ge } = await db.from('gate_shift_log').select('id', { count: 'exact', head: true }).eq('school_id', SID)
console.log('gate_shift_log present:', ge ? 'ABSENT/ERROR — ' + ge.message : 'yes (migration applied)')
