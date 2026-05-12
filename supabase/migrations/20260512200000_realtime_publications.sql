-- ================================================================
-- Ensure all tables used by realtime subscriptions are in the
-- supabase_realtime publication.
-- seating_assignments was missing — realtime seat moves never fired.
-- ================================================================

DO $$
BEGIN
  -- seating_assignments (fluid seating map, realtime drag-drop)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'seating_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.seating_assignments;
  END IF;

  -- seating_moves (audit log for realtime intelligence panel)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'seating_moves'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.seating_moves;
  END IF;

  -- attendance_records (clock-in/out realtime feed)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'attendance_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
  END IF;

  -- staff_records (admin user management, role changes)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'staff_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_records;
  END IF;
END $$;
