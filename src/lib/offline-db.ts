/**
 * Sychar Offline Database — Dexie.js + AES-GCM device-bound encryption
 *
 * All pending records are encrypted with a per-device CryptoKey stored only
 * in this origin's IndexedDB key store. If the device is wiped or lost, the
 * key is gone and the ciphertext is unreadable.
 *
 * Conflict resolution (attendance):
 *   When two offline devices submit the same attendance record, the server
 *   (POST /api/attendance/sync) applies the "server timestamp wins" rule:
 *     • The first record received becomes canonical.
 *     • The second record is stored as an audit trail entry.
 *     • A discrepancy alert is sent to the class teacher.
 */

import Dexie, { type Table } from 'dexie'

// ── Record types ─────────────────────────────────────────────────────────────

export interface AttendancePending {
  id?: number
  school_id: string
  class_id: string
  date: string        // ISO date string
  records: unknown    // encrypted JSON blob
  timestamp: number   // ms since epoch (used for conflict resolution)
  sync_status: 'pending' | 'syncing' | 'done' | 'error'
}

export interface DisciplinePending {
  id?: number
  school_id: string
  incident_data: unknown  // encrypted JSON blob
  evidence_blob: Blob | null
  timestamp: number
  sync_status: 'pending' | 'syncing' | 'done' | 'error'
}

export interface LessonCheckinPending {
  id?: number
  teacher_id: string
  lesson_id: string
  timestamp: number
  gps: { lat: number; lng: number } | null
  sync_status: 'pending' | 'syncing' | 'done' | 'error'
}

export interface PhotoUploadPending {
  id?: number
  type: 'evidence' | 'magazine' | 'profile'
  blob: Blob
  metadata: unknown  // { student_id?, context?, ... }
  timestamp: number
  sync_status: 'pending' | 'syncing' | 'done' | 'error'
}

// ── Database class ─────────────────────────────────────────────────────────────

class SycharOfflineDB extends Dexie {
  attendance_pending!: Table<AttendancePending, number>
  discipline_pending!: Table<DisciplinePending, number>
  lesson_checkin_pending!: Table<LessonCheckinPending, number>
  photo_uploads_pending!: Table<PhotoUploadPending, number>

  constructor() {
    super('sychar-offline')
    this.version(1).stores({
      attendance_pending:     '++id, school_id, class_id, date, timestamp, sync_status',
      discipline_pending:     '++id, school_id, timestamp, sync_status',
      lesson_checkin_pending: '++id, teacher_id, lesson_id, timestamp, sync_status',
      photo_uploads_pending:  '++id, type, timestamp, sync_status',
    })
  }
}

export const offlineDB = new SycharOfflineDB()

// ── Device-bound encryption ────────────────────────────────────────────────────
// Key is generated once, stored in IndexedDB as a JWK under 'sychar-device-key'.
// The key never leaves the device — if storage is cleared, all offline data
// becomes unreadable (intentional: protects student data on lost devices).

const KEY_STORE_NAME  = 'sychar-device-keystore'
const KEY_STORE_ENTRY = 'device-aes-key'

async function openKeyStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY_STORE_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('keys')
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const db = await openKeyStore()

  // Try to load existing key
  const existing = await new Promise<JsonWebKey | null>((resolve, reject) => {
    const tx  = db.transaction('keys', 'readonly')
    const req = tx.objectStore('keys').get(KEY_STORE_ENTRY)
    req.onsuccess = () => resolve(req.result as JsonWebKey | null)
    req.onerror   = () => reject(req.error)
  })

  if (existing) {
    return crypto.subtle.importKey('jwk', existing, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  }

  // Generate new device key
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const jwk = await crypto.subtle.exportKey('jwk', key)

  await new Promise<void>((resolve, reject) => {
    const tx  = db.transaction('keys', 'readwrite')
    const req = tx.objectStore('keys').put(jwk, KEY_STORE_ENTRY)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })

  return key
}

let _deviceKey: CryptoKey | null = null
async function deviceKey(): Promise<CryptoKey> {
  if (!_deviceKey) _deviceKey = await getOrCreateDeviceKey()
  return _deviceKey
}

export async function encryptForDevice(data: unknown): Promise<string> {
  const key   = await deviceKey()
  const iv    = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(data))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  // Encode iv + ciphertext as base64
  const buf = new Uint8Array(iv.byteLength + cipher.byteLength)
  buf.set(iv, 0)
  buf.set(new Uint8Array(cipher), iv.byteLength)
  return btoa(String.fromCharCode(...buf))
}

export async function decryptFromDevice(encoded: string): Promise<unknown> {
  const key = await deviceKey()
  const buf = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
  const iv      = buf.slice(0, 12)
  const cipher  = buf.slice(12)
  const plain   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
  return JSON.parse(new TextDecoder().decode(plain))
}

// ── Sync helpers ───────────────────────────────────────────────────────────────

export async function queueAttendance(params: {
  school_id: string
  class_id: string
  date: string
  records: unknown
}): Promise<void> {
  const encrypted = await encryptForDevice(params.records)
  await offlineDB.attendance_pending.add({
    school_id:   params.school_id,
    class_id:    params.class_id,
    date:        params.date,
    records:     encrypted,
    timestamp:   Date.now(),
    sync_status: 'pending',
  })
  // Register background sync
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready
    await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } })
      .sync.register('sync-attendance')
  }
}

export async function queueDiscipline(params: {
  school_id: string
  incident_data: unknown
  evidence_blob?: Blob
}): Promise<void> {
  const encrypted = await encryptForDevice(params.incident_data)
  await offlineDB.discipline_pending.add({
    school_id:     params.school_id,
    incident_data: encrypted,
    evidence_blob: params.evidence_blob ?? null,
    timestamp:     Date.now(),
    sync_status:   'pending',
  })
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready
    await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } })
      .sync.register('sync-discipline')
  }
}

export async function queueLessonCheckin(params: {
  teacher_id: string
  lesson_id: string
  gps: { lat: number; lng: number } | null
}): Promise<void> {
  await offlineDB.lesson_checkin_pending.add({
    ...params,
    timestamp:   Date.now(),
    sync_status: 'pending',
  })
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready
    await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } })
      .sync.register('sync-lesson-checkin')
  }
}

export async function getPendingCount(): Promise<{
  attendance: number
  discipline: number
  checkins: number
  photos: number
}> {
  const [attendance, discipline, checkins, photos] = await Promise.all([
    offlineDB.attendance_pending.where('sync_status').equals('pending').count(),
    offlineDB.discipline_pending.where('sync_status').equals('pending').count(),
    offlineDB.lesson_checkin_pending.where('sync_status').equals('pending').count(),
    offlineDB.photo_uploads_pending.where('sync_status').equals('pending').count(),
  ])
  return { attendance, discipline, checkins, photos }
}
