// Per-school RAG: embed, index and retrieve document chunks.
//
// Embeddings: OpenAI text-embedding-3-small (1536-dim, matches the
// document_embeddings.embedding column). Requires OPENAI_API_KEY.
//
// Isolation: every insert stamps school_id; every retrieval calls
// match_school_documents_anon(query_embedding, school_id, ...) so a school can
// NEVER see another school's chunks. Verified by scripts/verify-rag-isolation.mjs.

import { createAdminSupabaseClient } from '@/lib/supabase-server'

const EMBED_MODEL = 'text-embedding-3-small'
const EMBED_URL = 'https://api.openai.com/v1/embeddings'

/** Split text into ~1000-char chunks on paragraph/sentence boundaries. */
export function chunkText(text: string, maxLen = 1000): string[] {
  const clean = (text ?? '').replace(/\r/g, '').trim()
  if (!clean) return []
  if (clean.length <= maxLen) return [clean]
  const paras = clean.split(/\n{2,}/)
  const chunks: string[] = []
  let buf = ''
  for (const p of paras) {
    if ((buf + '\n\n' + p).length > maxLen) {
      if (buf) chunks.push(buf.trim())
      if (p.length > maxLen) {
        // hard-split a very long paragraph
        for (let i = 0; i < p.length; i += maxLen) chunks.push(p.slice(i, i + maxLen).trim())
        buf = ''
      } else {
        buf = p
      }
    } else {
      buf = buf ? `${buf}\n\n${p}` : p
    }
  }
  if (buf.trim()) chunks.push(buf.trim())
  return chunks
}

export async function embedText(input: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input }),
  })
  if (!res.ok) return null
  const data = await res.json() as { data?: { embedding: number[] }[] }
  return data.data?.[0]?.embedding ?? null
}

async function embedBatch(inputs: string[]): Promise<number[][] | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key || !inputs.length) return null
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  })
  if (!res.ok) return null
  const data = await res.json() as { data?: { embedding: number[]; index: number }[] }
  const out = (data.data ?? []).sort((a, b) => a.index - b.index).map((d) => d.embedding)
  return out.length === inputs.length ? out : null
}

export interface IndexDocOpts {
  schoolId: string
  sourceType: string             // 'lesson_plan' | 'record_of_work' | 'school_rules' | 'nurse_note' | 'notice' | ...
  text: string
  sourceId?: string
  documentType?: string
  metadata?: Record<string, unknown>
}

/**
 * Index one logical document (chunk + embed + insert), replacing any prior chunks
 * for the same (school, source_type, source_id) so re-indexing is idempotent.
 */
export async function indexSchoolDocument(opts: IndexDocOpts): Promise<{ chunks: number }> {
  const svc = createAdminSupabaseClient()
  const chunks = chunkText(opts.text)
  if (!chunks.length) return { chunks: 0 }

  const embeddings = await embedBatch(chunks)
  if (!embeddings) return { chunks: 0 }

  // Idempotency: clear prior chunks for this source.
  if (opts.sourceId) {
    await svc.from('document_embeddings').delete()
      .eq('school_id', opts.schoolId)
      .eq('source_type', opts.sourceType)
      .eq('source_id', opts.sourceId)
  }

  const rows = chunks.map((chunk_text, i) => ({
    school_id: opts.schoolId,
    source_type: opts.sourceType,
    source_id: opts.sourceId ?? null,
    document_type: opts.documentType ?? 'manual',
    chunk_text,
    chunk_index: i,
    metadata: opts.metadata ?? {},
    embedding: embeddings[i] as unknown as string,
  }))
  const { error } = await svc.from('document_embeddings').insert(rows)
  if (error) { console.error('[rag] index insert', error); return { chunks: 0 } }
  return { chunks: rows.length }
}

export interface RetrievedChunk {
  chunk_text: string
  source_type: string
  similarity: number
  metadata: Record<string, unknown> | null
}

/**
 * Retrieve the most relevant chunks for a query, STRICTLY scoped to one school.
 * Returns [] if embeddings are unavailable (AI still works without RAG).
 */
export async function retrieveSchoolContext(
  schoolId: string,
  query: string,
  opts: { matchCount?: number; threshold?: number; sourceTypes?: string[] } = {},
): Promise<RetrievedChunk[]> {
  const emb = await embedText(query)
  if (!emb) return []
  const svc = createAdminSupabaseClient()
  const { data, error } = await svc.rpc('match_school_documents_anon', {
    query_embedding: emb as unknown as string,
    p_school_id: schoolId,
    match_threshold: opts.threshold ?? 0.7,
    match_count: opts.matchCount ?? 6,
  })
  if (error) { console.error('[rag] retrieve', error); return [] }
  let rows = (data as RetrievedChunk[] ?? [])
  if (opts.sourceTypes?.length) rows = rows.filter((r) => opts.sourceTypes!.includes(r.source_type))
  return rows
}

/** Format retrieved chunks as a compact context block for a prompt. */
export function formatRagContext(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return ''
  return 'Relevant school records:\n' +
    chunks.map((c, i) => `[${i + 1}] (${c.source_type}) ${c.chunk_text}`).join('\n') + '\n'
}
