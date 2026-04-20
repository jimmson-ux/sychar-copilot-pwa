// GET /api/cron/magazine-selfheal — daily self-healing for e-magazine
// Checks broken images, pulls content into empty sections, sends pending-approval reminders
// Scheduled: 0 2 * * * (2 AM UTC daily)

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const SECTIONS = ['about', 'highlights', 'achievements', 'arts', 'sports', 'academics', 'leadership', 'community']
const STALE_DAYS = 30
const MAX_RETRIES = 3

export async function GET(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db    = svc()
  const now   = new Date()
  const stats = { images_checked: 0, images_removed: 0, sections_healed: 0, reminders_sent: 0, schools_processed: 0 }

  // Fetch all active schools
  const { data: schools } = await db.from('schools').select('id').eq('active', true)
  if (!schools?.length) return NextResponse.json({ ok: true, stats })

  for (const school of schools as { id: string }[]) {
    stats.schools_processed++

    // ── 1. Check broken image links ──────────────────────────────────────────
    const { data: imageItems } = await db
      .from('magazine_content')
      .select('id, image_url, image_retry_count, image_status')
      .eq('school_id', school.id)
      .eq('approved', true)
      .not('image_url', 'is', null)
      .neq('image_status', 'removed')

    for (const item of (imageItems ?? []) as { id: string; image_url: string; image_retry_count: number; image_status: string }[]) {
      stats.images_checked++
      try {
        const resp = await fetch(item.image_url, { method: 'HEAD' })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      } catch {
        // Image broken
        const retries = item.image_retry_count + 1
        if (retries >= MAX_RETRIES) {
          // Remove after 3 failed attempts
          await db.from('magazine_content').update({
            image_url:         null,
            image_status:      'removed',
            image_retry_count: retries,
            updated_at:        now.toISOString(),
          }).eq('id', item.id)
          stats.images_removed++

          // Alert principal
          await db.from('alerts').insert({
            school_id: school.id,
            type:      'magazine_image_removed',
            severity:  'low',
            title:     `Magazine: image removed after ${MAX_RETRIES} failed attempts — please re-upload`,
            detail:    { content_id: item.id, image_url: item.image_url },
          }).then(() => {}, () => {})
        } else {
          await db.from('magazine_content').update({
            image_status:      'pending_retry',
            image_retry_count: retries,
            updated_at:        now.toISOString(),
          }).eq('id', item.id)
        }
      }
    }

    // ── 2. Detect empty sections > 30 days ───────────────────────────────────
    const staleDate = new Date(now.getTime() - STALE_DAYS * 86400000).toISOString()

    const { data: recentContent } = await db
      .from('magazine_content')
      .select('section, published_at')
      .eq('school_id', school.id)
      .eq('approved', true)
      .gte('published_at', staleDate)

    const activeSections = new Set((recentContent ?? []).map((c: { section: string }) => c.section))

    for (const section of SECTIONS) {
      if (!activeSections.has(section)) {
        // Auto-pull from related content
        let healed = false

        if (section === 'achievements') {
          // Pull from finalized marks (top performers this term)
          const { data: topMarks } = await db
            .from('marks')
            .select('student_id, score, max_score, term_id, students(full_name, class_name)')
            .eq('school_id', school.id)
            .order('score', { ascending: false })
            .limit(3)

          for (const m of (topMarks ?? []) as unknown as { student_id: string; score: number; max_score: number; term_id: string; students: { full_name: string; class_name: string } | null }[]) {
            if (!m.students) continue
            const pct = Math.round((m.score / m.max_score) * 100)
            await db.from('magazine_content').insert({
              school_id:    school.id,
              section:      'achievements',
              title:        `${m.students.full_name} — ${pct}% (${m.term_id})`,
              body:         `Outstanding academic performance in ${m.students.class_name}.`,
              approved:     true,
              published_at: now.toISOString(),
              updated_at:   now.toISOString(),
              tags:         ['auto-generated', 'academic'],
            }).then(() => {}, () => {})
            healed = true
          }
        }

        if (section === 'sports') {
          // Pull from discipline records tagged 'sports_achievement' or talent_points Sports category
          const { data: sports } = await db
            .from('talent_points')
            .select('student_id, reason, awarded_at, students(full_name, class_name)')
            .eq('school_id', school.id)
            .eq('category', 'Sports & Physical')
            .eq('status', 'approved')
            .order('awarded_at', { ascending: false })
            .limit(3)

          for (const sp of (sports ?? []) as unknown as { student_id: string; reason: string; awarded_at: string; students: { full_name: string; class_name: string } | null }[]) {
            if (!sp.students) continue
            await db.from('magazine_content').insert({
              school_id:    school.id,
              section:      'sports',
              title:        `Sports Recognition — ${sp.students.full_name}`,
              body:         sp.reason,
              approved:     true,
              published_at: now.toISOString(),
              updated_at:   now.toISOString(),
              tags:         ['auto-generated', 'sports'],
            }).then(() => {}, () => {})
            healed = true
          }
        }

        if (healed) stats.sections_healed++
      }
    }

    // ── 3. Unapproved photos > 7 days → reminder ────────────────────────────
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
    const { count: pendingCount } = await db
      .from('magazine_content')
      .select('id', { count: 'exact' })
      .eq('school_id', school.id)
      .eq('approved', false)
      .lte('created_at', sevenDaysAgo)

    if ((pendingCount ?? 0) > 0) {
      await db.from('alerts').insert({
        school_id: school.id,
        type:      'magazine_approval_pending',
        severity:  'low',
        title:     `${pendingCount} magazine item(s) awaiting your approval for over 7 days`,
        detail:    { pending_count: pendingCount },
      }).then(() => {}, () => {})
      stats.reminders_sent++
    }

    // ── 4. Revoked consent — immediate removal (belt-and-suspenders) ─────────
    const { data: revocations } = await db
      .from('magazine_consent_revocations')
      .select('student_id')
      .eq('school_id', school.id)
      .gte('revoked_at', new Date(now.getTime() - 24 * 3600000).toISOString())

    for (const rev of (revocations ?? []) as { student_id: string }[]) {
      // Find all content featuring this student and remove image / unpublish
      const { data: affected } = await db
        .from('magazine_content')
        .select('id, student_ids')
        .eq('school_id', school.id)
        .contains('student_ids', JSON.stringify([rev.student_id]))

      for (const item of (affected ?? []) as { id: string }[]) {
        await db.from('magazine_content').update({
          image_url:        null,
          image_status:     'removed',
          parental_consent: false,
          approved:         false,
          updated_at:       now.toISOString(),
        }).eq('id', item.id)
      }
    }
  }

  return NextResponse.json({ ok: true, stats, ran_at: now.toISOString() })
}
