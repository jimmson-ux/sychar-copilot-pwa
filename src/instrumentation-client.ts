// Client-side Sentry (Next.js 16 instrumentation-client convention).
// Captures browser errors. No-ops until NEXT_PUBLIC_SENTRY_DSN is set, and only
// enabled in production. Server/edge instrumentation + source-map upload
// (withSentryConfig) intentionally deferred to avoid build risk on OpenNext/Cloudflare.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0.1,
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
