const ALLOWED_ORIGINS = [
  'https://sychar-copilot-pwa.vercel.app',
  'https://nkoroi-school-management-6d13.vercel.app',
  'https://nkoroi-school-management-6d13-git-main-jimmson-uxs-projects.vercel.app',
  // Live per-tenant PWA hosts (browsers call these edge functions directly).
  'https://nkoroimixed.sychar.co.ke',
  'https://oloolaiser.sychar.co.ke',
  'https://pceamatasia.sychar.co.ke',
  'http://localhost:3000',
  'http://localhost:3001',
]

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-school-id',
    'Access-Control-Max-Age': '86400',
  }
}

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders(req.headers.get('origin')),
    })
  }
  return null
}
