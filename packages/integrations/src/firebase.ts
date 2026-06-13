// Firebase (web app + Cloud Messaging) — per-school project, config-injected.
// Each school has its OWN Firebase project; pass its config + VAPID key. Returns the
// FCM token for push registration (stored against the user server-side).

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  messagingSenderId: string
  appId: string
  vapidKey?: string
}

// deno-lint-ignore no-explicit-any
let app: any = null

export async function initFirebase(cfg: FirebaseConfig) {
  if (!cfg?.projectId) return null
  try {
    const { initializeApp, getApps } = await import('firebase/app')
    app = getApps().length ? getApps()[0] : initializeApp(cfg)
    return app
  } catch {
    return null
  }
}

/** Request notification permission and return the FCM token (or null). */
export async function getFcmToken(cfg: FirebaseConfig): Promise<string | null> {
  try {
    if (!app) await initFirebase(cfg)
    if (!app || !cfg.vapidKey) return null
    const { getMessaging, getToken } = await import('firebase/messaging')
    const messaging = getMessaging(app)
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return null
    return await getToken(messaging, { vapidKey: cfg.vapidKey })
  } catch {
    return null
  }
}
