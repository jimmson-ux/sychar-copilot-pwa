// Firebase not configured — stub service worker.
// Set NEXT_PUBLIC_FIREBASE_* env vars and re-run build to enable FCM.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
