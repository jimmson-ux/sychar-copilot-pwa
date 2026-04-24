// Checks whether a school's subscription includes a given premium feature.
// Features are stored as boolean flags in tenant_configs.features jsonb.

import { createClient } from '@supabase/supabase-js'

export async function tenantHasFeature(
  schoolId: string,
  feature: string
): Promise<boolean> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await db
    .from('tenant_configs')
    .select('features')
    .eq('school_id', schoolId)
    .single()

  if (!data?.features) return false
  return Boolean((data.features as Record<string, boolean>)[feature])
}
