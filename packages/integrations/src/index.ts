// @sychar/integrations — per-school analytics & integration kit. Each school PWA wires
// its OWN PostHog/Clarity/Firebase/Upstash projects via these config-injected helpers;
// nothing is shared between tenants except the Supabase DB.
//
// Typical Vite app bootstrap (client):
//   import { initPostHog, initClarity, identify, identifyClarity, track, EVENTS } from '@sychar/integrations'
//   await initPostHog({ key: import.meta.env.VITE_POSTHOG_KEY, host: import.meta.env.VITE_POSTHOG_HOST })
//   await initClarity({ projectId: import.meta.env.VITE_CLARITY_ID })
//   // after login:
//   identify(user.id, { role: user.sub_role, school: school.slug }); identifyClarity(user.id, user.sub_role)
//   // on actions: track(EVENTS.LESSON_QR_SCANNED, { grade })

export * from './events'
export * from './posthog'
export * from './clarity'
export * from './firebase'
export * from './redis'
export * from './qstash'
