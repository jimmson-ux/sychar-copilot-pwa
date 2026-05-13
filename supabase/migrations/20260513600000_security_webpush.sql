-- ============================================================
-- MIGRATION: Security, WebPush subscriptions, TOTP, Passkeys,
-- financial security alerts, KRA P9 records
-- ============================================================

-- WebPush subscription storage (user devices opting in to push alerts)
-- Extends the existing push_recipient flag on staff_records with full
-- endpoint metadata required by the Web Push Protocol (RFC 8030)
CREATE TABLE IF NOT EXISTS public.pwa_webpush_subscriptions (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id   uuid  REFERENCES public.schools(id) ON DELETE CASCADE,
  endpoint    text  NOT NULL,
  p256dh      text  NOT NULL,
  auth_key    text  NOT NULL,
  user_agent  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  CONSTRAINT unique_user_endpoint UNIQUE (user_id, endpoint)
);

-- Principal TOTP secret for zero-cost AIE signing
CREATE TABLE IF NOT EXISTS public.principal_security_profiles (
  id                       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  totp_secret_encrypted    text,
  totp_enabled             boolean NOT NULL DEFAULT false,
  backup_codes_json        jsonb,
  created_at               timestamptz DEFAULT now()
);

-- WebAuthn passkey credentials (Phase 2 — device-PIN signing)
CREATE TABLE IF NOT EXISTS public.passkey_credentials (
  id             uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id  text  NOT NULL UNIQUE,
  public_key     text  NOT NULL,
  counter        int   NOT NULL DEFAULT 0,
  device_type    text,
  created_at     timestamptz DEFAULT now()
);

-- Financial security alerts (unauthorized debits, vote-head violations)
CREATE TABLE IF NOT EXISTS public.financial_security_alerts (
  id                   uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid  NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  alert_level          text  NOT NULL DEFAULT 'MEDIUM'
    CHECK (alert_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  alert_type           text  NOT NULL,
  bank_account_id      uuid  REFERENCES public.bank_accounts(id),
  aie_requisition_id   uuid  REFERENCES public.financial_aie_requisitions(id),
  transaction_reference text,
  discrepancy_amount   numeric(14,2),
  description          text  NOT NULL,
  resolution_status    text  NOT NULL DEFAULT 'Open'
    CHECK (resolution_status IN ('Open','Investigated_Resolved')),
  audit_notes          text,
  resolved_by          uuid  REFERENCES auth.users(id),
  resolved_at          timestamptz,
  webpush_sent         boolean NOT NULL DEFAULT false,
  created_at           timestamptz DEFAULT now()
);

-- KRA P9 annual records for casual employees
CREATE TABLE IF NOT EXISTS public.casual_p9_records (
  id                   uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id          uuid  NOT NULL REFERENCES public.casual_employees(id) ON DELETE CASCADE,
  school_id            uuid  NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  tax_year             int   NOT NULL,
  aggregated_gross     numeric(14,2) NOT NULL DEFAULT 0,
  aggregated_paye      numeric(14,2) NOT NULL DEFAULT 0,
  aggregated_nssf      numeric(14,2) NOT NULL DEFAULT 0,
  aggregated_shif      numeric(14,2) NOT NULL DEFAULT 0,
  pdf_storage_url      text,
  generated_at         timestamptz DEFAULT now(),
  UNIQUE (employee_id, tax_year)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_webpush_user_endpoint
  ON public.pwa_webpush_subscriptions (user_id, endpoint);
CREATE INDEX IF NOT EXISTS idx_webpush_school
  ON public.pwa_webpush_subscriptions (school_id);
CREATE INDEX IF NOT EXISTS idx_security_alerts_open
  ON public.financial_security_alerts (school_id, resolution_status)
  WHERE resolution_status = 'Open';
CREATE INDEX IF NOT EXISTS idx_p9_year
  ON public.casual_p9_records (employee_id, tax_year);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.pwa_webpush_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.principal_security_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_credentials          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_security_alerts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casual_p9_records            ENABLE ROW LEVEL SECURITY;

-- WebPush: users manage their own subscriptions
CREATE POLICY "webpush_owner" ON public.pwa_webpush_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Principal TOTP: owner only
CREATE POLICY "totp_owner" ON public.principal_security_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Passkeys: owner only
CREATE POLICY "passkey_owner" ON public.passkey_credentials FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Security alerts: school-scoped, admin roles read; principal resolves
CREATE POLICY "alerts_read" ON public.financial_security_alerts FOR SELECT TO authenticated
  USING (school_id = get_my_school_id() AND is_admin_role());
CREATE POLICY "alerts_admin_insert" ON public.financial_security_alerts FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id());
CREATE POLICY "alerts_principal_update" ON public.financial_security_alerts FOR UPDATE TO authenticated
  USING (school_id = get_my_school_id() AND is_admin_role());

-- P9 records: school admin only
CREATE POLICY "p9_admin_read" ON public.casual_p9_records FOR SELECT TO authenticated
  USING (school_id = get_my_school_id() AND is_admin_role());
CREATE POLICY "p9_admin_write" ON public.casual_p9_records FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id() AND is_admin_role());
