# @sychar/integrations — per-school analytics & integration kit

Wires **PostHog**, **Microsoft Clarity**, **Firebase** (web push), **Upstash Redis**, and
**QStash** into each school PWA. **Every school uses its OWN projects** — the kit is
config-injected, so nothing is shared between tenants except the Supabase DB.

> Single source of truth = `sychar-system/packages/integrations`. It is **vendored** into
> each school repo via `scripts/sync-core.mjs`. Never edit the vendored copy.

## Install (per school repo)

```
npm i posthog-js @microsoft/clarity firebase @upstash/redis @upstash/qstash
```
(All are optional peers — the kit degrades gracefully if one is absent.)

## Wire it (TanStack/Vite app)

1. Copy `.env.example` → `.env` and fill THIS school's project values (PostHog key, Clarity
   id, Firebase config, Upstash url/token, QStash token). These differ per school.
2. On app bootstrap (client):
   ```ts
   import { initPostHog, initClarity } from '@sychar/integrations'
   await initPostHog({ key: import.meta.env.VITE_POSTHOG_KEY, host: import.meta.env.VITE_POSTHOG_HOST })
   await initClarity({ projectId: import.meta.env.VITE_CLARITY_ID })
   ```
3. After login:
   ```ts
   import { identify, identifyClarity } from '@sychar/integrations'
   identify(user.id, { role: user.sub_role, school: school.slug })
   identifyClarity(user.id, user.sub_role)
   ```
4. On actions, emit the canonical events (no PII — ids/roles only):
   ```ts
   import { track, EVENTS } from '@sychar/integrations'
   track(EVENTS.LESSON_QR_SCANNED, { grade: '11' })
   track(EVENTS.FEE_STATEMENT_VIEWED)
   ```
5. Firebase push (parent/staff):
   ```ts
   import { getFcmToken } from '@sychar/integrations'
   const token = await getFcmToken({ apiKey: import.meta.env.VITE_FIREBASE_API_KEY, /* … */, vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY })
   // POST token to the server to store against the user
   ```
6. Server (Redis/QStash) — pass server env (never VITE_):
   ```ts
   import { createRedis, createQStash } from '@sychar/integrations'
   const redis = await createRedis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! })
   const qstash = await createQStash({ token: process.env.QSTASH_TOKEN! })
   ```

## Event vocabulary

See `src/events.ts` — use these constants so every school's PostHog dashboards/funnels are
comparable. **Privacy law:** never attach student names, admission numbers, phone numbers,
fee amounts or medical data to analytics — only ids and roles.
