-- ================================================================
-- Relax notices.posted_by — 2026-06-14
-- The platform's source of truth for staff is `staff_records` (+ auth users), not the
-- legacy `profiles` table (which is enum-limited and unpopulated). notices.posted_by was
-- NOT NULL + FK→profiles, which blocked staff from posting notices. Drop the FK and the
-- NOT NULL so notices can be authored with staff attribution (or null). The Notification
-- Centre itself uses staff_notifications/_reads (no profiles dependency).
-- ================================================================
ALTER TABLE public.notices DROP CONSTRAINT IF EXISTS notices_posted_by_fkey;
ALTER TABLE public.notices ALTER COLUMN posted_by DROP NOT NULL;
