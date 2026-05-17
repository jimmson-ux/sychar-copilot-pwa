-- ================================================================
-- Reset department = NULL for all teaching staff currently set to
-- 'Administration' (the seed default). This makes them available
-- for HOD assignment on the HOD dashboard, which filters by
-- department IS NULL to find the unassigned teacher pool.
--
-- class_teacher, subject_teacher, form_principal_* — these roles
-- belong in HOD subject departments, not "Administration".
-- The non-teaching roles (principal, accountant, etc.) already have
-- department set correctly and are NOT touched.
-- ================================================================

UPDATE public.staff_records
SET    department = NULL
WHERE  sub_role IN (
         'class_teacher',
         'subject_teacher',
         'teacher',
         'form_principal_form4',
         'form_principal_grade10',
         'dean_of_studies',
         'deputy_dean_of_studies'
       )
  AND  department = 'Administration';
