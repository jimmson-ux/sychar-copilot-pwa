-- RAG vector store: school-scoped document embeddings + similarity search RPC
-- Requires pgvector extension (available on Supabase by default).

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------
-- document_embeddings  (one row per text chunk)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_embeddings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL,
  source_type   text NOT NULL,   -- 'upload' | 'lesson_plan' | 'exam_result' | 'scheme'
  source_id     text,            -- optional FK to originating record id
  document_type text,            -- 'pdf' | 'excel' | 'csv' | 'jpeg' | 'manual'
  chunk_text    text NOT NULL,
  chunk_index   int  DEFAULT 0,
  metadata      jsonb,           -- { filename, subject, grade, term, uploader_id, ... }
  embedding     vector(1536),    -- text-embedding-3-small dimensions
  created_at    timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.document_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emb_select_school" ON public.document_embeddings
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "emb_insert_school" ON public.document_embeddings
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "emb_delete_school" ON public.document_embeddings
  FOR DELETE TO authenticated USING (school_id = get_my_school_id());

-- ivfflat cosine-distance index (lists=100 good for up to ~1M rows)
CREATE INDEX IF NOT EXISTS emb_ivfflat_cosine
  ON public.document_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS emb_school_source
  ON public.document_embeddings (school_id, source_type);

-- ---------------------------------------------------------------
-- match_school_documents  — school-scoped cosine similarity search
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_school_documents(
  query_embedding vector(1536),
  p_school_id     uuid,
  match_threshold float   DEFAULT 0.70,
  match_count     int     DEFAULT 6
)
RETURNS TABLE (
  id          uuid,
  chunk_text  text,
  metadata    jsonb,
  source_type text,
  similarity  float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET row_security = off
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.id,
    de.chunk_text,
    de.metadata,
    de.source_type,
    1 - (de.embedding <=> query_embedding) AS similarity
  FROM public.document_embeddings de
  WHERE de.school_id = p_school_id
    AND de.embedding IS NOT NULL
    AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_school_documents TO authenticated;

-- ---------------------------------------------------------------
-- match_school_documents_anon — same but accepts school_id from caller
-- (used by service-role server functions that operate across schools)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_school_documents_anon(
  query_embedding vector(1536),
  p_school_id     uuid,
  match_threshold float  DEFAULT 0.70,
  match_count     int    DEFAULT 6
)
RETURNS TABLE (
  id          uuid,
  chunk_text  text,
  metadata    jsonb,
  source_type text,
  similarity  float
)
LANGUAGE sql
SECURITY DEFINER
SET row_security = off
AS $$
  SELECT
    de.id,
    de.chunk_text,
    de.metadata,
    de.source_type,
    1 - (de.embedding <=> query_embedding) AS similarity
  FROM public.document_embeddings de
  WHERE de.school_id = p_school_id
    AND de.embedding IS NOT NULL
    AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_school_documents_anon TO service_role;
