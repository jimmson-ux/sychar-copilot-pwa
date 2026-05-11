-- Add slug column to tenant_configs so parents can log in by school name
-- e.g. "NKOROI" or "1834" both resolve to Nkoroi Senior School

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS slug text;

-- Case-insensitive unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_slug
  ON public.tenant_configs (lower(slug))
  WHERE slug IS NOT NULL;

-- Seed Nkoroi (school_short_code = '1834')
UPDATE public.tenant_configs
SET slug = 'nkoroi'
WHERE school_short_code = '1834'
  AND slug IS NULL;

-- Seed any other schools that have a name but no slug
-- (slug = lowercase first word of name, used as fallback)
UPDATE public.tenant_configs
SET slug = lower(regexp_replace(split_part(name, ' ', 1), '[^a-zA-Z0-9]', '', 'g'))
WHERE slug IS NULL
  AND name IS NOT NULL
  AND name <> '';
