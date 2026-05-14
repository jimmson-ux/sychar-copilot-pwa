'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  triggerFeedback,
  loadFeedbackSettings,
  saveFeedbackSettings,
  type FeedbackSettings,
  type FeedbackType,
} from '@/lib/notification-feedback'

export function useNotificationFeedback() {
  const [settings, setSettings] = useState<FeedbackSettings>({
    soundEnabled: true,
    hapticEnabled: true,
    volume: 0.5,
  })

  useEffect(() => {
    setSettings(loadFeedbackSettings())
  }, [])

  const trigger = useCallback((type: FeedbackType) => {
    triggerFeedback(type)
  }, [])

  const update = useCallback((patch: Partial<FeedbackSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      saveFeedbackSettings(next)
      return next
    })
  }, [])

  return { trigger, settings, update }
}
