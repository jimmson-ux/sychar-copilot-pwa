/**
 * Verify per-school RAG isolation: a query for school A must NEVER return school B chunks.
 * Run: node scripts/verify-rag-isolation.mjs
 *
 * Strategy (no OpenAI needed): take a stored embedding from school A, call
 * match_school_documents_anon with school B's id, and assert every returned chunk
 * actually belongs to school B. Repeats across all school pairs that have embeddings.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://xwgtsldimlrhtgvpnjnd.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4'
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  const { data: schoolsWithEmb } = await db
    .from('document_embeddings')
    .select('school_id')
    .limit(5000)
  const ids = [...new Set((schoolsWithEmb ?? []).map((r) => r.school_id))]
  if (ids.length < 2) {
    console.log(`Only ${ids.length} school(s) have embeddings — need ≥2 to test cross-school isolation.`)
    console.log('Run the RAG backfill for at least two schools, then re-run.')
    return
  }

  let failures = 0
  for (const a of ids) {
    // Grab one embedding from school A.
    const { data: sample } = await db
      .from('document_embeddings')
      .select('id, embedding')
      .eq('school_id', a)
      .not('embedding', 'is', null)
      .limit(1)
      .maybeSingle()
    if (!sample?.embedding) continue

    for (const b of ids) {
      if (b === a) continue
      const { data: matches, error } = await db.rpc('match_school_documents_anon', {
        query_embedding: sample.embedding,
        p_school_id: b,
        match_threshold: 0.0,   // force-return anything to stress the filter
        match_count: 50,
      })
      if (error) { console.error('  RPC error', error.message); failures++; continue }

      const returnedIds = (matches ?? []).map((m) => m.id)
      if (!returnedIds.length) continue
      // Confirm every returned chunk belongs to B, not A.
      const { data: owners } = await db
        .from('document_embeddings')
        .select('id, school_id')
        .in('id', returnedIds)
      const leaked = (owners ?? []).filter((o) => o.school_id !== b)
      if (leaked.length) {
        failures++
        console.error(`  ❌ LEAK: querying school ${b} returned ${leaked.length} chunk(s) from another school!`)
      } else {
        console.log(`  ✓ ${b.slice(0, 8)} isolated from ${a.slice(0, 8)} (${returnedIds.length} chunks, all owned by B)`)
      }
    }
  }

  console.log(failures === 0 ? '\n✅ RAG isolation verified — no cross-school leakage.' : `\n❌ ${failures} isolation failure(s).`)
  if (failures) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
