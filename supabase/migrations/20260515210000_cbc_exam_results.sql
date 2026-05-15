-- ══════════════════════════════════════════════════════════════════════════════
-- Extend exam_results table with CBC performance-level fields
-- Keeps 8-4-4 score field and adds CBC-specific columns
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.exam_results
  ADD COLUMN IF NOT EXISTS curriculum         text DEFAULT '8-4-4'
                                              CHECK (curriculum IN ('8-4-4', 'CBC')),
  ADD COLUMN IF NOT EXISTS performance_level  text
                                              CHECK (performance_level IN ('EE1','EE2','ME1','ME2','AE1','BE1')),
  ADD COLUMN IF NOT EXISTS rubric_data        jsonb;

-- Also ensure the marks table (backend analytics table) has the same
ALTER TABLE IF EXISTS public.marks
  ADD COLUMN IF NOT EXISTS curriculum         text DEFAULT '8-4-4'
                                              CHECK (curriculum IN ('8-4-4', 'CBC')),
  ADD COLUMN IF NOT EXISTS performance_level  text
                                              CHECK (performance_level IN ('EE1','EE2','ME1','ME2','AE1','BE1')),
  ADD COLUMN IF NOT EXISTS rubric_data        jsonb;

-- Backfill curriculum = '8-4-4' for all existing rows
UPDATE public.exam_results SET curriculum = '8-4-4' WHERE curriculum IS NULL;
UPDATE public.marks         SET curriculum = '8-4-4' WHERE curriculum IS NULL;
