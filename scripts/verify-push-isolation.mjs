/** READ-ONLY: verify parent↔staff push wiring + isolation for Nkoroi AND PCEA. */
import { createClient } from '@supabase/supabase-js'
const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const db = createClient(URL, SKEY, { auth: { persistSession: false } })
const PCEA = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'
const NKOROI = '68bd8d34-f2f0-4297-bd18-093328824d84'
const NOTIFIABLE = ['principal','deputy_principal','deputy_principal_academic','deputy_principal_admin']

const openapi = await fetch(`${URL}/rest/v1/`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } }).then(r => r.json())
console.log('push_subscriptions cols:', Object.keys(openapi.definitions?.push_subscriptions?.properties || {}).join(', '))

async function n(q){ try { return (await q).count ?? 0 } catch(e){ return 'ERR:'+e.message } }
for (const [name, sid] of [['NKOROI', NKOROI], ['PCEA', PCEA]]) {
  const parentSubs = await n(db.from('push_subscriptions').select('id',{count:'exact',head:true}).eq('school_id', sid))
  const staffSubs  = await n(db.from('push_subscriptions').select('id',{count:'exact',head:true}).not('staff_id','is',null).eq('school_id', sid))
  const convs      = await n(db.from('conversations').select('id',{count:'exact',head:true}).eq('school_id', sid))
  const { data: admins } = await db.from('staff_records').select('full_name,sub_role').eq('school_id', sid).in('sub_role', NOTIFIABLE).eq('is_active', true)
  console.log(`\n[${name}] parent push_subs=${parentSubs}  staff push_subs(school)=${staffSubs}  conversations=${convs}`)
  console.log(`  notifiable staff (${(admins||[]).length}): ${(admins||[]).map(a=>a.sub_role).join(', ')||'none'}`)
}

// Cross-school leakage: any push_subscription whose student_ids point to a student in another school?
const { data: subs } = await db.from('push_subscriptions').select('school_id, student_ids').not('student_ids','is',null).limit(2000)
let leak = 0, checked = 0
for (const s of subs || []) {
  for (const sidu of (s.student_ids||[])) {
    const { data: stu } = await db.from('students').select('school_id').eq('id', sidu).maybeSingle()
    checked++
    if (stu && stu.school_id !== s.school_id) leak++
  }
}
console.log(`\npush_subscriptions student_ids checked=${checked}, cross-school leaks=${leak}`)

// Live endpoint probes (auth must be enforced)
async function probe(path, body){
  try {
    const r = await fetch(`https://wazazi.sychar.co.ke${path}`, { method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer not-a-real-secret'}, body: JSON.stringify(body) })
    return r.status
  } catch(e){ return 'ERR:'+e.message }
}
console.log('\n--- live endpoint auth probes ---')
console.log('wazazi /api/internal/push (bad secret) ->', await probe('/api/internal/push', {school_id:PCEA,title:'x',body:'x'}), '(expect 401)')
const sp = await fetch(`${URL}/functions/v1/send-push`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({school_id:PCEA,audience:'staff',value:[],payload:{title:'x',body:'x'}}) }).then(r=>r.status).catch(e=>'ERR:'+e.message)
console.log('supabase send-push (no auth) ->', sp, '(expect 401)')
