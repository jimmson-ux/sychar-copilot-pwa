-- ================================================================
-- G&C STUDENT-WELFARE ACCESS — all schools · 2026-06-13 · Sprint 4
--
-- The Guidance & Counselling counsellor must see ACADEMIC + DISCIPLINE + attendance
-- + clinic signals at will to run the Student Welfare Hub. discipline_records and
-- attendance_records are already school-readable; marks is NOT (class-teacher +
-- leadership only). Grant the counsellor read access to marks for their own school.
-- (Confidential counselling notes stay counsellor-only via safeguard_cases RLS.)
-- ================================================================

DROP POLICY IF EXISTS marks_counselor_select ON public.marks;
CREATE POLICY marks_counselor_select ON public.marks
  FOR SELECT TO authenticated
  USING (
    public.get_my_role() = 'guidance_counselling'
    AND class_id IN (SELECT id FROM public.classes WHERE school_id = public.get_my_school_id())
  );
