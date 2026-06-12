-- ================================================================
-- GENESIS DELEGATION — principal-delegable QR generation & geofence locking
-- 2026-06-12
--
-- Until now, who could generate the per-class lesson-attendance QR
-- (and who could lock a classroom geofence) was hard-coded to a fixed
-- set of roles in application code. Principals could not delegate the
-- task to a trusted staff member of their choosing.
--
-- This migration introduces a per-staff capability grant:
--   * genesis_delegations          — explicit grants by the principal
--   * tenant_configs.genesis_max_delegates — per-school cap on extra delegates
--                                     (NULL = unlimited; e.g. Oloolaiser = 2)
--   * has_genesis_capability()     — single source of truth used by the API
--                                     and edge functions for authorization.
--
-- The deputy principal (and principal/super_admin) are ALWAYS implicitly
-- allowed and do NOT count against genesis_max_delegates.
-- ================================================================

-- ── 1. Per-school delegate cap ──────────────────────────────────
ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS genesis_max_delegates integer;
COMMENT ON COLUMN public.tenant_configs.genesis_max_delegates IS
  'Max ADDITIONAL Genesis delegates the principal may appoint (beyond deputy/principal). NULL = unlimited.';

-- ── 2. Delegation grants ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.genesis_delegations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid        NOT NULL REFERENCES public.schools(id)        ON DELETE CASCADE,
  staff_id    uuid        NOT NULL REFERENCES public.staff_records(id)  ON DELETE CASCADE,
  capability  text        NOT NULL CHECK (capability IN ('generate_qr','lock_geofence')),
  granted_by  uuid        REFERENCES public.staff_records(id)           ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  is_active   boolean     NOT NULL DEFAULT true
);

-- One active grant per (school, staff, capability). Re-granting reactivates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_genesis_delegation_active
  ON public.genesis_delegations (school_id, staff_id, capability)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_genesis_delegation_school
  ON public.genesis_delegations (school_id, capability, is_active);

ALTER TABLE public.genesis_delegations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS genesis_deleg_admin_all ON public.genesis_delegations;
DROP POLICY IF EXISTS genesis_deleg_self_read ON public.genesis_delegations;
DROP POLICY IF EXISTS genesis_deleg_service   ON public.genesis_delegations;

-- Principal / super_admin of the school manage grants.
CREATE POLICY genesis_deleg_admin_all ON public.genesis_delegations
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','super_admin')
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','super_admin')
  );

-- Any staff may see their own grants (so the UI can show "you can generate QR").
CREATE POLICY genesis_deleg_self_read ON public.genesis_delegations
  FOR SELECT TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND staff_id IN (
      SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY genesis_deleg_service ON public.genesis_delegations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. Capability check — single source of truth ────────────────
-- Returns true when the given staff member may perform the capability:
--   * implicit leadership roles (always), OR
--   * legacy default roles for that capability, OR
--   * an explicit active delegation grant.
CREATE OR REPLACE FUNCTION public.has_genesis_capability(
  p_staff_id  uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_records s
    WHERE s.id = p_staff_id
      AND (
        -- Implicit leadership: always allowed for both capabilities.
        s.sub_role IN ('principal','super_admin','deputy_principal',
                       'deputy_principal_academic','deputy_principal_admin')
        -- Legacy default generators (kept for backwards compatibility).
        OR (p_capability = 'generate_qr'
            AND s.sub_role IN ('deputy_principal','deputy_principal_academic','dean_of_studies'))
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.genesis_delegations d
    WHERE d.staff_id   = p_staff_id
      AND d.capability = p_capability
      AND d.is_active  = true
      AND d.revoked_at IS NULL
  );
$$;

-- ── 4. Relax class_qr_tokens.generator_role CHECK ───────────────
-- The 3-role enum no longer reflects reality now that the principal can
-- delegate QR generation to any staff member. We keep the column (for audit
-- of WHICH role generated each QR) but drop the restrictive CHECK.
ALTER TABLE public.class_qr_tokens
  DROP CONSTRAINT IF EXISTS class_qr_tokens_generator_role_check;

-- ── 5. Widen QR-token RLS to capability holders ─────────────────
-- The previous "qr_deputy_all" policy only allowed the 3 legacy roles +
-- principal/super_admin. Delegated staff write via the service role (API
-- route) so this is belt-and-braces, but we align it with the new model.
DROP POLICY IF EXISTS qr_deputy_all ON public.class_qr_tokens;
CREATE POLICY qr_deputy_all ON public.class_qr_tokens
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.has_genesis_capability(
      (SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text LIMIT 1),
      'generate_qr'
    )
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND public.has_genesis_capability(
      (SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text LIMIT 1),
      'generate_qr'
    )
  );
