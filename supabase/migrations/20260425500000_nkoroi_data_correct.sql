-- ============================================================
-- Nkoroi Correct Seed — uses actual remote column names
-- Derived from information_schema introspection (migration 400000)
-- Safe to re-run (ON CONFLICT DO NOTHING + EXCEPTION handlers)
-- ============================================================

-- ── fee_balances (no school_id col; use total_billed/total_paid/balance_due) ──
DO $$ BEGIN
  INSERT INTO public.fee_balances (student_id, academic_year, total_billed, total_paid, balance_due)
  VALUES
    ('ed000001-0001-0001-0001-ed0000010001','2026',55000,55000,    0),
    ('ed000002-0002-0002-0002-ed0000020002','2026',55000,40000,15000),
    ('ed000003-0003-0003-0003-ed0000030003','2026',55000,20000,35000),
    ('ed000004-0004-0004-0004-ed0000040004','2026',55000,55000,    0),
    ('ed000005-0005-0005-0005-ed0000050005','2026',55000, 5000,50000),
    ('ed000006-0006-0006-0006-ed0000060006','2026',50000,50000,    0),
    ('ed000007-0007-0007-0007-ed0000070007','2026',50000,35000,15000),
    ('ed000008-0008-0008-0008-ed0000080008','2026',50000,50000,    0),
    ('ed000009-0009-0009-0009-ed0000090009','2026',50000,10000,40000),
    ('ed00000a-000a-000a-000a-ed00000a000a','2026',50000,50000,    0),
    ('ed00000b-000b-000b-000b-ed00000b000b','2026',45000,45000,    0),
    ('ed00000c-000c-000c-000c-ed00000c000c','2026',45000,30000,15000),
    ('ed00000d-000d-000d-000d-ed00000d000d','2026',45000,45000,    0),
    ('ed00000e-000e-000e-000e-ed00000e000e','2026',45000,    0,45000),
    ('ed00000f-000f-000f-000f-ed00000f000f','2026',45000,45000,    0),
    ('ed000010-0010-0010-0010-ed0000100010','2026',40000,40000,    0),
    ('ed000011-0011-0011-0011-ed0000110011','2026',40000,20000,20000),
    ('ed000012-0012-0012-0012-ed0000120012','2026',40000,40000,    0),
    ('ed000013-0013-0013-0013-ed0000130013','2026',40000, 8000,32000),
    ('ed000014-0014-0014-0014-ed0000140014','2026',40000,40000,    0)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'fee_balances skipped: %', SQLERRM;
END $$;

-- ── fee_records (use amount_due/amount_paid/balance/paid_at/receipt_no) ────────
DO $$ BEGIN
  INSERT INTO public.fee_records
    (student_id, school_id, term, academic_year, amount_due, amount_paid, balance, payment_status, paid_at)
  VALUES
    ('ed000001-0001-0001-0001-ed0000010001','68bd8d34-f2f0-4297-bd18-093328824d84','1','2026',55000,55000,   0,'paid',    '2026-03-10T09:00:00Z'),
    ('ed000002-0002-0002-0002-ed0000020002','68bd8d34-f2f0-4297-bd18-093328824d84','1','2026',55000,40000,15000,'partial', '2026-02-28T11:30:00Z'),
    ('ed000003-0003-0003-0003-ed0000030003','68bd8d34-f2f0-4297-bd18-093328824d84','1','2026',55000,20000,35000,'partial', '2026-01-15T14:00:00Z'),
    ('ed000005-0005-0005-0005-ed0000050005','68bd8d34-f2f0-4297-bd18-093328824d84','1','2026',55000, 5000,50000,'partial', '2026-01-20T10:00:00Z'),
    ('ed000007-0007-0007-0007-ed0000070007','68bd8d34-f2f0-4297-bd18-093328824d84','1','2026',50000,35000,15000,'partial', '2026-02-20T10:00:00Z'),
    ('ed000009-0009-0009-0009-ed0000090009','68bd8d34-f2f0-4297-bd18-093328824d84','1','2026',50000,10000,40000,'partial', '2026-01-10T08:00:00Z'),
    ('ed00000c-000c-000c-000c-ed00000c000c','68bd8d34-f2f0-4297-bd18-093328824d84','1','2026',45000,30000,15000,'partial', '2026-02-15T08:00:00Z'),
    ('ed00000e-000e-000e-000e-ed00000e000e','68bd8d34-f2f0-4297-bd18-093328824d84','1','2026',45000,    0,45000,'unpaid',  NULL),
    ('ed000011-0011-0011-0011-ed0000110011','68bd8d34-f2f0-4297-bd18-093328824d84','1','2026',40000,20000,20000,'partial', '2026-02-10T10:00:00Z'),
    ('ed000013-0013-0013-0013-ed0000130013','68bd8d34-f2f0-4297-bd18-093328824d84','1','2026',40000, 8000,32000,'partial', '2026-01-25T11:00:00Z')
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'fee_records skipped: %', SQLERRM;
END $$;

-- ── marks (no school_id col; use raw_score not score; recorded_by from any user) ──
DO $$
DECLARE v_user uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  IF v_user IS NULL THEN
    RAISE NOTICE 'marks skipped: no auth.users row found for recorded_by';
    RETURN;
  END IF;

  INSERT INTO public.marks
    (student_id, subject_id, class_id, recorded_by, raw_score, percentage, grade, exam_type, term, academic_year)
  VALUES
    -- Form 4A student 1
    ('ed000001-0001-0001-0001-ed0000010001','5e000001-0001-0001-0001-5e0000010001','cc000401-0001-0001-0001-cc0004010001',v_user,88,88,'A-','end_term','1','2026'),
    ('ed000001-0001-0001-0001-ed0000010001','5e000002-0002-0002-0002-5e0000020002','cc000401-0001-0001-0001-cc0004010001',v_user,72,72,'B', 'end_term','1','2026'),
    ('ed000001-0001-0001-0001-ed0000010001','5e000004-0004-0004-0004-5e0000040004','cc000401-0001-0001-0001-cc0004010001',v_user,79,79,'B+','end_term','1','2026'),
    ('ed000001-0001-0001-0001-ed0000010001','5e000005-0005-0005-0005-5e0000050005','cc000401-0001-0001-0001-cc0004010001',v_user,82,82,'A-','end_term','1','2026'),
    ('ed000001-0001-0001-0001-ed0000010001','5e000006-0006-0006-0006-5e0000060006','cc000401-0001-0001-0001-cc0004010001',v_user,75,75,'B+','end_term','1','2026'),
    -- Form 4A student 2
    ('ed000002-0002-0002-0002-ed0000020002','5e000001-0001-0001-0001-5e0000010001','cc000401-0001-0001-0001-cc0004010001',v_user,65,65,'B-','end_term','1','2026'),
    ('ed000002-0002-0002-0002-ed0000020002','5e000002-0002-0002-0002-5e0000020002','cc000401-0001-0001-0001-cc0004010001',v_user,78,78,'B+','end_term','1','2026'),
    ('ed000002-0002-0002-0002-ed0000020002','5e000004-0004-0004-0004-5e0000040004','cc000401-0001-0001-0001-cc0004010001',v_user,70,70,'B', 'end_term','1','2026'),
    ('ed000002-0002-0002-0002-ed0000020002','5e000005-0005-0005-0005-5e0000050005','cc000401-0001-0001-0001-cc0004010001',v_user,58,58,'C+','end_term','1','2026'),
    ('ed000002-0002-0002-0002-ed0000020002','5e000006-0006-0006-0006-5e0000060006','cc000401-0001-0001-0001-cc0004010001',v_user,62,62,'C+','end_term','1','2026'),
    -- Form 3A student 6
    ('ed000006-0006-0006-0006-ed0000060006','5e000001-0001-0001-0001-5e0000010001','cc000301-0001-0001-0001-cc0003010001',v_user,55,55,'C', 'end_term','1','2026'),
    ('ed000006-0006-0006-0006-ed0000060006','5e000002-0002-0002-0002-5e0000020002','cc000301-0001-0001-0001-cc0003010001',v_user,68,68,'B', 'end_term','1','2026'),
    ('ed000006-0006-0006-0006-ed0000060006','5e000003-0003-0003-0003-5e0000030003','cc000301-0001-0001-0001-cc0003010001',v_user,72,72,'B', 'end_term','1','2026'),
    ('ed000006-0006-0006-0006-ed0000060006','5e000004-0004-0004-0004-5e0000040004','cc000301-0001-0001-0001-cc0003010001',v_user,48,48,'C-','end_term','1','2026'),
    ('ed000006-0006-0006-0006-ed0000060006','5e000005-0005-0005-0005-5e0000050005','cc000301-0001-0001-0001-cc0003010001',v_user,51,51,'C', 'end_term','1','2026')
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'marks skipped: %', SQLERRM;
END $$;

-- ── attendance_records (student_id is text; teacher_id is text not uuid) ──────
DO $$ BEGIN
  INSERT INTO public.attendance_records
    (school_id, teacher_id, class_name, date, student_id, student_name, status)
  VALUES
    -- Student ed000001 — last 10 school days
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-25','ed000001-0001-0001-0001-ed0000010001','Amara Nkoroi','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-24','ed000001-0001-0001-0001-ed0000010001','Amara Nkoroi','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-23','ed000001-0001-0001-0001-ed0000010001','Amara Nkoroi','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-22','ed000001-0001-0001-0001-ed0000010001','Amara Nkoroi','absent'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-17','ed000001-0001-0001-0001-ed0000010001','Amara Nkoroi','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-16','ed000001-0001-0001-0001-ed0000010001','Amara Nkoroi','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-15','ed000001-0001-0001-0001-ed0000010001','Amara Nkoroi','late'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-14','ed000001-0001-0001-0001-ed0000010001','Amara Nkoroi','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-11','ed000001-0001-0001-0001-ed0000010001','Amara Nkoroi','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-10','ed000001-0001-0001-0001-ed0000010001','Amara Nkoroi','present'),
    -- Student ed000002
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-25','ed000002-0002-0002-0002-ed0000020002','Brian Omondi','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-24','ed000002-0002-0002-0002-ed0000020002','Brian Omondi','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-23','ed000002-0002-0002-0002-ed0000020002','Brian Omondi','absent'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-22','ed000002-0002-0002-0002-ed0000020002','Brian Omondi','absent'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-17','ed000002-0002-0002-0002-ed0000020002','Brian Omondi','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-16','ed000002-0002-0002-0002-ed0000020002','Brian Omondi','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-15','ed000002-0002-0002-0002-ed0000020002','Brian Omondi','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-14','ed000002-0002-0002-0002-ed0000020002','Brian Omondi','late'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-11','ed000002-0002-0002-0002-ed0000020002','Brian Omondi','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 4A','2026-04-10','ed000002-0002-0002-0002-ed0000020002','Brian Omondi','absent'),
    -- Student ed000006 (Form 3A)
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 3A','2026-04-25','ed000006-0006-0006-0006-ed0000060006','Faith Wanjiku','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 3A','2026-04-24','ed000006-0006-0006-0006-ed0000060006','Faith Wanjiku','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 3A','2026-04-23','ed000006-0006-0006-0006-ed0000060006','Faith Wanjiku','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 3A','2026-04-22','ed000006-0006-0006-0006-ed0000060006','Faith Wanjiku','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 3A','2026-04-17','ed000006-0006-0006-0006-ed0000060006','Faith Wanjiku','late'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 3A','2026-04-16','ed000006-0006-0006-0006-ed0000060006','Faith Wanjiku','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 3A','2026-04-15','ed000006-0006-0006-0006-ed0000060006','Faith Wanjiku','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 3A','2026-04-14','ed000006-0006-0006-0006-ed0000060006','Faith Wanjiku','absent'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 3A','2026-04-11','ed000006-0006-0006-0006-ed0000060006','Faith Wanjiku','present'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','SYSTEM','Form 3A','2026-04-10','ed000006-0006-0006-0006-ed0000060006','Faith Wanjiku','present')
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'attendance_records skipped: %', SQLERRM;
END $$;

-- ── discipline_records (use description/category/incident_date; reported_by from any user) ──
DO $$
DECLARE v_user uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  IF v_user IS NULL THEN
    RAISE NOTICE 'discipline_records skipped: no auth.users row for reported_by';
    RETURN;
  END IF;

  INSERT INTO public.discipline_records
    (school_id, student_id, reported_by, class_id, category, severity, description, action_taken, incident_date, parent_notified)
  VALUES
    ('68bd8d34-f2f0-4297-bd18-093328824d84','ed000003-0003-0003-0003-ed0000030003',
     v_user,'cc000401-0001-0001-0001-cc0004010001',
     'Attendance','minor',
     'Absent without leave for 3 consecutive days',
     'Parent called, counselling session scheduled',
     '2026-03-15T08:00:00Z', true),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','ed000005-0005-0005-0005-ed0000050005',
     v_user,'cc000401-0001-0001-0001-cc0004010001',
     'Conduct','minor',
     'Insubordination — refused to follow teacher instruction',
     'Verbal warning and apology letter issued',
     '2026-04-02T08:00:00Z', true),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','ed00000a-000a-000a-000a-ed00000a000a',
     v_user,'cc000301-0001-0001-0001-cc0003010001',
     'Attendance','minor',
     'Late coming — arrived 45 min after assembly for 5 consecutive days',
     'Extra duty assigned',
     '2026-04-10T07:30:00Z', false),
    ('68bd8d34-f2f0-4297-bd18-093328824d84','ed000009-0009-0009-0009-ed0000090009',
     v_user,'cc000301-0001-0001-0001-cc0003010001',
     'Conduct','moderate',
     'Possession of mobile phone in class',
     'Phone confiscated, parent summoned',
     '2026-04-20T10:00:00Z', true)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'discipline_records skipped: %', SQLERRM;
END $$;

-- ── notices (no published_at or expires_at; posted_by from any user) ──────────
DO $$
DECLARE v_user uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  IF v_user IS NULL THEN
    RAISE NOTICE 'notices skipped: no auth.users row for posted_by';
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
     'fees','parents', true),
    ('68bd8d34-f2f0-4297-bd18-093328824d84', v_user,
     'Inter-School Athletics Competition',
     'Congratulations to our athletics team for winning the Kajiado County Inter-School Athletics Trophy! Celebration Friday 25th April at 3:00 PM. Parents welcome.',
     'general','all', true),
    ('68bd8d34-f2f0-4297-bd18-093328824d84', v_user,
     'Guidance & Counselling Sessions Available',
     'Confidential G&C sessions available every Tuesday and Thursday, 2:00–4:00 PM. Walk-ins welcome.',
     'welfare','all', true)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'notices skipped: %', SQLERRM;
END $$;
