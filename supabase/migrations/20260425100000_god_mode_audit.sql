-- God Mode audit log — super admin action trail

CREATE TABLE IF NOT EXISTS public.god_mode_audit (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id     uuid,
  actor_email  text,
  action       text NOT NULL,
  entity_type  text,
  entity_id    text,
  meta         jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gma_actor    ON public.god_mode_audit(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gma_action   ON public.god_mode_audit(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gma_created  ON public.god_mode_audit(created_at DESC);

-- No RLS: only accessible via service role
