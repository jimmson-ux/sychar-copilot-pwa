// POST /api/fees/payment-plan — create AI-scored installment plan
// GET  /api/fees/payment-plan — list active plans for school

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { rateLimit, LIMITS } from '@/lib/rateLimit'
import { askAIProvider } from '@/lib/aiProvider'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set(['bursar', 'accountant', 'principal'])

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Bursar or principal access required' }, { status: 403 })
  }

  const db = svc()
  const status       = req.nextUrl.searchParams.get('status') ?? 'active'
  const term         = req.nextUrl.searchParams.get('term')
  const academicYear = req.nextUrl.searchParams.get('academic_year')
  const studentId    = req.nextUrl.searchParams.get('student_id')

  let query = db
    .from('payment_plans')
    .select(`
      id, student_id, total_balance, installments, ai_score, ai_reasoning,
      status, term, academic_year, created_at,
      students(full_name, admission_no, class_name)
    `)
    .eq('school_id', auth.schoolId!)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100)

  if (term)         query = query.eq('term', term)
  if (academicYear) query = query.eq('academic_year', academicYear)
  if (studentId)    query = query.eq('student_id', studentId)

  const { data, error } = await query
  if (error) {
    console.error('[payment-plan] GET error:', error.message)
    return NextResponse.json({ error: 'Failed to load payment plans' }, { status: 500 })
  }

  return NextResponse.json({ plans: data ?? [] })
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`payment-plan:${ip}`, LIMITS.FEE_RECORD.max, LIMITS.FEE_RECORD.window)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Bursar or principal access required' }, { status: 403 })
  }

  let body: {
    studentId?: string
    totalBalance?: number
    numberOfInstallments?: number
    term?: string
    academicYear?: string
  } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    studentId,
    totalBalance,
    numberOfInstallments = 3,
    term,
    academicYear,
  } = body

  if (!studentId || !totalBalance || totalBalance <= 0) {
    return NextResponse.json({ error: 'studentId and positive totalBalance required' }, { status: 400 })
  }
  if (numberOfInstallments < 2 || numberOfInstallments > 12) {
    return NextResponse.json({ error: 'numberOfInstallments must be 2-12' }, { status: 400 })
  }

  const db = svc()

  // Verify student belongs to school
  const { data: student, error: stuErr } = await db
    .from('students')
    .select('id, full_name, admission_no')
    .eq('id', studentId)
    .eq('school_id', auth.schoolId!)
    .single()

  if (stuErr || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  // Build installment schedule — equal splits, bi-weekly from today
  const installmentAmount = Math.ceil(totalBalance / numberOfInstallments)
  const installments: Array<{ due_date: string; amount: number; status: string }> = []
  const msPerBiweek = 14 * 24 * 60 * 60 * 1000
  let remaining = totalBalance

  for (let i = 0; i < numberOfInstallments; i++) {
    const dueDate = new Date(Date.now() + (i + 1) * msPerBiweek).toISOString().split('T')[0]
    const amount  = i === numberOfInstallments - 1 ? remaining : Math.min(installmentAmount, remaining)
    installments.push({ due_date: dueDate, amount, status: 'pending' })
    remaining -= amount
    if (remaining <= 0) break
  }

  // AI viability score
  let aiScore = 70
  let aiReasoning = 'Default viability score — AI service not configured'

  try {
    const ai = await askAIProvider(
      'You are a Kenyan secondary school finance assistant.',
      [{ role: 'user', content: `Rate the viability of this school fee payment plan for a Kenyan secondary school.

Total balance: KES ${totalBalance.toLocaleString()}
Installments: ${numberOfInstallments} payments of ~KES ${installmentAmount.toLocaleString()} each
Schedule: bi-weekly over ${numberOfInstallments * 2} weeks

Return ONLY valid JSON:
{"score": 0, "reasoning": "one sentence explanation"}

score: 0-100 (100 = very viable, 0 = unrealistic)` }],
      200,
    )
    const text = ai.content || '{}'
    const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
    aiScore     = Math.max(0, Math.min(100, Number(parsed.score ?? 70)))
    aiReasoning = parsed.reasoning ?? ''
  } catch (err) {
    console.error('[payment-plan] AI scoring error:', err)
  }

  const { data: plan, error: planErr } = await db
    .from('payment_plans')
    .insert({
      school_id:     auth.schoolId,
      student_id:    studentId,
      created_by:    auth.userId,
      total_balance: totalBalance,
      installments,
      ai_score:      aiScore,
      ai_reasoning:  aiReasoning,
      status:        'active',
      term:          term ?? null,
      academic_year: academicYear ?? null,
    })
    .select('id, installments, ai_score, ai_reasoning, status, created_at')
    .single()

  if (planErr) {
    console.error('[payment-plan] insert error:', planErr.message)
    return NextResponse.json({ error: 'Failed to create payment plan' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    planId: plan.id,
    studentName: student.full_name,
    totalBalance,
    installments: plan.installments,
    aiScore: plan.ai_score,
    aiReasoning: plan.ai_reasoning,
  }, { status: 201 })
}
