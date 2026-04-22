import { readFileSync, existsSync } from 'fs'

const checks = [
  {
    name: 'Security headers in next.config.ts',
    check: () => {
      const config = readFileSync('next.config.ts', 'utf-8')
      return config.includes('X-Frame-Options') &&
             config.includes('Content-Security-Policy') &&
             config.includes('Strict-Transport-Security')
    },
  },
  {
    name: 'poweredByHeader disabled',
    check: () => readFileSync('next.config.ts', 'utf-8').includes('poweredByHeader: false'),
  },
  {
    name: 'CORS utility exists',
    check: () => existsSync('src/lib/cors.ts'),
  },
  {
    name: 'Rate limit utility exists',
    check: () => existsSync('src/lib/rateLimit.ts'),
  },
  {
    name: 'Sanitize utility exists',
    check: () => existsSync('src/lib/sanitize.ts'),
  },
  {
    name: 'Auth middleware exists',
    check: () => existsSync('src/lib/authMiddleware.ts'),
  },
  {
    name: 'Edge function CORS shared',
    check: () => existsSync('supabase/functions/_shared/cors.ts'),
  },
  {
    name: 'Edge function auth shared',
    check: () => existsSync('supabase/functions/_shared/auth.ts'),
  },
  {
    name: 'send-sms edge function',
    check: () => existsSync('supabase/functions/send-sms/index.ts'),
  },
  {
    name: 'ai-insights edge function',
    check: () => existsSync('supabase/functions/ai-insights/index.ts'),
  },
  {
    name: 'generate-pdf edge function',
    check: () => existsSync('supabase/functions/generate-pdf/index.ts'),
  },
  {
    name: 'DB security migration exists',
    check: () => existsSync('supabase/migrations/007_security_hardening.sql'),
  },
  {
    name: 'Scanner route has rate limiting',
    check: () => readFileSync('src/app/api/scanner/route.ts', 'utf-8').includes('rateLimit'),
  },
  {
    name: 'WhatsApp route has rate limiting',
    check: () => readFileSync('src/app/api/whatsapp/route.ts', 'utf-8').includes('rateLimit'),
  },
]

let passed = 0
for (const check of checks) {
  try {
    const result = check.check()
    console.log(`${result ? '✅' : '❌'} ${check.name}`)
    if (result) passed++
  } catch (e) {
    console.log(`❌ ${check.name} — ${e}`)
  }
}
console.log(`\n${passed}/${checks.length} checks passed`)
if (passed < checks.length) process.exit(1)
