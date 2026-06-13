import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { indexSchoolDocument } from '@/lib/rag'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rag/index
 *
 * Two modes:
 *   { action: 'index', source_type, text, source_id?, document_type?, metadata? }
 *       — index a single document for the caller's school.
 *   { action: 'backfill' }
 *       — (leadership) index this school's reference docs, lesson plans and
 *         records of work into the RAG store. Idempotent per source.
 *
 * Embeddings require OPENAI_API_KEY. Everything is stamped with school_id.
 */
const ADMIN_ROLES = new Set(['principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin', 'dean_of_studies'])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({})) as {
    action?: string; source_type?: string; text?: string
    source_id?: string; document_type?: string; metadata?: Record<string, unknown>
  }

  if (body.action === 'backfill') {
    if (!ADMIN_ROLES.has(auth.subRole)) {
      return NextResponse.json({ error: 'Only leadership can run a RAG backfill.' }, { status: 403 })
    }
    return backfill(auth.schoolId)
  }

  // Single-document index.
  if (!body.source_type || !body.text?.trim()) {
    return NextResponse.json({ error: 'source_type and text are required' }, { status: 400 })
  }
  const { chunks } = await indexSchoolDocument({
    schoolId: auth.schoolId,
    sourceType: body.source_type,
    text: body.text,
    sourceId: body.source_id,
    documentType: body.document_type,
    metadata: body.metadata,
  })
  return NextResponse.json({ ok: true, chunks })
}

async function backfill(schoolId: string) {
  const svc = createAdminSupabaseClient()
  let total = 0
  const report: Record<string, number> = {}

  // 1. Reference docs (rules, CBE combinations, duty rota).
  const { data: refs } = await svc
    .from('school_reference_docs')
    .select('doc_type, title, content')
    .eq('school_id', schoolId)
  for (const r of (refs as any[] ?? [])) {
    const { chunks } = await indexSchoolDocument({
      schoolId, sourceType: r.doc_type, sourceId: r.doc_type,
      documentType: 'reference', text: `${r.title ?? r.doc_type}\n${JSON.stringify(r.content)}`,
      metadata: { title: r.title },
    })
    total += chunks; report[r.doc_type] = (report[r.doc_type] ?? 0) + chunks
  }

  // 2. Lesson plans (most recent 500).
  const { data: lps } = await svc
    .from('lesson_plans')
    .select('id, subject_name, class_name, cbc_strand, cbc_sub_strand, slo_cognitive, instructional_obj_1, homework, date_taught')
    .eq('school_id', schoolId)
    .order('date_taught', { ascending: false })
    .limit(500)
  for (const lp of (lps as any[] ?? [])) {
    const text = [lp.subject_name, lp.class_name, lp.cbc_strand, lp.cbc_sub_strand, lp.slo_cognitive, lp.instructional_obj_1, lp.homework]
      .filter(Boolean).join(' | ')
    if (!text) continue
    const { chunks } = await indexSchoolDocument({
      schoolId, sourceType: 'lesson_plan', sourceId: lp.id, documentType: 'manual', text,
      metadata: { subject: lp.subject_name, class: lp.class_name, date: lp.date_taught },
    })
    total += chunks; report.lesson_plan = (report.lesson_plan ?? 0) + chunks
  }

  // 3. Records of work (most recent 500).
  const { data: rows } = await svc
    .from('records_of_work')
    .select('id, subject_name, class_name, topic, sub_topic, lesson_objectives, week_number, term, lesson_date')
    .eq('school_id', schoolId)
    .order('lesson_date', { ascending: false })
    .limit(500)
  for (const r of (rows as any[] ?? [])) {
    const text = [r.subject_name, r.class_name, r.topic, r.sub_topic, r.lesson_objectives].filter(Boolean).join(' | ')
    if (!text) continue
    const { chunks } = await indexSchoolDocument({
      schoolId, sourceType: 'record_of_work', sourceId: r.id, documentType: 'manual', text,
      metadata: { subject: r.subject_name, class: r.class_name, week: r.week_number, term: r.term },
    })
    total += chunks; report.record_of_work = (report.record_of_work ?? 0) + chunks
  }

  // 4. Meeting minutes (minuted meetings — summary + decisions).
  const { data: meetings } = await svc
    .from('meetings')
    .select('id, meeting_type, department, title, summary, decisions, scheduled_at')
    .eq('school_id', schoolId)
    .not('summary', 'is', null)
    .order('minuted_at', { ascending: false })
    .limit(500)
  for (const m of (meetings as any[] ?? [])) {
    const text = [m.meeting_type, m.department, m.title, m.summary,
      Array.isArray(m.decisions) ? m.decisions.join('; ') : null].filter(Boolean).join(' | ')
    if (!text) continue
    const { chunks } = await indexSchoolDocument({
      schoolId, sourceType: 'meeting_minutes', sourceId: m.id, documentType: 'minutes', text,
      metadata: { type: m.meeting_type, department: m.department, date: m.scheduled_at },
    })
    total += chunks; report.meeting_minutes = (report.meeting_minutes ?? 0) + chunks
  }

  // 5. Secretary correspondence (incoming/outgoing register — subject + party).
  const { data: corr } = await svc
    .from('secretary_correspondence')
    .select('id, direction, party, subject, correspondence_date')
    .eq('school_id', schoolId)
    .order('correspondence_date', { ascending: false })
    .limit(500)
  for (const c of (corr as any[] ?? [])) {
    const text = [c.direction, c.party, c.subject].filter(Boolean).join(' | ')
    if (!text) continue
    const { chunks } = await indexSchoolDocument({
      schoolId, sourceType: 'correspondence', sourceId: c.id, documentType: 'correspondence', text,
      metadata: { direction: c.direction, party: c.party, date: c.correspondence_date },
    })
    total += chunks; report.correspondence = (report.correspondence ?? 0) + chunks
  }

  // 6. School documents (titles + descriptions; binary content is not embedded).
  const { data: docs } = await svc
    .from('school_documents')
    .select('id, title, description, kind, uploaded_at')
    .eq('school_id', schoolId)
    .order('uploaded_at', { ascending: false })
    .limit(500)
  for (const d of (docs as any[] ?? [])) {
    const text = [d.kind, d.title, d.description].filter(Boolean).join(' | ')
    if (!text) continue
    const { chunks } = await indexSchoolDocument({
      schoolId, sourceType: 'school_document', sourceId: d.id, documentType: 'document', text,
      metadata: { kind: d.kind, title: d.title, date: d.uploaded_at },
    })
    total += chunks; report.school_document = (report.school_document ?? 0) + chunks
  }

  return NextResponse.json({ ok: true, total_chunks: total, by_source: report })
}
