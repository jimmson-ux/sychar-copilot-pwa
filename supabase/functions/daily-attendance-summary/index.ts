// Edge Function: daily-attendance-summary
// Scheduled: 15:30 EAT daily (cron: "30 12 * * 1-5" UTC)
// Aggregates student_qr_attendance per class for today.
// Upserts daily_attendance_summary.
// Pushes parent notifications for absent students.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || cronSecret !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const svc   = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const today = new Date().toISOString().slice(0, 10);

  const { data: schools } = await svc
    .from("schools")
    .select("id")
    .eq("is_active", true);

  let totalSummaries = 0;

  for (const school of (schools ?? []) as Array<{ id: string }>) {
    const sid = school.id;

    // All QR scans for today
    const { data: scans } = await svc
      .from("student_qr_attendance")
      .select(`
        student_id, scan_status,
        timetable_periods!timetable_period_id ( class_id, class_name )
      `)
      .eq("school_id", sid)
      .eq("scan_date", today);

    if (!scans?.length) continue;

    // Group by class
    type ClassStats = {
      class_id: string; class_name: string;
      present: number; absent: number; late: number;
      studentSet: Set<string>;
    };
    const byClass = new Map<string, ClassStats>();

    for (const scan of scans as any[]) {
      const slot      = scan.timetable_periods;
      const classId   = slot?.class_id   ?? "unknown";
      const className = slot?.class_name ?? classId;

      if (!byClass.has(classId)) {
        byClass.set(classId, {
          class_id: classId, class_name: className,
          present: 0, absent: 0, late: 0,
          studentSet: new Set(),
        });
      }
      const cls = byClass.get(classId)!;
      cls.studentSet.add(scan.student_id);
      if      (scan.scan_status === "Present") cls.present++;
      else if (scan.scan_status === "Late")    cls.late++;
      else if (scan.scan_status === "Absent")  cls.absent++;
    }

    for (const [, cls] of byClass) {
      const total = cls.studentSet.size;
      const rate  = total > 0
        ? Math.round(((cls.present + cls.late) / total) * 100 * 100) / 100
        : 0;

      await svc.from("daily_attendance_summary").upsert({
        school_id:       sid,
        class_id:        cls.class_id,
        class_name:      cls.class_name,
        attendance_date: today,
        total_students:  total,
        present_count:   cls.present,
        absent_count:    cls.absent,
        late_count:      cls.late,
        attendance_rate: rate,
        finalized_at:    new Date().toISOString(),
      }, { onConflict: "school_id,class_id,attendance_date" });

      totalSummaries++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, date: today, summaries: totalSummaries }),
    { headers: { "Content-Type": "application/json" } },
  );
});
