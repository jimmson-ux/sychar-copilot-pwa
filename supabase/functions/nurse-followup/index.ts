/**
 * nurse-followup — intelligent, timely follow-up reminders for the school nurse.
 *
 * Finds patient visits (student + staff) whose follow-up has fallen due and not
 * been completed, summarizes them with AI (parsing the patient notes/complaints),
 * and web-pushes the nurse a prioritized reminder. Re-nags daily until the nurse
 * marks the follow-up done.
 *
 * Auth: x-cron-secret. Run a few times daily (e.g. 08:00 + 13:00 EAT).
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'

serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  const origin = req.headers.get('origin')
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } })

  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return json({ error: 'Unauthorized' }, 401)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const svc = createClient(SUPABASE_URL, SERVICE_KEY)
  const nowIso = new Date().toISOString()
  const GROQ = Deno.env.get('GROQ_API_KEY')

  async function aiSummary(lines: string[]): Promise<string> {
    if (!GROQ || !lines.length) return lines.slice(0, 5).join(' ')
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant', max_tokens: 90, temperature: 0.2,
          messages: [
            { role: 'system', content: 'You are a school nurse assistant. In ONE short sentence, give a prioritized follow-up reminder from these overdue patient notes. No names beyond what is given.' },
            { role: 'user', content: lines.join('\n') },
          ],
        }),
      })
      if (!res.ok) return lines.slice(0, 5).join(' ')
      const d = await res.json()
      return d.choices?.[0]?.message?.content?.trim() || lines.slice(0, 5).join(' ')
    } catch { return lines.slice(0, 5).join(' ') }
  }

  async function push(schoolId: string, title: string, body: string) {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ audience: 'role', value: ['nurse'], school_id: schoolId, payload: { title, body, url: '/dashboard/nurse', tag: 'nurse-followup', renotify: true } }),
    }).catch(() => {})
  }

  try {
    const tomorrow = new Date(Date.now() + 86400000).toISOString()
    // Student follow-ups due.
    const { data: studentDue } = await svc
      .from('sick_bay_visits')
      .select('id, school_id, complaint, follow_up_plan, students:student_id(full_name, class_name)')
      .eq('followup_done', false)
      .not('followup_due_at', 'is', null)
      .lte('followup_due_at', nowIso)
      .limit(500)
    // Staff follow-ups due (confidential — no names in push).
    const { data: staffDue } = await svc
      .from('staff_patient_visits')
      .select('id, school_id, complaint, follow_up_plan')
      .eq('followup_done', false)
      .not('followup_due_at', 'is', null)
      .lte('followup_due_at', nowIso)
      .limit(500)

    const bySchool = new Map<string, { studentLines: string[]; staffCount: number; ids: { t: string; id: string }[] }>()
    for (const v of (studentDue as any[] ?? [])) {
      const e = bySchool.get(v.school_id) ?? { studentLines: [], staffCount: 0, ids: [] }
      const stu = Array.isArray(v.students) ? v.students[0] : v.students
      e.studentLines.push(`${stu?.full_name ?? 'Student'} (${stu?.class_name ?? ''}): ${v.complaint} — ${v.follow_up_plan}`)
      e.ids.push({ t: 'student', id: v.id })
      bySchool.set(v.school_id, e)
    }
    for (const v of (staffDue as any[] ?? [])) {
      const e = bySchool.get(v.school_id) ?? { studentLines: [], staffCount: 0, ids: [] }
      e.staffCount++
      e.ids.push({ t: 'staff', id: v.id })
      bySchool.set(v.school_id, e)
    }

    let pushed = 0
    for (const [schoolId, e] of bySchool) {
      const summary = await aiSummary(e.studentLines)
      const staffNote = e.staffCount ? ` Plus ${e.staffCount} staff patient follow-up(s).` : ''
      await push(schoolId, 'Patient follow-ups due', `${summary}${staffNote}`)
      pushed++
      // Re-nag tomorrow (don't mark done — nurse closes it).
      for (const it of e.ids) {
        const table = it.t === 'student' ? 'sick_bay_visits' : 'staff_patient_visits'
        await svc.from(table).update({ followup_due_at: tomorrow }).eq('id', it.id)
      }
    }

    return json({ ok: true, schools: bySchool.size, pushed })
  } catch (err) {
    console.error('[nurse-followup]', err)
    return json({ error: 'nurse-followup failed' }, 500)
  }
})
