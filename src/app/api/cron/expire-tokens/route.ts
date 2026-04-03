import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await supabase
    .from('teacher_tokens')
    .update({ is_active: false })
    .lt('expires_at', new Date().toISOString())

  return NextResponse.json({
    success: !error,
    message: error?.message || 'Tokens expired successfully',
    timestamp: new Date().toISOString()
  })
}
