/**
 * Upload the PCEA Upper Matasia crest to public storage and set schools.logo_url +
 * tenant_configs.logo_url so branding (use-school-branding) + watermarked PDFs use it.
 * Run: node scripts/upload-matasia-logo.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const URL  = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const SID  = 'd380a396-c3dc-47a8-a1c3-0aa267c77869'
const BUCKET = 'school-gallery' // public
const PATH = 'branding/pcea-matasia-logo.jpg'
const LOGO = 'C:/Users/DELL/Downloads/PCEA UPPER MATASIA SCHOOL LOGO.jpg'

const db = createClient(URL, SKEY, { auth: { persistSession: false } })
const bytes = readFileSync(LOGO)

const { error: upErr } = await db.storage.from(BUCKET).upload(PATH, bytes, { contentType: 'image/jpeg', upsert: true })
if (upErr) { console.error('upload:', upErr.message); process.exit(1) }
const { data: pub } = db.storage.from(BUCKET).getPublicUrl(PATH)
const logoUrl = pub.publicUrl
console.log('logo public URL:', logoUrl)

const { error: sErr } = await db.from('schools').update({ logo_url: logoUrl }).eq('id', SID)
console.log('schools.logo_url:', sErr ? 'ERR ' + sErr.message : 'set ✅')
const { error: tErr } = await db.from('tenant_configs').update({ logo_url: logoUrl }).eq('school_id', SID)
console.log('tenant_configs.logo_url:', tErr ? 'ERR ' + tErr.message : 'set ✅')

// verify reachable
const r = await fetch(logoUrl, { method: 'HEAD' })
console.log('fetch logo:', r.status, r.headers.get('content-type'))
process.exit(0)
