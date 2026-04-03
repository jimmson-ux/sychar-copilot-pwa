import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const schoolId = searchParams.get('schoolId')
  const q = searchParams.get('q') ?? ''

  if (!schoolId) return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 })
  if (q.length < 2) return NextResponse.json({ students: [] })

  const sb = getClient()
  const { data, error } = await sb
    .from('students')
    .select('id, full_name, admission_number')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .ilike('full_name', `%${q}%`)
    .order('full_name')
    .limit(15)

  if (error) return NextResponse.json({ error: 'Failed to search' }, { status: 500 })
  return NextResponse.json({ students: data ?? [] })
}
