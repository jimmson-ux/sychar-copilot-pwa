// POST /api/magazine/generate — principal only; AI-generated term e-magazine PDF

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface PhotoInput {
  url: string
  eventName: string
  date: string
}

async function generateCaption(
  photo: PhotoInput,
  apiKey: string
): Promise<string> {
  const prompt = `Write a 15-word energetic caption for a school event photo.
Event: "${photo.eventName}" on ${photo.date}.
Be positive, celebratory, and specific to the event. No hashtags.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      system: 'You write short, energetic captions for school event photos in Kenya. Return only the caption text.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) return `${photo.eventName} — A memorable moment.`
  const data = await res.json() as { content?: Array<{ text: string }> }
  return data.content?.[0]?.text?.trim() ?? `${photo.eventName} — A memorable moment.`
}

async function generateEditorial(
  schoolName: string,
  term: number,
  academicYear: string,
  highlights: string[],
  topStudents: Array<{ name: string; achievement: string }>,
  apiKey: string
): Promise<{
  editorial: string
  academicStars: string
  sportsRoundup: string
  upcomingTeaser: string
}> {
  const termLabel = `Term ${term} ${academicYear}`
  const highlightsList = highlights.slice(0, 8).join(', ')
  const starsList = topStudents.slice(0, 3).map(s => `${s.name}: ${s.achievement}`).join('; ')

  const prompt = `Write editorial content for ${schoolName}'s ${termLabel} school magazine.

Return ONLY valid JSON:
{
  "editorial": "<200-word term highlight editorial — celebratory, forward-looking tone>",
  "academicStars": "<100-word section spotlighting these top students: ${starsList || 'Top academic performers this term'}>",
  "sportsRoundup": "<100-word sports achievements roundup>",
  "upcomingTeaser": "<50-word teaser for next term activities>"
}

Key highlights this term: ${highlightsList || 'Academic achievement, sports competitions, school events'}
Write in warm, school-community English appropriate for parents and students.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: 'You write warm, celebratory school magazine content for Kenyan secondary schools. Return only valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const fallback = {
    editorial: `${termLabel} has been a remarkable term at ${schoolName}. Our students have shown exceptional dedication in academics, sports, and co-curricular activities. The school community has come together to create memories that will last a lifetime. We are proud of every achievement, big or small.`,
    academicStars: 'Our academic stars this term have demonstrated outstanding commitment to excellence.',
    sportsRoundup: 'Our athletes represented the school with great distinction in various competitions.',
    upcomingTeaser: 'Next term promises even more exciting activities. Stay tuned!',
  }

  if (!res.ok) return fallback

  const data = await res.json() as { content?: Array<{ text: string }> }
  const text = data.content?.[0]?.text ?? ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return fallback
    return JSON.parse(jsonMatch[0])
  } catch {
    return fallback
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Principal only' }, { status: 403 })
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({})) as {
    term?: number
    academicYear?: string
    photos?: PhotoInput[]
    highlights?: string[]
  }

  const term         = body.term ?? currentTerm()
  const academicYear = body.academicYear ?? new Date().getFullYear().toString()
  const photos       = (body.photos ?? []).slice(0, 20)
  const highlights   = body.highlights ?? []

  const db       = svc()
  const sid      = auth.schoolId!
  const termLabel = `Term ${term} ${academicYear}`

  // Fetch school info
  const { data: school } = await db
    .from('schools').select('name, logo_url').eq('id', sid).single()
  const schoolName = (school as { name: string } | null)?.name ?? 'School'

  // Fetch approved magazine content
  const { data: contentRaw } = await db
    .from('magazine_content')
    .select('section, title, body, image_url, featured')
    .eq('school_id', sid)
    .eq('approved', true)
    .eq('parental_consent', true)
    .order('featured', { ascending: false })
    .limit(40)

  type ContentRow = { section: string; title: string; body: string | null; image_url: string | null; featured: boolean }
  const content = (contentRaw ?? []) as ContentRow[]

  // Extract top students from achievements content
  const achievementItems = content
    .filter(c => c.section === 'achievements' && c.body)
    .slice(0, 3)
    .map(c => ({ name: c.title, achievement: c.body!.slice(0, 80) }))

  // Fetch top talent point earners this term
  const { data: talentTop } = await db
    .from('talent_points')
    .select('student_id, points, students(full_name)')
    .eq('school_id', sid)
    .eq('status', 'approved')
    .order('points', { ascending: false })
    .limit(3)

  type TalentRow = { student_id: string; points: number; students: { full_name: string } | null }
  const talentStars = ((talentTop ?? []) as unknown as TalentRow[]).map(t => ({
    name: t.students?.full_name ?? 'Unknown',
    achievement: `${t.points} talent points this term`,
  }))

  const topStudents = [...achievementItems, ...talentStars].slice(0, 3)

  // Generate captions for all photos in parallel (batch of 5 to avoid rate limits)
  const captionedPhotos: Array<PhotoInput & { caption: string }> = []
  for (let i = 0; i < photos.length; i += 5) {
    const batch = photos.slice(i, i + 5)
    const captions = await Promise.all(
      batch.map(p => generateCaption(p, ANTHROPIC_API_KEY))
    )
    for (let j = 0; j < batch.length; j++) {
      captionedPhotos.push({ ...batch[j], caption: captions[j] })
    }
  }

  // Generate all editorial sections
  const editorial = await generateEditorial(
    schoolName, term, academicYear, highlights, topStudents, ANTHROPIC_API_KEY
  )

  // Group content by section
  const bySect: Record<string, ContentRow[]> = {}
  for (const item of content) {
    if (!bySect[item.section]) bySect[item.section] = []
    bySect[item.section].push(item)
  }

  const magazineData = {
    school_id:    sid,
    school_name:  schoolName,
    logo_url:     (school as { logo_url?: string } | null)?.logo_url ?? null,
    term,
    academic_year: academicYear,
    term_label:   termLabel,
    generated_at: new Date().toISOString(),
    editorial:    editorial.editorial,
    academic_stars: editorial.academicStars,
    sports_roundup: editorial.sportsRoundup,
    upcoming_teaser: editorial.upcomingTeaser,
    photos:       captionedPhotos,
    content:      bySect,
    top_students: topStudents,
  }

  // Store reference in ai_insights
  await db.from('ai_insights').insert({
    school_id:    sid,
    insight_type: 'magazine_generated',
    target_type:  'magazine',
    content:      `E-Magazine generated for ${termLabel} — ${captionedPhotos.length} photos, ${content.length} content items`,
    severity:     'info',
    metadata:     { term, academicYear },
    created_at:   new Date().toISOString(),
  }).then(() => {}, () => {})

  // Attempt PDF generation
  const pdfRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-pdf`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      docType:  'magazine',
      data:     magazineData,
      schoolId: sid,
      filename: `Magazine-${termLabel.replace(/\s/g, '-')}.pdf`,
    }),
  }).catch(() => null)

  let magazineUrl: string | null = null
  if (pdfRes?.ok) {
    const pdfData = await pdfRes.json() as { url?: string }
    magazineUrl = pdfData.url ?? null
  }

  return NextResponse.json({
    ok:          true,
    termLabel,
    photoCount:  captionedPhotos.length,
    contentItems: content.length,
    magazineUrl,
    magazine:    magazineData,
  })
}

function currentTerm(): number {
  const m = new Date().getMonth() + 1
  return m <= 4 ? 1 : m <= 8 ? 2 : 3
}
