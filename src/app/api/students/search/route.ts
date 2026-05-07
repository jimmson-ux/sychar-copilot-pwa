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
  const schoolId    = searchParams.get('schoolId')
  const q           = searchParams.get('q') ?? ''
  const classFilter  = searchParams.get('class') ?? ''
  const streamFilter = searchParams.get('stream') ?? ''

  if (!schoolId) return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 })
  if (q.length < 2) return NextResponse.json({ students: [] })

  const sb = getClient()
  let query = sb
    .from('students')
    .select('id, full_name, admission_no, admission_number, class_name, stream_name, photo_url, gender')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .or(`full_name.ilike.%${q}%,admission_no.ilike.%${q}%,admission_number.ilike.%${q}%`)
    .order('full_name')
    .limit(15)

  if (classFilter)  query = query.eq('class_name',  classFilter)
  if (streamFilter) query = query.eq('stream_name', streamFilter)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to search' }, { status: 500 })
  return NextResponse.json({ students: data ?? [] })
}
