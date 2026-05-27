-- FCM tokens table for Firebase Cloud Messaging (parallel to VAPID push_subscriptions).
-- Supports staff and parent PWA tokens across web/android/ios platforms.

CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid        NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  staff_id    uuid                    REFERENCES public.staff_records(id) ON DELETE CASCADE,
  parent_id   uuid                    REFERENCES public.students(id)      ON DELETE CASCADE,
  fcm_token   text        NOT NULL,
  platform    text        NOT NULL DEFAULT 'web' CHECK (platform IN ('web', 'android', 'ios')),
  is_active   boolean     NOT NULL DEFAULT true,
  last_seen   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- one row per (staff_member, device token) pair
  CONSTRAINT fcm_one_token_per_staff_device UNIQUE (staff_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_school_active
  ON public.fcm_tokens (school_id, is_active);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_staff
  ON public.fcm_tokens (staff_id)
  WHERE staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_parent
  ON public.fcm_tokens (parent_id)
  WHERE parent_id IS NOT NULL;

ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Staff can read/upsert/delete their own tokens (user_id is text in staff_records)
CREATE POLICY "fcm_tokens_staff_self"
  ON public.fcm_tokens
  FOR ALL
  USING (
    staff_id IS NOT NULL
    AND staff_id IN (
      SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    staff_id IS NOT NULL
    AND staff_id IN (
      SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text
    )
  );

-- service_role bypasses RLS — used by edge functions and server-side upserts
