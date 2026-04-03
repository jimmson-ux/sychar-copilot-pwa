import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { GenericSaveSchema } from '@/lib/scannerSchemas'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Generic fallback for document types without a dedicated save route.
// Marks the document_inbox record as 'saved' — only if it belongs to the
// authenticated user's school (prevents IDOR via guessed inbox UUIDs).

export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  const supabase = getClient()
  // 1. Verify session
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  // 2. Validate body
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = GenericSaveSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Validation failed', detail: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { type } = await params
  const { inboxId } = parsed.data

  // 3. Update status — .eq('school_id') prevents IDOR across tenants
  if (inboxId) {
    const { error } = await supabase
      .from('document_inbox')
      .update({ status: 'saved' })
      .eq('id', inboxId)
      .eq('school_id', auth.schoolId)

    if (error) {
      console.error(`[scanner/${type}] document_inbox update error:`, error.message)
      return NextResponse.json({ success: false, error: 'Failed to update record' }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    message: `Document type "${type}" filed successfully.`,
  })
}
