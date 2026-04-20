// Sychar Service Worker — compiled by @serwist/next from src/app/sw.ts
// Strategy matrix (Phase 9):
//   /api/students     → CacheFirst, 86400s TTL
//   /api/timetable    → StaleWhileRevalidate
//   /api/attendance   → NetworkFirst, 5s timeout
//   /api/heartbeat    → NetworkOnly
//   /api/lesson-logs  → NetworkFirst, 5s timeout
//   /api/hod/insights → StaleWhileRevalidate (analytics — slightly stale OK)
//   Assets (hashed)   → CacheFirst
//   Navigation (HTML) → NetworkFirst (never cache HTML — Next.js hashes change each deploy)
//
// Background sync tags (priority order):
//   sync-attendance | sync-lesson-checkin | sync-discipline |
//   sync-photos     | sync-syllabus       | lesson-heartbeat

import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import {
  Serwist,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
  ExpirationPlugin,
} from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// ── Serwist instance ──────────────────────────────────────────────────────────

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    // Students list — cache aggressively, valid 24h
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/students'),
      handler: new CacheFirst({
        cacheName: 'sychar-students',
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 86400, maxEntries: 20 })],
      }),
    },
    // Timetable — stale-while-revalidate (changes infrequently)
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/timetable'),
      handler: new StaleWhileRevalidate({
        cacheName: 'sychar-timetable',
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 3600 * 12, maxEntries: 30 })],
      }),
    },
    // Attendance — Network first, 5s timeout then cached fallback
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/attendance'),
      handler: new NetworkFirst({
        cacheName: 'sychar-attendance',
        networkTimeoutSeconds: 5,
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 3600, maxEntries: 50 })],
      }),
    },
    // Heartbeat — always go to network, never cache
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/heartbeat') || url.pathname.startsWith('/api/lesson/heartbeat'),
      handler: new NetworkOnly(),
    },
    // Lesson logs — Network first, 5s timeout
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/lesson-logs') || url.pathname.startsWith('/api/lesson/logs'),
      handler: new NetworkFirst({
        cacheName: 'sychar-lesson-logs',
        networkTimeoutSeconds: 5,
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 1800, maxEntries: 30 })],
      }),
    },
    // Analytics — stale-while-revalidate (insights, predictions)
    {
      matcher: ({ url }) =>
        ['/api/hod/insights', '/api/university-matching', '/api/kcse-predictions', '/api/gender-analysis']
          .some(p => url.pathname.startsWith(p)),
      handler: new StaleWhileRevalidate({
        cacheName: 'sychar-analytics',
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 3600 * 6, maxEntries: 20 })],
      }),
    },
    // Generic API — Network first, cache fallback
    {
      matcher: ({ url }) => url.pathname.startsWith('/api/'),
      handler: new NetworkFirst({
        cacheName: 'sychar-api',
        networkTimeoutSeconds: 8,
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 300, maxEntries: 100 })],
      }),
    },
    // Static assets (content-hashed filenames) — CacheFirst forever
    {
      matcher: ({ request }) =>
        request.destination === 'script' ||
        request.destination === 'style'  ||
        request.destination === 'font'   ||
        request.destination === 'image',
      handler: new CacheFirst({
        cacheName: 'sychar-assets',
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 86400 * 30, maxEntries: 200 })],
      }),
    },
  ],
})

serwist.addEventListeners()

// ── Background sync ────────────────────────────────────────────────────────────
// Priority order: attendance → lesson-checkin → discipline → photos → syllabus

self.addEventListener('sync', (event: Event) => {
  const syncEvent = event as SyncEvent
  switch (syncEvent.tag) {
    case 'sync-attendance':
      syncEvent.waitUntil(broadcastSync('SYNC_ATTENDANCE'))
      break
    case 'sync-lesson-checkin':
      syncEvent.waitUntil(broadcastSync('SYNC_LESSON_CHECKIN'))
      break
    case 'sync-discipline':
      syncEvent.waitUntil(broadcastSync('SYNC_DISCIPLINE'))
      break
    case 'sync-photos':
      syncEvent.waitUntil(broadcastSync('SYNC_PHOTOS'))
      break
    case 'sync-syllabus':
      syncEvent.waitUntil(broadcastSync('SYNC_SYLLABUS'))
      break
    case 'lesson-heartbeat':
      syncEvent.waitUntil(sendHeartbeat())
      break
  }
})

self.addEventListener('periodicsync', (event: Event) => {
  const ps = event as PeriodicSyncEvent
  if (ps.tag === 'lesson-heartbeat') ps.waitUntil(sendHeartbeat())
})

// ── Message handler ────────────────────────────────────────────────────────────

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  void (async () => {
    if (event.data?.type === 'SKIP_WAITING') {
      self.skipWaiting()
      return
    }
    if (event.data?.type === 'SET_ACTIVE_LESSON') {
      const cache = await caches.open('sychar-heartbeat-state')
      await cache.put(
        '/sw-heartbeat-state',
        new Response(JSON.stringify({ lesson_id: event.data.lesson_id, started_at: Date.now() }),
          { headers: { 'Content-Type': 'application/json' } })
      )
      return
    }
    if (event.data?.type === 'CLEAR_LESSON') {
      const cache = await caches.open('sychar-heartbeat-state')
      await cache.delete('/sw-heartbeat-state')
    }
  })()
})

// ── Helpers ────────────────────────────────────────────────────────────────────

async function broadcastSync(type: string): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  clients.forEach((c: Client) => c.postMessage({ type }))
}

async function sendHeartbeat(): Promise<void> {
  const hour = new Date().getHours()
  if (hour >= 18 || hour < 6) return
  try {
    const cache = await caches.open('sychar-heartbeat-state')
    const resp  = await cache.match('/sw-heartbeat-state')
    if (!resp) return
    const state = await resp.json() as { lesson_id?: string }
    if (!state?.lesson_id) return
    await fetch('/api/lesson/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson_id: state.lesson_id }),
    })
  } catch { /* offline — retry on next sync */ }
}

// ── Type declarations for sync events ─────────────────────────────────────────
interface SyncEvent extends Event {
  tag: string
  waitUntil(promise: Promise<unknown>): void
}

interface PeriodicSyncEvent extends Event {
  tag: string
  waitUntil(promise: Promise<unknown>): void
}
