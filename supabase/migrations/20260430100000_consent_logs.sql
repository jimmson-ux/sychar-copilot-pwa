-- Consent version registry
CREATE TABLE IF NOT EXISTS public.consent_versions (
  id           text PRIMARY KEY,
  title        text NOT NULL,
  summary      text NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.consent_versions (id, title, summary)
VALUES (
  'v1.0',
  'Sychar Parent Portal — Data Processing Consent',
  'We process your child''s school data to provide the Sychar Parent Portal. You may withdraw consent at any time by contacting privacy@sychar.co.ke.'
)
ON CONFLICT (id) DO NOTHING;

-- Immutable consent audit trail (INSERT only for authenticated; service_role has full access)
CREATE TABLE IF NOT EXISTS public.consent_logs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id       text        NOT NULL,  -- JWT sub: phone number or email
  school_id       uuid        NOT NULL,
  consent_version text        NOT NULL REFERENCES public.consent_versions(id),
  action          text        NOT NULL CHECK (action IN ('granted', 'withdrawn')),
  ip_address      text,
  user_agent      text,
  granted_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_logs_parent
  ON public.consent_logs(parent_id, school_id, granted_at DESC);

ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consent_service"
  ON public.consent_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated callers may only INSERT (immutable by design — no UPDATE/DELETE)
CREATE POLICY "consent_insert"
  ON public.consent_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Helper: is the most recent consent action 'granted'?
CREATE OR REPLACE FUNCTION public.has_valid_consent(p_parent_id text, p_school_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action text;
BEGIN
  SELECT action INTO v_action
  FROM public.consent_logs
  WHERE parent_id = p_parent_id
    AND school_id = p_school_id
  ORDER BY granted_at DESC
  LIMIT 1;
  RETURN COALESCE(v_action = 'granted', false);
END;
$$;
