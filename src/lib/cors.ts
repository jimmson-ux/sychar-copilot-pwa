const ALLOWED_ORIGINS = [
  'https://nkoroi-school-management-6d13.vercel.app',
  'https://nkoroi-school-management-6d13-git-main-jimmson-uxs-projects.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
]

export function getAllowedOrigin(origin: string | null): string {
  if (!origin) return ALLOWED_ORIGINS[0]
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
}

export function corsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-school-id, x-user-role',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
  }
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.get('origin')
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin),
    })
  }
  return null
}

export function withCors(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers)
  Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v as string))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
