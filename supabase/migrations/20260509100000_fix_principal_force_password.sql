-- Clear force_password_change for the Nkoroi principal.
-- Root cause of "account linked, but could not set password" error:
-- The flag was set to true during initial setup, but Supabase rejects
-- same-password resets so the flag could never be cleared — login loop.
UPDATE public.staff_records
SET    force_password_change = false
WHERE  school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND  sub_role  = 'principal';
