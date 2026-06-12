/**
 * Create the PRIVATE `visitor-signatures` Storage bucket (permanent signature store for the
 * gate tablet). Idempotent. Run: node scripts/setup-visitor-signatures-bucket.mjs
 */
import { createClient } from '@supabase/supabase-js'
const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const db = createClient(URL, SKEY, { auth: { persistSession: false } })

const BUCKET = 'visitor-signatures'
const { data: existing } = await db.storage.getBucket(BUCKET)
if (existing) {
  console.log(`bucket "${BUCKET}" already exists (public=${existing.public})`)
} else {
  const { error } = await db.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 2 * 1024 * 1024, // 2 MB — a signature PNG is a few KB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  })
  console.log(error ? `create FAILED: ${error.message}` : `bucket "${BUCKET}" created (private)`)
}
const { data: list } = await db.storage.listBuckets()
console.log('buckets:', (list ?? []).map(b => b.name).join(', '))
