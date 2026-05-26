-- ================================================================
-- DROP STUDENT QR ATTENDANCE — 2026-05-26
--
-- Removes student QR token and QR-scan attendance tables.
-- Feature removed: teacher scans student QR per lesson.
-- Teacher attendance (class_qr_tokens / teacher_attendance_scans)
-- is unaffected.
-- ================================================================

DROP TABLE IF EXISTS public.daily_attendance_summary CASCADE;
DROP TABLE IF EXISTS public.student_qr_attendance    CASCADE;

ALTER TABLE public.students
  DROP COLUMN IF EXISTS qr_token;
