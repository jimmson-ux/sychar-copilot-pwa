import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const teacherId = searchParams.get('teacherId')

  if (!token || !teacherId) {
    return NextResponse.json({ duties: [] })
  }

  const supabase = createAdminSupabaseClient()

  // Validate token
  const { data: tokenRecord } = await supabase
    .from('teacher_tokens')
    .select('is_active')
    .eq('token', token)
    .single()

  if (!tokenRecord?.is_active) {
    return NextResponse.json({ duties: [] })
  }

  // Get duties from duty_roster (if table exists) - graceful fallback
  const today = new Date().toISOString().split('T')[0]
  const twoWeeksLater = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data } = await supabase
    .from('duty_roster')
    .select('id, duty_type, duty_date, location, description')
    .eq('teacher_id', teacherId)
    .gte('duty_date', today)
    .lte('duty_date', twoWeeksLater)
    .order('duty_date')
    .limit(10)

  return NextResponse.json({ duties: data ?? [] })
}
