-- ══════════════════════════════════════════════════════════════════════════════
-- Fee categories + invoices for waterfall payment allocation
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fee_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name        text NOT NULL,
  priority    int  NOT NULL DEFAULT 10, -- lower number paid first
  description text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (school_id, name)
);
ALTER TABLE public.fee_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fee_cat_school" ON public.fee_categories
  USING (school_id = get_my_school_id());

-- Seed default categories for every school (ran once per migration)
-- Schools can customise after the fact via the dashboard.
INSERT INTO public.fee_categories (school_id, name, priority, description)
SELECT
  s.id,
  cat.name,
  cat.priority,
  cat.description
FROM public.schools s
CROSS JOIN (VALUES
  ('Activity Fee',      1, 'Sports, clubs and extracurricular activities'),
  ('Tuition Fee',       2, 'Government-gazetted tuition charges'),
  ('Boarding Fee',      3, 'Accommodation, meals and utilities'),
  ('Uniform/Books',     4, 'School uniform and textbooks'),
  ('Exam/KNEC Fee',     5, 'National examination and registration levies'),
  ('Transport',         6, 'School bus / matatu allowance'),
  ('Miscellaneous',     9, 'Other school levies')
) AS cat(name, priority, description)
ON CONFLICT (school_id, name) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Invoices: one row per student per fee category per term
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  category_id   uuid REFERENCES public.fee_categories(id),
  category_name text NOT NULL DEFAULT 'General',
  amount_due    numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_due >= 0),
  amount_paid   numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  term          text,
  academic_year int,
  due_date      date,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_school" ON public.invoices
  USING (school_id = get_my_school_id());
CREATE INDEX IF NOT EXISTS invoices_student_idx ON public.invoices(student_id);
CREATE INDEX IF NOT EXISTS invoices_school_term ON public.invoices(school_id, term, academic_year);

-- ──────────────────────────────────────────────────────────────────────────────
-- Bank statement imports: audit log for CSV uploads
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_statement_imports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  imported_by  uuid,
  row_count    int NOT NULL DEFAULT 0,
  matched      int NOT NULL DEFAULT 0,
  unmatched    int NOT NULL DEFAULT 0,
  total_credit numeric(14,2) DEFAULT 0,
  allocated    numeric(14,2) DEFAULT 0,
  file_name    text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bsi_school" ON public.bank_statement_imports
  USING (school_id = get_my_school_id());

-- ──────────────────────────────────────────────────────────────────────────────
-- Payment allocations: track how each payment was spread across categories
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  invoice_id    uuid REFERENCES public.invoices(id),
  import_id     uuid REFERENCES public.bank_statement_imports(id),
  category_name text NOT NULL,
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  transaction_ref text,
  transaction_date date,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pa_school" ON public.payment_allocations
  USING (school_id = get_my_school_id());
CREATE INDEX IF NOT EXISTS pa_student_idx ON public.payment_allocations(student_id);
