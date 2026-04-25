-- ============================================================
-- Nkoroi Senior School — Comprehensive Seed
-- School ID: 68bd8d34-f2f0-4297-bd18-093328824d84
-- Short code: 1834
-- Safe to re-run: all INSERTs use ON CONFLICT DO NOTHING
-- ============================================================

-- ── 0. Update school details ──────────────────────────────────
UPDATE public.schools
SET
  name          = 'Nkoroi Senior School',
  short_name    = 'NSS',
  county        = 'Kajiado',
  sub_county    = 'Ongata Rongai',
  phone         = '+254700001834',
  email         = 'info@nkoroisenior.sc.ke',
  contact_name  = 'Principal Rita Thiringi',
  contact_phone = '+254700001834',
  contact_email = 'principal@nkoroisenior.sc.ke',
  knec_code     = '31557224',
  student_count = 800,
  is_active     = true,
  features      = '{
    "gate_pass":        true,
    "visitor_log":      true,
    "staff_attendance": true,
    "pocket_money":     true,
    "bread_voucher":    true
  }'::jsonb,
  subscription_expires_at = '2027-12-31 00:00:00+03'
WHERE id = '68bd8d34-f2f0-4297-bd18-093328824d84';

-- tenant_configs update
INSERT INTO public.tenant_configs (school_id, name, school_short_code)
VALUES ('68bd8d34-f2f0-4297-bd18-093328824d84', 'Nkoroi Senior School', '1834')
ON CONFLICT (school_id) DO UPDATE
  SET name = 'Nkoroi Senior School';

-- ── 1. Streams ────────────────────────────────────────────────
INSERT INTO public.streams (id, school_id, name, colour_hex, sort_order)
VALUES
  ('aa000001-0001-0001-0001-aa0000010001', '68bd8d34-f2f0-4297-bd18-093328824d84', 'East',  '#3B82F6', 1),
  ('aa000002-0002-0002-0002-aa0000020002', '68bd8d34-f2f0-4297-bd18-093328824d84', 'West',  '#10B981', 2),
  ('aa000003-0003-0003-0003-aa0000030003', '68bd8d34-f2f0-4297-bd18-093328824d84', 'North', '#F59E0B', 3),
  ('aa000004-0004-0004-0004-aa0000040004', '68bd8d34-f2f0-4297-bd18-093328824d84', 'South', '#EF4444', 4)
ON CONFLICT DO NOTHING;

-- ── 2. Classes (Form 1–4, East + West streams) ────────────────
INSERT INTO public.classes (id, school_id, name, stream_id, year_group, academic_year, curriculum_type)
VALUES
  ('cc000101-0001-0001-0001-cc0001010001', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Form 1 East',  'aa000001-0001-0001-0001-aa0000010001', 1, '2026', '844'),
  ('cc000102-0002-0002-0002-cc0001020002', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Form 1 West',  'aa000002-0002-0002-0002-aa0000020002', 1, '2026', '844'),
  ('cc000201-0001-0001-0001-cc0002010001', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Form 2 East',  'aa000001-0001-0001-0001-aa0000010001', 2, '2026', '844'),
  ('cc000202-0002-0002-0002-cc0002020002', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Form 2 West',  'aa000002-0002-0002-0002-aa0000020002', 2, '2026', '844'),
  ('cc000301-0001-0001-0001-cc0003010001', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Form 3 East',  'aa000001-0001-0001-0001-aa0000010001', 3, '2026', '844'),
  ('cc000302-0002-0002-0002-cc0003020002', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Form 3 West',  'aa000002-0002-0002-0002-aa0000020002', 3, '2026', '844'),
  ('cc000401-0001-0001-0001-cc0004010001', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Form 4 East',  'aa000001-0001-0001-0001-aa0000010001', 4, '2026', '844'),
  ('cc000402-0002-0002-0002-cc0004020002', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Form 4 West',  'aa000002-0002-0002-0002-aa0000020002', 4, '2026', '844')
ON CONFLICT DO NOTHING;

-- ── 3. Subjects ───────────────────────────────────────────────
INSERT INTO public.subjects (id, school_id, name, code, department, cognitive_demand, is_core, lessons_per_week)
VALUES
  ('ss000001-0001-0001-0001-ss0000010001', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Mathematics',             'MATH', 'Mathematics',        3, true,  7),
  ('ss000002-0002-0002-0002-ss0000020002', '68bd8d34-f2f0-4297-bd18-093328824d84', 'English',                 'ENG',  'Languages',          2, true,  6),
  ('ss000003-0003-0003-0003-ss0000030003', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Kiswahili',               'KSW',  'Languages',          2, true,  6),
  ('ss000004-0004-0004-0004-ss0000040004', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Biology',                 'BIO',  'Sciences',           3, true,  5),
  ('ss000005-0005-0005-0005-ss0000050005', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Chemistry',               'CHEM', 'Sciences',           3, true,  5),
  ('ss000006-0006-0006-0006-ss0000060006', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Physics',                 'PHY',  'Sciences',           3, true,  5),
  ('ss000007-0007-0007-0007-ss0000070007', '68bd8d34-f2f0-4297-bd18-093328824d84', 'History & Government',    'HIST', 'Humanities',         2, false, 4),
  ('ss000008-0008-0008-0008-ss0000080008', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Geography',               'GEO',  'Humanities',         2, false, 4),
  ('ss000009-0009-0009-0009-ss0000090009', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Christian Religious Ed.', 'CRE',  'Humanities',         1, false, 3),
  ('ss00000a-000a-000a-000a-ss00000a000a', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Business Studies',        'BST',  'Applied Sciences',   2, false, 4),
  ('ss00000b-000b-000b-000b-ss00000b000b', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Computer Studies',        'COMP', 'Applied Sciences',   2, false, 3),
  ('ss00000c-000c-000c-000c-ss00000c000c', '68bd8d34-f2f0-4297-bd18-093328824d84', 'Agriculture',             'AGRI', 'Applied Sciences',   2, false, 4)
ON CONFLICT DO NOTHING;

-- ── 4. Students (20 students, various forms, parent_phone for PWA testing) ─
INSERT INTO public.students
  (id, school_id, full_name, admission_number, nemis_upi, form, stream, class_id, gender, date_of_birth, parent_phone, is_in_school)
VALUES
  -- Form 4 East
  ('st000001-0001-0001-0001-st0000010001','68bd8d34-f2f0-4297-bd18-093328824d84','Brian Mwangi Kariuki',   'NSS/2023/001','2023KJD00001',4,'East','cc000401-0001-0001-0001-cc0004010001','male',  '2009-03-12','+254700111001',true),
  ('st000002-0002-0002-0002-st0000020002','68bd8d34-f2f0-4297-bd18-093328824d84','Faith Wambui Gitau',     'NSS/2023/002','2023KJD00002',4,'East','cc000401-0001-0001-0001-cc0004010001','female','2009-07-24','+254700111002',true),
  ('st000003-0003-0003-0003-st0000030003','68bd8d34-f2f0-4297-bd18-093328824d84','Kevin Omondi Aloo',      'NSS/2023/003','2023KJD00003',4,'West','cc000402-0002-0002-0002-cc0004020002','male',  '2009-01-05','+254700111003',false),
  ('st000004-0004-0004-0004-st0000040004','68bd8d34-f2f0-4297-bd18-093328824d84','Grace Chebet Rono',      'NSS/2023/004','2023KJD00004',4,'West','cc000402-0002-0002-0002-cc0004020002','female','2009-11-30','+254700111004',true),
  ('st000005-0005-0005-0005-st0000050005','68bd8d34-f2f0-4297-bd18-093328824d84','Dennis Murithi Njeru',   'NSS/2023/005','2023KJD00005',4,'East','cc000401-0001-0001-0001-cc0004010001','male',  '2010-02-18','+254700111005',true),
  -- Form 3 East
  ('st000006-0006-0006-0006-st0000060006','68bd8d34-f2f0-4297-bd18-093328824d84','Alice Njeri Kamau',      'NSS/2024/001','2024KJD00006',3,'East','cc000301-0001-0001-0001-cc0003010001','female','2010-05-14','+254700111006',true),
  ('st000007-0007-0007-0007-st0000070007','68bd8d34-f2f0-4297-bd18-093328824d84','Peter Kiprotich Bett',   'NSS/2024/002','2024KJD00007',3,'East','cc000301-0001-0001-0001-cc0003010001','male',  '2010-09-22','+254700111007',true),
  ('st000008-0008-0008-0008-st0000080008','68bd8d34-f2f0-4297-bd18-093328824d84','Mary Akinyi Otieno',     'NSS/2024/003','2024KJD00008',3,'West','cc000302-0002-0002-0002-cc0003020002','female','2010-12-08','+254700111008',true),
  ('st000009-0009-0009-0009-st0000090009','68bd8d34-f2f0-4297-bd18-093328824d84','James Ngugi Waweru',     'NSS/2024/004','2024KJD00009',3,'West','cc000302-0002-0002-0002-cc0003020002','male',  '2011-04-03','+254700111009',true),
  ('st00000a-000a-000a-000a-st00000a000a','68bd8d34-f2f0-4297-bd18-093328824d84','Lydia Muthoni Ndungu',   'NSS/2024/005','2024KJD00010',3,'East','cc000301-0001-0001-0001-cc0003010001','female','2011-06-17','+254700111010',false),
  -- Form 2 West
  ('st00000b-000b-000b-000b-st00000b000b','68bd8d34-f2f0-4297-bd18-093328824d84','Samuel Kiplagat Korir',  'NSS/2025/001','2025KJD00011',2,'West','cc000202-0002-0002-0002-cc0002020002','male',  '2012-08-25','+254700111011',true),
  ('st00000c-000c-000c-000c-st00000c000c','68bd8d34-f2f0-4297-bd18-093328824d84','Esther Naliaka Wekesa', 'NSS/2025/002','2025KJD00012',2,'West','cc000202-0002-0002-0002-cc0002020002','female','2012-02-11','+254700111012',true),
  ('st00000d-000d-000d-000d-st00000d000d','68bd8d34-f2f0-4297-bd18-093328824d84','Moses Maina Thuo',       'NSS/2025/003','2025KJD00013',2,'East','cc000201-0001-0001-0001-cc0002010001','male',  '2012-10-30','+254700111013',true),
  ('st00000e-000e-000e-000e-st00000e000e','68bd8d34-f2f0-4297-bd18-093328824d84','Cynthia Atieno Odinga',  'NSS/2025/004','2025KJD00014',2,'East','cc000201-0001-0001-0001-cc0002010001','female','2012-07-07','+254700111014',true),
  ('st00000f-000f-000f-000f-st00000f000f','68bd8d34-f2f0-4297-bd18-093328824d84','John Mutiso Musembi',    'NSS/2025/005','2025KJD00015',2,'West','cc000202-0002-0002-0002-cc0002020002','male',  '2012-04-19','+254700111015',true),
  -- Form 1 East
  ('st000010-0010-0010-0010-st0000100010','68bd8d34-f2f0-4297-bd18-093328824d84','Sandra Moraa Ombati',    'NSS/2026/001','2026KJD00016',1,'East','cc000101-0001-0001-0001-cc0001010001','female','2013-01-28','+254700111016',true),
  ('st000011-0011-0011-0011-st0000110011','68bd8d34-f2f0-4297-bd18-093328824d84','David Kibet Sang',       'NSS/2026/002','2026KJD00017',1,'East','cc000101-0001-0001-0001-cc0001010001','male',  '2013-03-15','+254700111017',true),
  ('st000012-0012-0012-0012-st0000120012','68bd8d34-f2f0-4297-bd18-093328824d84','Anne Wanjiku Mwangi',    'NSS/2026/003','2026KJD00018',1,'West','cc000102-0002-0002-0002-cc0001020002','female','2013-09-04','+254700111018',true),
  ('st000013-0013-0013-0013-st0000130013','68bd8d34-f2f0-4297-bd18-093328824d84','Victor Otieno Odhiambo', 'NSS/2026/004','2026KJD00019',1,'West','cc000102-0002-0002-0002-cc0001020002','male',  '2013-11-22','+254700111019',true),
  ('st000014-0014-0014-0014-st0000140014','68bd8d34-f2f0-4297-bd18-093328824d84','Beatrice Cherop Kigen',  'NSS/2026/005','2026KJD00020',1,'East','cc000101-0001-0001-0001-cc0001010001','female','2013-06-09','+254700111020',false)
ON CONFLICT DO NOTHING;

-- ── 5. Fee balances ───────────────────────────────────────────
INSERT INTO public.fee_balances (id, school_id, student_id, invoiced_amount, paid_amount, last_payment_at)
VALUES
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000001-0001-0001-0001-st0000010001',55000, 55000, '2026-03-10T09:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000002-0002-0002-0002-st0000020002',55000, 40000, '2026-02-28T11:30:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000003-0003-0003-0003-st0000030003',55000, 20000, '2026-01-15T14:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000004-0004-0004-0004-st0000040004',55000, 55000, '2026-03-05T08:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000005-0005-0005-0005-st0000050005',55000,  5000, '2026-01-20T10:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000006-0006-0006-0006-st0000060006',50000, 50000, '2026-03-08T09:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000007-0007-0007-0007-st0000070007',50000, 35000, '2026-02-20T10:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000008-0008-0008-0008-st0000080008',50000, 50000, '2026-03-01T11:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000009-0009-0009-0009-st0000090009',50000, 10000, '2026-01-10T08:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st00000a-000a-000a-000a-st00000a000a',50000, 50000, '2026-03-12T09:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st00000b-000b-000b-000b-st00000b000b',45000, 45000, '2026-03-09T10:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st00000c-000c-000c-000c-st00000c000c',45000, 30000, '2026-02-15T08:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st00000d-000d-000d-000d-st00000d000d',45000, 45000, '2026-03-10T09:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st00000e-000e-000e-000e-st00000e000e',45000,  0,    null),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st00000f-000f-000f-000f-st00000f000f',45000, 45000, '2026-03-11T10:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000010-0010-0010-0010-st0000100010',40000, 40000, '2026-03-07T08:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000011-0011-0011-0011-st0000110011',40000, 20000, '2026-02-10T10:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000012-0012-0012-0012-st0000120012',40000, 40000, '2026-03-06T09:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000013-0013-0013-0013-st0000130013',40000,  8000, '2026-01-25T11:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000014-0014-0014-0014-st0000140014',40000, 40000, '2026-03-13T10:00:00Z')
ON CONFLICT DO NOTHING;

-- ── 6. Fee records (last payment per student with balance) ────
INSERT INTO public.fee_records (id, school_id, student_id, amount_paid, payment_date, payment_method, receipt_number, reference_number, term)
VALUES
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000001-0001-0001-0001-st0000010001',55000,'2026-03-10','mpesa','REC-2026-001','QKW9BTA123','T1-2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000002-0002-0002-0002-st0000020002',40000,'2026-02-28','mpesa','REC-2026-002','QKW9BTB456','T1-2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000003-0003-0003-0003-st0000030003',20000,'2026-01-15','cash', 'REC-2026-003','CASH-001',   'T1-2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000004-0004-0004-0004-st0000040004',55000,'2026-03-05','mpesa','REC-2026-004','QKW9BTD789','T1-2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000005-0005-0005-0005-st0000050005', 5000,'2026-01-20','cash', 'REC-2026-005','CASH-002',   'T1-2026')
ON CONFLICT DO NOTHING;

-- ── 7. Marks (Term 1 2026 — Form 4 East students) ─────────────
INSERT INTO public.marks (id, school_id, student_id, class_id, subject_id, score, percentage, grade, exam_type, term, academic_year)
VALUES
  -- Brian: top student
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000001-0001-0001-0001-st0000010001','cc000401-0001-0001-0001-cc0004010001','ss000001-0001-0001-0001-ss0000010001',88,88,'A-','end_term','1','2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000001-0001-0001-0001-st0000010001','cc000401-0001-0001-0001-cc0004010001','ss000002-0002-0002-0002-ss0000020002',72,72,'B','end_term','1','2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000001-0001-0001-0001-st0000010001','cc000401-0001-0001-0001-cc0004010001','ss000004-0004-0004-0004-ss0000040004',79,79,'B+','end_term','1','2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000001-0001-0001-0001-st0000010001','cc000401-0001-0001-0001-cc0004010001','ss000005-0005-0005-0005-ss0000050005',82,82,'A-','end_term','1','2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000001-0001-0001-0001-st0000010001','cc000401-0001-0001-0001-cc0004010001','ss000006-0006-0006-0006-ss0000060006',75,75,'B+','end_term','1','2026'),
  -- Faith
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000002-0002-0002-0002-st0000020002','cc000401-0001-0001-0001-cc0004010001','ss000001-0001-0001-0001-ss0000010001',65,65,'B-','end_term','1','2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000002-0002-0002-0002-st0000020002','cc000401-0001-0001-0001-cc0004010001','ss000002-0002-0002-0002-ss0000020002',78,78,'B+','end_term','1','2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000002-0002-0002-0002-st0000020002','cc000401-0001-0001-0001-cc0004010001','ss000004-0004-0004-0004-ss0000040004',70,70,'B','end_term','1','2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000002-0002-0002-0002-st0000020002','cc000401-0001-0001-0001-cc0004010001','ss000005-0005-0005-0005-ss0000050005',58,58,'C+','end_term','1','2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000002-0002-0002-0002-st0000020002','cc000401-0001-0001-0001-cc0004010001','ss000006-0006-0006-0006-ss0000060006',62,62,'C+','end_term','1','2026'),
  -- Kevin (Form 3 for contrast)
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000006-0006-0006-0006-st0000060006','cc000301-0001-0001-0001-cc0003010001','ss000001-0001-0001-0001-ss0000010001',55,55,'C','end_term','1','2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000006-0006-0006-0006-st0000060006','cc000301-0001-0001-0001-cc0003010001','ss000002-0002-0002-0002-ss0000020002',68,68,'B','end_term','1','2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000006-0006-0006-0006-st0000060006','cc000301-0001-0001-0001-cc0003010001','ss000003-0003-0003-0003-ss0000030003',72,72,'B','end_term','1','2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000006-0006-0006-0006-st0000060006','cc000301-0001-0001-0001-cc0003010001','ss000004-0004-0004-0004-ss0000040004',48,48,'C-','end_term','1','2026'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000006-0006-0006-0006-st0000060006','cc000301-0001-0001-0001-cc0003010001','ss000005-0005-0005-0005-ss0000050005',51,51,'C','end_term','1','2026')
ON CONFLICT DO NOTHING;

-- ── 8. Attendance records (last 10 school days) ───────────────
DO $$
DECLARE
  d       date;
  day_off integer;
  sids    uuid[] := ARRAY[
    'st000001-0001-0001-0001-st0000010001'::uuid,
    'st000002-0002-0002-0002-st0000020002'::uuid,
    'st000003-0003-0003-0003-st0000030003'::uuid,
    'st000004-0004-0004-0004-st0000040004'::uuid,
    'st000005-0005-0005-0005-st0000050005'::uuid,
    'st000006-0006-0006-0006-st0000060006'::uuid,
    'st000007-0007-0007-0007-st0000070007'::uuid,
    'st000008-0008-0008-0008-st0000080008'::uuid
  ];
  sid     uuid;
  statuses text[] := ARRAY['present','present','present','present','absent','late','present','present','present','late'];
  i       integer;
BEGIN
  FOR day_off IN 0..9 LOOP
    d := CURRENT_DATE - (day_off * interval '1 day')::interval;
    -- Skip weekends
    IF EXTRACT(DOW FROM d) IN (0, 6) THEN CONTINUE; END IF;
    i := 1;
    FOREACH sid IN ARRAY sids LOOP
      INSERT INTO public.attendance_records (id, school_id, student_id, date, status)
      VALUES (
        gen_random_uuid(),
        '68bd8d34-f2f0-4297-bd18-093328824d84',
        sid,
        d,
        CASE WHEN (i + day_off) % 5 = 0 THEN 'absent'
             WHEN (i + day_off) % 7 = 0 THEN 'late'
             ELSE 'present' END
      )
      ON CONFLICT DO NOTHING;
      i := i + 1;
    END LOOP;
  END LOOP;
END $$;

-- ── 9. Discipline records ─────────────────────────────────────
INSERT INTO public.discipline_records
  (id, school_id, student_id, incident_date, allegation, action_taken, status, parent_informed, suspension_days)
VALUES
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000003-0003-0003-0003-st0000030003',
   '2026-03-15','Absent without leave for 3 consecutive days','Parent called, counselling session scheduled','Resolved',true,0),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000005-0005-0005-0005-st0000050005',
   '2026-04-02','Insubordination — refused to follow teacher instruction during afternoon prep','Verbal warning issued, apology letter written','Resolved',true,0),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st00000a-000a-000a-000a-st00000a000a',
   '2026-04-10','Late coming — arrived 45 minutes after assembly bell for 5 days','Extra duty assigned for 1 week','Open',false,0),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000009-0009-0009-0009-st0000090009',
   '2026-04-20','Possession of a mobile phone in class','Phone confiscated, parent summoned','Open',false,0)
ON CONFLICT DO NOTHING;

-- ── 10. Notices ───────────────────────────────────────────────
INSERT INTO public.notices
  (id, school_id, title, body, category, audience, published_at, expires_at)
VALUES
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84',
   'Term 2 2026 Opening Date',
   'Dear Parents and Guardians, Term 2 will begin on Monday 5th May 2026. All students must report by 8:00 AM. Students should come with the following: school fees, a valid medical report, and all required textbooks.',
   'Administrative','all','2026-04-20T07:00:00Z',NULL),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84',
   'KCSE Mock Examination Schedule — Term 1',
   'Form 4 students will sit for Mock examinations from 22nd April 2026 to 30th April 2026. The examination timetable has been pinned on the school notice board. Students must arrive by 7:30 AM each day.',
   'Examinations','all','2026-04-15T08:00:00Z','2026-05-01T00:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84',
   'Fee Payment Deadline — 30th April 2026',
   'This is a reminder that all school fees for Term 1 2026 must be paid in full by 30th April 2026. Students with outstanding balances of more than KES 5,000 may be sent home. Kindly make payments via M-PESA Paybill 400100, Account: Admission Number.',
   'Finance','parents','2026-04-18T07:00:00Z','2026-04-30T23:59:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84',
   'Inter-School Athletics Competition',
   'Congratulations to our athletics team for winning the Kajiado County Inter-School Athletics Trophy! The school will be hosting a celebration on Friday 25th April 2026 at 3:00 PM. All parents are welcome.',
   'Events','all','2026-04-22T06:00:00Z','2026-04-26T00:00:00Z'),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84',
   'Guidance & Counselling Sessions Available',
   'All students who need emotional support or academic guidance can book a confidential session with our Guidance & Counselling office. Walk-ins welcome every Tuesday and Thursday from 2:00 PM to 4:00 PM.',
   'Welfare','all','2026-04-10T08:00:00Z',NULL)
ON CONFLICT DO NOTHING;

-- ── 11. school_subscriptions ──────────────────────────────────
INSERT INTO public.school_subscriptions
  (id, school_id, status, trial_ends_at, amount_paid, sms_used, sms_quota, created_at)
VALUES
  (gen_random_uuid(),
   '68bd8d34-f2f0-4297-bd18-093328824d84',
   'active', NULL, 120000, 1243, 5000, '2026-01-01T00:00:00Z')
ON CONFLICT DO NOTHING;

-- ── 12. Pocket money balances (for welfare dashboard) ─────────
INSERT INTO public.pocket_money_balances (id, school_id, student_id, current_balance, total_topped_up)
VALUES
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000001-0001-0001-0001-st0000010001',850, 3000),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000002-0002-0002-0002-st0000020002',1200, 2500),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000003-0003-0003-0003-st0000030003',0,   1000),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000004-0004-0004-0004-st0000040004',600, 1500),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000005-0005-0005-0005-st0000050005',200, 1000),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000006-0006-0006-0006-st0000060006',450, 2000),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000007-0007-0007-0007-st0000070007',900, 2000),
  (gen_random_uuid(),'68bd8d34-f2f0-4297-bd18-093328824d84','st000008-0008-0008-0008-st0000080008',0,   500)
ON CONFLICT DO NOTHING;
