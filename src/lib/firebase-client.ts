'use client'

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApps()[0]! : initializeApp(firebaseConfig)
}

function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null
  try {
    return getMessaging(getFirebaseApp())
  } catch {
    return null
  }
}

/** Returns the FCM registration token, or null if not available. */
export async function requestFCMToken(): Promise<string | null> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
  if (!vapidKey) return null

  const messaging = getFirebaseMessaging()
  if (!messaging) return null

  try {
    return await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js'),
    })
  } catch (err) {
    console.warn('[firebase-client] getToken failed:', err)
    return null
  }
}

/** Listen for foreground messages. Returns the unsubscribe function. */
export function onForegroundMessage(handler: (payload: unknown) => void): () => void {
  const messaging = getFirebaseMessaging()
  if (!messaging) return () => {}
  return onMessage(messaging, handler)
}
