// Sychar Service Worker — sychar-v9
// Strategy matrix:
//   Navigation (HTML)  → Network First, no cache (always fresh from server)
//   Scripts / Styles   → Cache First (content-hashed, safe to cache long-term)
//   Images / Fonts     → Cache First
//   /api/*             → Network First + fallback to cache
//   /api/hod/insights  → Stale-While-Revalidate (analytics, slightly stale OK)
//   Offline fallback   → Inline HTML

const CACHE_VERSION = 'sychar-v9'
const ASSET_CACHE   = `${CACHE_VERSION}-assets`   // scripts, styles, fonts, images
const API_CACHE     = `${CACHE_VERSION}-api`        // API responses

// Only cache true static binary assets — NOT html pages
// HTML pages must always be served fresh so Next.js asset hashes stay current
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
]

const ANALYTICS_ROUTES = [
  '/api/hod/insights',
  '/api/university-matching',
  '/api/kcse-predictions',
  '/api/gender-analysis',
]

// ── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  self.skipWaiting() // activate immediately, don't wait for old SW to die
  event.waitUntil(
    // Nuclear cache clear on install — wipes every cache so stale HTML cannot survive
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => caches.open(ASSET_CACHE).then(cache =>
        Promise.allSettled(PRECACHE_ASSETS.map(url => cache.add(url).catch(() => {})))
      ))
  )
})

// ── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== ASSET_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // take control of all open tabs immediately
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => {
        // Notify all open tabs — the layout listener calls window.location.reload()
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION })
        })
      })
  )
})

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return

  // ── Navigation requests (HTML pages) → Network First, no caching ──────────
  // Never cache HTML — Next.js pages contain hashed script references that
  // become invalid after each deploy. Always fetch fresh from the server.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/offline') ||
        new Response(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title>' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc}' +
          '.b{text-align:center;padding:40px;max-width:320px}.i{font-size:56px;margin-bottom:16px}' +
          'h1{font-size:20px;font-weight:700;margin:0 0 8px;color:#111827}p{font-size:14px;color:#6b7280;margin:0 0 24px}' +
          'button{background:#0891b2;color:#fff;border:none;border-radius:10px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer}' +
          '</style></head><body><div class="b"><div class="i">📡</div>' +
          '<h1>You\'re offline</h1><p>Check your connection and try again.</p>' +
          '<button onclick="location.reload()">Retry</button></div></body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        )
      )
    )
    return
  }

  // ── Analytics routes → Stale-While-Revalidate ─────────────────────────────
  if (ANALYTICS_ROUTES.some(r => url.pathname.startsWith(r))) {
    event.respondWith(
      caches.open(API_CACHE).then(cache =>
        cache.match(request).then(cached => {
          const network = fetch(request).then(res => {
            if (res.ok) cache.put(request, res.clone())
            return res
          })
          return cached || network
        })
      )
    )
    return
  }

  // ── API routes → Network First, cache fallback ────────────────────────────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            caches.open(API_CACHE).then(cache => cache.put(request, res.clone()))
          }
          return res
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // ── Static assets (scripts, styles, fonts, images) → Cache First ──────────
  // These have content hashes in filenames — safe to cache indefinitely.
  if (
    request.destination === 'script' ||
    request.destination === 'style'  ||
    request.destination === 'font'   ||
    request.destination === 'image'
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(res => {
          if (res.ok) {
            caches.open(ASSET_CACHE).then(cache => cache.put(request, res.clone()))
          }
          return res
        })
      })
    )
    return
  }
})

// ── Background sync ───────────────────────────────────────────────────────────

self.addEventListener('sync', event => {
  if (event.tag === 'sync-marks')      event.waitUntil(notify('SYNC_MARKS'))
  if (event.tag === 'sync-attendance') event.waitUntil(notify('SYNC_ATTENDANCE'))
  if (event.tag === 'sync-records')    event.waitUntil(notify('SYNC_RECORDS'))
})

async function notify(type) {
  const clients = await self.clients.matchAll()
  clients.forEach(c => c.postMessage({ type }))
}

// ── Message handler ───────────────────────────────────────────────────────────
// Allows pages to request a skip-waiting so updates activate faster

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
