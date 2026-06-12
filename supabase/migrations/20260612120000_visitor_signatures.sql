-- Visitor management = a tablet at the gate. The visitor signs IN on entry and signs OUT on
-- exit; the system auto-stamps the time (check_in_time / check_out_time). A visiting "host"
-- staff member is NOT required — name + reason + ID number are the only inputs.
--
-- Store the captured signatures as PNG data-URLs (small canvas captures). They are deliberately
-- kept OUT of list queries (VISITOR_SELECT) so the visitor feed stays lean — fetched only on
-- demand for a single visitor's detail/printout.
-- Additive only; safe to apply to the live shared DB.
ALTER TABLE public.visitor_log
  ADD COLUMN IF NOT EXISTS signature_in  text,
  ADD COLUMN IF NOT EXISTS signature_out text;

-- host is optional by design (visitors are logged on name/reason/ID alone).
ALTER TABLE public.visitor_log ALTER COLUMN host_staff_id DROP NOT NULL;
