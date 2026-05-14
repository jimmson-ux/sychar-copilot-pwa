'use client'
import { useEffect } from 'react'
import { triggerFeedback, type FeedbackType } from '@/lib/notification-feedback'

// Listens for PLAY_NOTIFICATION_SOUND messages posted by the service worker push
// handler and plays the corresponding in-page audio + haptic feedback.
export default function NotificationSoundBridge() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'PLAY_NOTIFICATION_SOUND') {
        triggerFeedback((e.data.notificationType as FeedbackType) || 'info')
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
  }, [])

  return null
}
