CREATE TABLE IF NOT EXISTS public.mpesa_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  phone_number  text NOT NULL,
  amount        numeric(10,2) NOT NULL,
  mpesa_ref     text,
  description   text,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','success','failed')),
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mpesa_school_isolation" ON public.mpesa_transactions
  USING (school_id = get_my_school_id());
