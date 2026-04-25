-- ============================================================
-- Nkoroi Seed Fixup — correct column names for remote schema
-- Safe to re-run (all inserts use ON CONFLICT DO NOTHING)
-- ============================================================

-- ── Notices (remote uses content + target_audience) ────────
DO $$ BEGIN
  INSERT INTO public.notices
    (school_id, title, content, target_audience, published_at, expires_at)
  VALUES
    ('68bd8d34-f2f0-4297-bd18-093328824d84',
     'Term 2 2026 Opening Date',
     'Dear Parents and Guardians, Term 2 will begin on Monday 5th May 2026. All students must report by 8:00 AM with school fees, a valid medical report, and all required textbooks.',
     'all', '2026-04-20T07:00:00Z', NULL),
    ('68bd8d34-f2f0-4297-bd18-093328824d84',
     'KCSE Mock Examination Schedule — Term 1',
     'Form 4 students will sit for Mock examinations from 22nd April 2026 to 30th April 2026. Arrive by 7:30 AM daily. Timetable pinned on the notice board.',
     'all', '2026-04-15T08:00:00Z', '2026-05-01T00:00:00Z'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84',
     'Fee Payment Deadline — 30th April 2026',
     'All Term 1 2026 fees must be paid by 30th April 2026. Students with outstanding balances over KES 5,000 may be sent home. Pay via M-PESA Paybill 400100, Account: Admission Number.',
     'parents', '2026-04-18T07:00:00Z', '2026-04-30T23:59:00Z'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84',
     'Inter-School Athletics Competition',
     'Congratulations to our athletics team for winning the Kajiado County Inter-School Athletics Trophy! Celebration Friday 25th April at 3:00 PM. Parents welcome.',
     'all', '2026-04-22T06:00:00Z', '2026-04-26T00:00:00Z'),
    ('68bd8d34-f2f0-4297-bd18-093328824d84',
     'Guidance & Counselling Sessions Available',
     'Confidential G&C sessions available every Tuesday and Thursday, 2:00–4:00 PM. Walk-ins welcome.',
     'all', '2026-04-10T08:00:00Z', NULL)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'notices (fixup) skipped: %', SQLERRM;
END $$;

-- ── fee_balances without school_id (try both schemas) ──────
DO $$ BEGIN
  INSERT INTO public.fee_balances (id, student_id, invoiced_amount, paid_amount, last_payment_at)
  VALUES
    (gen_random_uuid(),'ed000001-0001-0001-0001-ed0000010001',55000, 55000, '2026-03-10T09:00:00Z'),
    (gen_random_uuid(),'ed000002-0002-0002-0002-ed0000020002',55000, 40000, '2026-02-28T11:30:00Z'),
    (gen_random_uuid(),'ed000003-0003-0003-0003-ed0000030003',55000, 20000, '2026-01-15T14:00:00Z'),
    (gen_random_uuid(),'ed000004-0004-0004-0004-ed0000040004',55000, 55000, '2026-03-05T08:00:00Z'),
    (gen_random_uuid(),'ed000005-0005-0005-0005-ed0000050005',55000,  5000, '2026-01-20T10:00:00Z'),
    (gen_random_uuid(),'ed000006-0006-0006-0006-ed0000060006',50000, 50000, '2026-03-08T09:00:00Z'),
    (gen_random_uuid(),'ed000007-0007-0007-0007-ed0000070007',50000, 35000, '2026-02-20T10:00:00Z'),
    (gen_random_uuid(),'ed000008-0008-0008-0008-ed0000080008',50000, 50000, '2026-03-01T11:00:00Z'),
    (gen_random_uuid(),'ed000009-0009-0009-0009-ed0000090009',50000, 10000, '2026-01-10T08:00:00Z'),
    (gen_random_uuid(),'ed00000a-000a-000a-000a-ed00000a000a',50000, 50000, '2026-03-12T09:00:00Z'),
    (gen_random_uuid(),'ed00000b-000b-000b-000b-ed00000b000b',45000, 45000, '2026-03-09T10:00:00Z'),
    (gen_random_uuid(),'ed00000c-000c-000c-000c-ed00000c000c',45000, 30000, '2026-02-15T08:00:00Z'),
    (gen_random_uuid(),'ed00000d-000d-000d-000d-ed00000d000d',45000, 45000, '2026-03-10T09:00:00Z'),
    (gen_random_uuid(),'ed00000e-000e-000e-000e-ed00000e000e',45000,  0,    null),
    (gen_random_uuid(),'ed00000f-000f-000f-000f-ed00000f000f',45000, 45000, '2026-03-11T10:00:00Z'),
    (gen_random_uuid(),'ed000010-0010-0010-0010-ed0000100010',40000, 40000, '2026-03-07T08:00:00Z'),
    (gen_random_uuid(),'ed000011-0011-0011-0011-ed0000110011',40000, 20000, '2026-02-10T10:00:00Z'),
    (gen_random_uuid(),'ed000012-0012-0012-0012-ed0000120012',40000, 40000, '2026-03-06T09:00:00Z'),
    (gen_random_uuid(),'ed000013-0013-0013-0013-ed0000130013',40000,  8000, '2026-01-25T11:00:00Z'),
    (gen_random_uuid(),'ed000014-0014-0014-0014-ed0000140014',40000, 40000, '2026-03-13T10:00:00Z')
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'fee_balances (fixup) skipped: %', SQLERRM;
END $$;

-- ── marks without school_id ──────────────────────────────────
DO $$ BEGIN
  INSERT INTO public.marks (id, student_id, class_id, subject_id, score, percentage, grade, exam_type, term, academic_year)
  VALUES
    (gen_random_uuid(),'ed000001-0001-0001-0001-ed0000010001','cc000401-0001-0001-0001-cc0004010001','5e000001-0001-0001-0001-5e0000010001',88,88,'A-','end_term','1','2026'),
    (gen_random_uuid(),'ed000001-0001-0001-0001-ed0000010001','cc000401-0001-0001-0001-cc0004010001','5e000002-0002-0002-0002-5e0000020002',72,72,'B','end_term','1','2026'),
    (gen_random_uuid(),'ed000001-0001-0001-0001-ed0000010001','cc000401-0001-0001-0001-cc0004010001','5e000004-0004-0004-0004-5e0000040004',79,79,'B+','end_term','1','2026'),
    (gen_random_uuid(),'ed000001-0001-0001-0001-ed0000010001','cc000401-0001-0001-0001-cc0004010001','5e000005-0005-0005-0005-5e0000050005',82,82,'A-','end_term','1','2026'),
    (gen_random_uuid(),'ed000001-0001-0001-0001-ed0000010001','cc000401-0001-0001-0001-cc0004010001','5e000006-0006-0006-0006-5e0000060006',75,75,'B+','end_term','1','2026'),
    (gen_random_uuid(),'ed000002-0002-0002-0002-ed0000020002','cc000401-0001-0001-0001-cc0004010001','5e000001-0001-0001-0001-5e0000010001',65,65,'B-','end_term','1','2026'),
    (gen_random_uuid(),'ed000002-0002-0002-0002-ed0000020002','cc000401-0001-0001-0001-cc0004010001','5e000002-0002-0002-0002-5e0000020002',78,78,'B+','end_term','1','2026'),
    (gen_random_uuid(),'ed000002-0002-0002-0002-ed0000020002','cc000401-0001-0001-0001-cc0004010001','5e000004-0004-0004-0004-5e0000040004',70,70,'B','end_term','1','2026'),
    (gen_random_uuid(),'ed000002-0002-0002-0002-ed0000020002','cc000401-0001-0001-0001-cc0004010001','5e000005-0005-0005-0005-5e0000050005',58,58,'C+','end_term','1','2026'),
    (gen_random_uuid(),'ed000002-0002-0002-0002-ed0000020002','cc000401-0001-0001-0001-cc0004010001','5e000006-0006-0006-0006-5e0000060006',62,62,'C+','end_term','1','2026'),
    (gen_random_uuid(),'ed000006-0006-0006-0006-ed0000060006','cc000301-0001-0001-0001-cc0003010001','5e000001-0001-0001-0001-5e0000010001',55,55,'C','end_term','1','2026'),
    (gen_random_uuid(),'ed000006-0006-0006-0006-ed0000060006','cc000301-0001-0001-0001-cc0003010001','5e000002-0002-0002-0002-5e0000020002',68,68,'B','end_term','1','2026'),
    (gen_random_uuid(),'ed000006-0006-0006-0006-ed0000060006','cc000301-0001-0001-0001-cc0003010001','5e000003-0003-0003-0003-5e0000030003',72,72,'B','end_term','1','2026'),
    (gen_random_uuid(),'ed000006-0006-0006-0006-ed0000060006','cc000301-0001-0001-0001-cc0003010001','5e000004-0004-0004-0004-5e0000040004',48,48,'C-','end_term','1','2026'),
    (gen_random_uuid(),'ed000006-0006-0006-0006-ed0000060006','cc000301-0001-0001-0001-cc0003010001','5e000005-0005-0005-0005-5e0000050005',51,51,'C','end_term','1','2026')
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'marks (fixup) skipped: %', SQLERRM;
END $$;

-- ── discipline_records using remote column name (offence) ───
DO $$ BEGIN
  INSERT INTO public.discipline_records
    (id, school_id, student_id, letter_date, offence)
  VALUES
    (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','ed000003-0003-0003-0003-ed0000030003',
     '2026-03-15','Absent without leave for 3 consecutive days — parent called, counselling session scheduled'),
    (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','ed000005-0005-0005-0005-ed0000050005',
     '2026-04-02','Insubordination — refused to follow teacher instruction. Verbal warning and apology letter'),
    (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','ed00000a-000a-000a-000a-ed00000a000a',
     '2026-04-10','Late coming — arrived 45 min after assembly for 5 consecutive days. Extra duty assigned'),
    (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','ed000009-0009-0009-0009-ed0000090009',
     '2026-04-20','Possession of mobile phone in class — phone confiscated, parent summoned')
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'discipline_records (fixup) skipped: %', SQLERRM;
END $$;
