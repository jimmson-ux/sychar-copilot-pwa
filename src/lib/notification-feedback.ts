export type FeedbackType =
  | 'critical'
  | 'warning'
  | 'info'
  | 'message'
  | 'login_approval'
  | 'success'
  | 'error'

export interface FeedbackSettings {
  soundEnabled: boolean
  hapticEnabled: boolean
  volume: number // 0–1
}

const STORAGE_KEY = 'sychar_notification_feedback'

// Distinct vibration patterns per severity — used both in the SW showNotification
// and client-side via navigator.vibrate()
export const VIBRATE_PATTERNS: Record<FeedbackType, number[]> = {
  critical:       [200, 100, 200, 100, 500],
  warning:        [100, 100, 100],
  info:           [60],
  message:        [80, 60, 80],
  login_approval: [300, 100, 300, 100, 300],
  success:        [30, 50, 50],
  error:          [400],
}

export function loadFeedbackSettings(): FeedbackSettings {
  if (typeof window === 'undefined') return { soundEnabled: true, hapticEnabled: true, volume: 0.5 }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { soundEnabled: true, hapticEnabled: true, volume: 0.5, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { soundEnabled: true, hapticEnabled: true, volume: 0.5 }
}

export function saveFeedbackSettings(s: FeedbackSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

function vibrate(type: FeedbackType): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  try { navigator.vibrate(VIBRATE_PATTERNS[type] ?? [100]) } catch { /* ignore */ }
}

// Procedurally generated tones via Web Audio API — no extra audio files required.
function playTone(type: FeedbackType, volume: number): void {
  try {
    const AC =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()

    function beep(
      freq: number,
      startOffset: number,
      duration: number,
      wave: OscillatorType = 'sine',
      vol = volume * 0.3,
    ): void {
      const osc = ctx.createOscillator()
      const g   = ctx.createGain()
      osc.type            = wave
      osc.frequency.value = freq
      const t0 = ctx.currentTime + startOffset
      g.gain.setValueAtTime(vol, t0)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
      osc.connect(g)
      g.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + duration)
    }

    switch (type) {
      case 'critical':
        // Urgent rising double burst
        beep(880,  0,    0.15, 'square', volume * 0.35)
        beep(1108, 0.22, 0.2,  'square', volume * 0.4)
        break
      case 'warning':
        // Double pulse
        beep(660, 0,    0.12, 'sine', volume * 0.3)
        beep(660, 0.18, 0.12, 'sine', volume * 0.3)
        break
      case 'info':
        // Single soft note
        beep(440, 0, 0.25, 'sine', volume * 0.2)
        break
      case 'message':
        // Two-note ascending chime
        beep(523, 0,    0.12, 'sine', volume * 0.28)
        beep(659, 0.14, 0.15, 'sine', volume * 0.28)
        break
      case 'login_approval':
        // Triple firm pulse — demands attention
        beep(880, 0,    0.12, 'sine', volume * 0.4)
        beep(880, 0.17, 0.12, 'sine', volume * 0.4)
        beep(880, 0.34, 0.18, 'sine', volume * 0.45)
        break
      case 'success':
        // Ascending arpeggio C-E-G
        beep(523, 0,    0.1,  'sine', volume * 0.25)
        beep(659, 0.11, 0.1,  'sine', volume * 0.25)
        beep(784, 0.22, 0.15, 'sine', volume * 0.25)
        break
      case 'error':
        // Descending dissonant pair
        beep(440, 0,    0.15, 'sawtooth', volume * 0.25)
        beep(330, 0.18, 0.15, 'sawtooth', volume * 0.25)
        break
    }

    setTimeout(() => ctx.close(), 2000)
  } catch { /* AudioContext not available */ }
}

export function triggerFeedback(type: FeedbackType): void {
  const s = loadFeedbackSettings()
  if (s.hapticEnabled) vibrate(type)
  if (s.soundEnabled)  playTone(type, s.volume)
}
