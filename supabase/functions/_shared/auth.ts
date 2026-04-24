import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// school_id resolved dynamically from session — no hardcoded IDs

// Used by existing edge functions (queries staff_records)
export async function verifyRequest(req: Request): Promise<{
  userId: string; schoolId: string; role: string
} | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { authorization: authHeader } } }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: staff } = await serviceClient
    .from('staff_records')
    .select('sub_role, school_id')
    .eq('user_id', user.id)
    .single()

  if (!staff?.school_id) return null

  return { userId: user.id, schoolId: staff.school_id, role: staff.sub_role ?? 'staff' }
}

// Used by parent PWA edge functions (queries users table)
export async function verifyToken(req: Request): Promise<{
  userId: string
  schoolId: string
  role: string
} | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { authorization: authHeader } } }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!data?.school_id) return null

  return { userId: user.id, schoolId: data.school_id, role: data.role }
}
