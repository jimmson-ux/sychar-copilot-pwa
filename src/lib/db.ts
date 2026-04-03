import { openDB, DBSchema, IDBPDatabase } from 'idb'

interface SycharDB extends DBSchema {
  marks_drafts: {
    key: string
    value: {
      id: string
      student_id: string
      subject: string
      score: number
      exam_type: string
      class_name: string
      teacher_id: string
      created_at: string
      synced: boolean
    }
  }
  attendance_drafts: {
    key: string
    value: {
      id: string
      student_id: string
      date: string
      status: 'present' | 'absent' | 'late'
      class_name: string
      teacher_id: string
      synced: boolean
    }
  }
  records_drafts: {
    key: string
    value: {
      id: string
      teacher_id: string
      class_name: string
      subject: string
      topic: string
      sub_topic: string
      lesson_date: string
      synced: boolean
    }
  }
  students_cache: {
    key: string
    value: {
      id: string
      full_name: string
      admission_number: string
      class_name: string
      stream_name: string
      gender: string
      cached_at: string
    }
    indexes: { 'by-class': string }
  }
  pending_sync: {
    key: string
    value: {
      id: string
      type: 'marks' | 'attendance' | 'records' | 'discipline'
      data: unknown
      attempts: number
      last_attempt: string
      created_at: string
    }
  }
}

let _db: IDBPDatabase<SycharDB> | null = null

export async function getDB(): Promise<IDBPDatabase<SycharDB>> {
  if (_db) return _db

  _db = await openDB<SycharDB>('sychar-db', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('marks_drafts')) {
        db.createObjectStore('marks_drafts', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('attendance_drafts')) {
        db.createObjectStore('attendance_drafts', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('records_drafts')) {
        db.createObjectStore('records_drafts', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('students_cache')) {
        const studentStore = db.createObjectStore('students_cache', { keyPath: 'id' })
        studentStore.createIndex('by-class', 'class_name')
      }
      if (!db.objectStoreNames.contains('pending_sync')) {
        db.createObjectStore('pending_sync', { keyPath: 'id' })
      }
    }
  })

  return _db
}

export async function saveMarkDraft(mark: SycharDB['marks_drafts']['value']) {
  const db = await getDB()
  await db.put('marks_drafts', { ...mark, synced: false })
}

export async function getUnsyncedMarks() {
  const db = await getDB()
  const all = await db.getAll('marks_drafts')
  return all.filter(m => !m.synced)
}

export async function markDraftSynced(id: string) {
  const db = await getDB()
  const item = await db.get('marks_drafts', id)
  if (item) await db.put('marks_drafts', { ...item, synced: true })
}

export async function cacheStudents(students: SycharDB['students_cache']['value'][]) {
  const db = await getDB()
  const tx = db.transaction('students_cache', 'readwrite')
  await Promise.all(students.map(s => tx.store.put({ ...s, cached_at: new Date().toISOString() })))
  await tx.done
}

export async function getCachedStudentsByClass(className: string) {
  const db = await getDB()
  return db.getAllFromIndex('students_cache', 'by-class', className)
}

export async function saveAttendanceDraft(record: SycharDB['attendance_drafts']['value']) {
  const db = await getDB()
  await db.put('attendance_drafts', { ...record, synced: false })
}

export async function getUnsyncedAttendance() {
  const db = await getDB()
  const all = await db.getAll('attendance_drafts')
  return all.filter(r => !r.synced)
}

export async function addToSyncQueue(type: string, data: unknown) {
  const db = await getDB()
  await db.put('pending_sync', {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: type as 'marks' | 'attendance' | 'records' | 'discipline',
    data,
    attempts: 0,
    last_attempt: new Date().toISOString(),
    created_at: new Date().toISOString()
  })
}

export async function processSyncQueue(supabase: { from: (table: string) => { upsert: (data: unknown) => Promise<unknown>; insert: (data: unknown) => Promise<unknown> } }) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return

  const db = await getDB()
  const queue = await db.getAll('pending_sync')

  for (const item of queue) {
    const backoffMs = Math.min(1000 * Math.pow(2, item.attempts), 30000)
    const lastAttempt = new Date(item.last_attempt).getTime()
    if (Date.now() - lastAttempt < backoffMs) continue

    try {
      if (item.type === 'marks') {
        await supabase.from('marks').upsert(item.data)
      } else if (item.type === 'attendance') {
        await supabase.from('attendance').upsert(item.data)
      } else if (item.type === 'records') {
        await supabase.from('records_of_work').insert(item.data)
      } else if (item.type === 'discipline') {
        await supabase.from('discipline_records').insert(item.data)
      }
      await db.delete('pending_sync', item.id)
    } catch {
      await db.put('pending_sync', {
        ...item,
        attempts: item.attempts + 1,
        last_attempt: new Date().toISOString()
      })
    }
  }
}

export async function getPendingSyncCount(): Promise<number> {
  try {
    const db = await getDB()
    const queue = await db.getAll('pending_sync')
    return queue.length
  } catch {
    return 0
  }
}
