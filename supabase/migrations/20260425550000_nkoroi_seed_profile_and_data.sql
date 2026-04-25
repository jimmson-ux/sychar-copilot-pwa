-- ============================================================
-- Seed school admin profile + marks/discipline/notices
-- Uses peromark24@gmail.com auth user as the school principal
-- ============================================================

-- ── Seed admin profile ────────────────────────────────────────────────────────
DO $$ BEGIN
  INSERT INTO public.profiles (school_id, full_name, email, role, is_active)
  VALUES (
    '68bd8d34-f2f0-4297-bd18-093328824d84',
    'School Administrator',
    'peromark24@gmail.com',
    'principal',
    true
  )
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'profiles insert skipped: %', SQLERRM;
END $$;

-- ── marks ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_user uuid;
BEGIN
  SELECT id INTO v_user FROM public.profiles
  WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE 'marks skipped: still no profile for school';
    RETURN;
  END IF;

  INSERT INTO public.marks
    (student_id, subject_id, class_id, recorded_by, raw_score, percentage, grade, exam_type, term, academic_year)
  VALUES
    ('ed000001-0001-0001-0001-ed0000010001','5e000001-0001-0001-0001-5e0000010001','cc000401-0001-0001-0001-cc0004010001',v_user,88,88,'A-','end_term','1','2026'),
    ('ed000001-0001-0001-0001-ed0000010001','5e000002-0002-0002-0002-5e0000020002','cc000401-0001-0001-0001-cc0004010001',v_user,72,72,'B', 'end_term','1','2026'),
    ('ed000001-0001-0001-0001-ed0000010001','5e000004-0004-0004-0004-5e0000040004','cc000401-0001-0001-0001-cc0004010001',v_user,79,79,'B+','end_term','1','2026'),
    ('ed000001-0001-0001-0001-ed0000010001','5e000005-0005-0005-0005-5e0000050005','cc000401-0001-0001-0001-cc0004010001',v_user,82,82,'A-','end_term','1','2026'),
    ('ed000001-0001-0001-0001-ed0000010001','5e000006-0006-0006-0006-5e0000060006','cc000401-0001-0001-0001-cc0004010001',v_user,75,75,'B+','end_term','1','2026'),
    ('ed000002-0002-0002-0002-ed0000020002','5e000001-0001-0001-0001-5e0000010001','cc000401-0001-0001-0001-cc0004010001',v_user,65,65,'B-','end_term','1','2026'),
    ('ed000002-0002-0002-0002-ed0000020002','5e000002-0002-0002-0002-5e0000020002','cc000401-0001-0001-0001-cc0004010001',v_user,78,78,'B+','end_term','1','2026'),
    ('ed000002-0002-0002-0002-ed0000020002','5e000004-0004-0004-0004-5e0000040004','cc000401-0001-0001-0001-cc0004010001',v_user,70,70,'B', 'end_term','1','2026'),
    ('ed000002-0002-0002-0002-ed0000020002','5e000005-0005-0005-0005-5e0000050005','cc000401-0001-0001-0001-cc0004010001',v_user,58,58,'C+','end_term','1','2026'),
    ('ed000002-0002-0002-0002-ed0000020002','5e000006-0006-0006-0006-5e0000060006','cc000401-0001-0001-0001-cc0004010001',v_user,62,62,'C+','end_term','1','2026'),
    ('ed000006-0006-0006-0006-ed0000060006','5e000001-0001-0001-0001-5e0000010001','cc000301-0001-0001-0001-cc0003010001',v_user,55,55,'C', 'end_term','1','2026'),
    ('ed000006-0006-0006-0006-ed0000060006','5e000002-0002-0002-0002-5e0000020002','cc000301-0001-0001-0001-cc0003010001',v_user,68,68,'B', 'end_term','1','2026'),
    ('ed000006-0006-0006-0006-ed0000060006','5e000003-0003-0003-0003-5e0000030003','cc000301-0001-0001-0001-cc0003010001',v_user,72,72,'B', 'end_term','1','2026'),
    ('ed000006-0006-0006-0006-ed0000060006','5e000004-0004-0004-0004-5e0000040004','cc000301-0001-0001-0001-cc0003010001',v_user,48,48,'C-','end_term','1','2026'),
    ('ed000006-0006-0006-0006-ed0000060006','5e000005-0005-0005-0005-5e0000050005','cc000301-0001-0001-0001-cc0003010001',v_user,51,51,'C', 'end_term','1','2026')
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'marks skipped: %', SQLERRM;
END $$;

-- ── discipline_records ────────────────────────────────────────────────────────
DO $$
DECLARE v_user uuid;
BEGIN
  SELECT id INTO v_user FROM public.profiles
  WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE 'discipline_records skipped: no profile';
    RETURN;
  END IF;

  INSERT INTO public.discipline_records
    (school_id, student_id, reported_by, class_id, category, severity, description, action_taken, incident_date, parent_notified)
  VALUES
    ('68bd8d34-f2f0-4297-bd18-093328824d84','ed000003-0003-0003-0003-ed0000030003',
     v_user,'cc000401-0001-0001-0001-cc0004010001',
     'absenteeism','minor',
     'Absent without leave for 3 consecutive days',
     'Parent called, counselling session scheduled',
     '2026-03-15T08:00:00Z', true),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','ed000005-0005-0005-0005-ed0000050005',
     v_user,'cc000401-0001-0001-0001-cc0004010001',
     'disrespect_teacher','minor',
     'Insubordination — refused to follow teacher instruction',
     'Verbal warning and apology letter issued',
     '2026-04-02T08:00:00Z', true),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','ed00000a-000a-000a-000a-ed00000a000a',
     v_user,'cc000301-0001-0001-0001-cc0003010001',
     'other','minor',
     'Late coming — arrived 45 min after assembly for 5 consecutive days',
     'Extra duty assigned',
     '2026-04-10T07:30:00Z', false),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','ed000009-0009-0009-0009-ed0000090009',
     v_user,'cc000301-0001-0001-0001-cc0003010001',
     'mobile_phone','moderate',
     'Possession of mobile phone in class',
     'Phone confiscated, parent summoned',
     '2026-04-20T10:00:00Z', true)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'discipline_records skipped: %', SQLERRM;
END $$;

-- ── notices ───────────────────────────────────────────────────────────────────
DO $$
DECLARE v_user uuid;
BEGIN
  SELECT id INTO v_user FROM public.profiles
  WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE 'notices skipped: no profile';
    RETURN;
  END IF;

  INSERT INTO public.notices
    (school_id, posted_by, title, content, category, target_audience, is_published)
  VALUES
    ('68bd8d34-f2f0-4297-bd18-093328824d84', v_user,
     'Term 2 2026 Opening Date',
     'Dear Parents and Guardians, Term 2 will begin on Monday 5th May 2026. All students must report by 8:00 AM with school fees, a valid medical report, and all required textbooks.',
     'general','all', true),
    ('68bd8d34-f2f0-4297-bd18-093328824d84', v_user,
     'KCSE Mock Examination Schedule — Term 1',
     'Form 4 students will sit for Mock examinations from 22nd April 2026 to 30th April 2026. Arrive by 7:30 AM daily. Timetable pinned on the notice board.',
     'academic','all', true),
    ('68bd8d34-f2f0-4297-bd18-093328824d84', v_user,
     'Fee Payment Deadline — 30th April 2026',
     'All Term 1 2026 fees must be paid by 30th April 2026. Students with outstanding balances over KES 5,000 may be sent home. Pay via M-PESA Paybill 400100, Account: Admission Number.',
     'finance','guardians', true),
    ('68bd8d34-f2f0-4297-bd18-093328824d84', v_user,
     'Inter-School Athletics Competition',
     'Congratulations to our athletics team for winning the Kajiado County Inter-School Athletics Trophy! Celebration Friday 25th April at 3:00 PM. Parents welcome.',
     'general','all', true),
    ('68bd8d34-f2f0-4297-bd18-093328824d84', v_user,
     'Guidance & Counselling Sessions Available',
     'Confidential G&C sessions available every Tuesday and Thursday, 2:00–4:00 PM. Walk-ins welcome.',
     'general','all', true)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'notices skipped: %', SQLERRM;
END $$;
