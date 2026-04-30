-- Add slug + features columns to tenant_configs
ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS slug text
    CHECK (slug ~ '^[a-z0-9][a-z0-9\-]{0,62}[a-z0-9]$'),
  ADD COLUMN IF NOT EXISTS features jsonb DEFAULT '{}';

-- Partial unique index — NULL slugs allowed during onboarding
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_slug
  ON public.tenant_configs(slug) WHERE slug IS NOT NULL;

-- Seed Nkoroi
UPDATE public.tenant_configs
  SET slug = 'nkoroi', features = COALESCE(features, '{}')
  WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
    AND slug IS NULL;

-- Look up school_id from slug
CREATE OR REPLACE FUNCTION public.get_school_id_by_slug(p_slug text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.tenant_configs WHERE slug = lower(p_slug) LIMIT 1;
$$;

-- Full tenant row from slug (used by middleware / server components)
CREATE OR REPLACE FUNCTION public.get_tenant_by_slug(p_slug text)
RETURNS TABLE(
  school_id        uuid,
  name             text,
  slug             text,
  features         jsonb,
  school_short_code text,
  theme            jsonb,
  logo_url         text,
  county           text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id, name, slug, features,
         school_short_code::text, theme, logo_url, county
  FROM public.tenant_configs
  WHERE slug = lower(p_slug)
  LIMIT 1;
$$;

-- Auto-generate unique slug from school name (first word, lowercased)
-- Collision → append -2, -3 etc.
CREATE OR REPLACE FUNCTION public.generate_slug_from_name(p_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_base      text;
  v_candidate text;
  v_counter   integer := 0;
BEGIN
  v_base := lower(regexp_replace(
    split_part(trim(p_name), ' ', 1),
    '[^a-z0-9]', '', 'g'));
  v_candidate := v_base;
  WHILE EXISTS (SELECT 1 FROM public.tenant_configs WHERE slug = v_candidate) LOOP
    v_counter   := v_counter + 1;
    v_candidate := v_base || '-' || v_counter;
  END LOOP;
  RETURN v_candidate;
END;
$$;
