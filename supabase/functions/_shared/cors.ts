const ALLOWED_ORIGINS = [
  'https://nkoroi-school-management-6d13.vercel.app',
  'https://nkoroi-school-management-6d13-git-main-jimmson-uxs-projects.vercel.app',
  'http://localhost:3000',
]

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-school-id',
    'Access-Control-Max-Age': '86400',
  }
}
