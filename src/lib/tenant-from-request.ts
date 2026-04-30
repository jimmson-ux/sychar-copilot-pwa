import { NextRequest } from 'next/server'

export interface TenantContext {
  schoolId: string
  slug:     string
  name:     string
}

export function getTenantFromRequest(req: NextRequest): TenantContext | null {
  const schoolId = req.headers.get('x-school-id')
  const slug     = req.headers.get('x-school-slug')
  if (!schoolId || !slug) return null
  return { schoolId, slug, name: req.headers.get('x-school-name') ?? '' }
}
