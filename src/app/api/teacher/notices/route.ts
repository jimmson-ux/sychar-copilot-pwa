import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const teacherId = searchParams.get('teacherId')

  if (!token || !teacherId) {
    return NextResponse.json({ notices: [] })
  }

  const supabase = createAdminSupabaseClient()

  // Validate token
  const { data: tokenRecord } = await supabase
    .from('teacher_tokens')
    .select('is_active, teacher_id')
    .eq('token', token)
    .single()

  if (!tokenRecord?.is_active) {
    return NextResponse.json({ notices: [] })
  }

  const { data } = await supabase
    .from('teacher_notices')
    .select('id, subject, message, from_role, created_at, is_read')
    .eq('to_teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({ notices: data ?? [] })
}
