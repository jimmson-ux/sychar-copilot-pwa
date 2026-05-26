// Edge Function: weekly-syllabus-check
// Scheduled: Friday 16:00 EAT (cron: "0 13 * * 5" UTC)
// Compares syllabus_progress against expected_week in syllabus_topics.
// AMBER = 1 week behind, RED = 2+ weeks behind.
// Inserts school_health_alerts or pwa_notifications for HOD + Principal.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getISOWeek(date: Date): number {
  const d    = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day  = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - year.getTime()) / 86400000) + 1) / 7);
}

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

  const svc         = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const currentWeek = getISOWeek(new Date());

  const { data: schools } = await svc
    .from("schools")
    .select("id")
    .eq("is_active", true);

  let totalFlags = 0;

  for (const school of (schools ?? []) as Array<{ id: string }>) {
    const sid = school.id;

    // All in-progress or pending topics that should have been completed by now
    const { data: progress } = await svc
      .from("syllabus_progress")
      .select(`
        id, class_id, class_name, teacher_id,
        syllabus_topics!topic_id (
          topic_name, subject, class_level, expected_week
        )
      `)
      .eq("school_id", sid)
      .not("status", "in", '("Completed","Skipped")');

    if (!progress?.length) continue;

    const flagged: Array<{
      class_id: string; class_name: string; subject: string;
      topic_name: string; weeks_late: number; flag: "AMBER" | "RED";
      teacher_id: string | null;
    }> = [];

    for (const row of progress as any[]) {
      const topic      = row.syllabus_topics;
      const expected   = topic?.expected_week ?? currentWeek;
      const weeksLate  = Math.max(0, currentWeek - expected);
      if (weeksLate < 1) continue;
      flagged.push({
        class_id:   row.class_id,
        class_name: row.class_name ?? row.class_id,
        subject:    topic?.subject ?? "Unknown",
        topic_name: topic?.topic_name ?? "Unknown",
        weeks_late: weeksLate,
        flag:       weeksLate >= 2 ? "RED" : "AMBER",
        teacher_id: row.teacher_id ?? null,
      });
    }

    if (!flagged.length) continue;

    // Notify teachers with AMBER/RED topics (best-effort per-teacher summary)
    const byTeacher = new Map<string, typeof flagged>();
    for (const f of flagged) {
      if (!f.teacher_id) continue;
      if (!byTeacher.has(f.teacher_id)) byTeacher.set(f.teacher_id, []);
      byTeacher.get(f.teacher_id)!.push(f);
    }

    for (const [teacherId, items] of byTeacher) {
      const redCount   = items.filter((i) => i.flag === "RED").length;
      const amberCount = items.filter((i) => i.flag === "AMBER").length;
      const severity   = redCount > 0 ? "RED" : "AMBER";

      await svc.from("pwa_notifications").insert({
        school_id:  sid,
        teacher_id: teacherId,
        title:      `📚 Syllabus Behind Schedule`,
        message:    `${redCount} RED and ${amberCount} AMBER topics need attention. Check syllabus tracker.`,
        type:       "syllabus_alert",
        severity,
        url:        "/teacher-dashboard/scheme-of-work",
      }).throwOnError().catch(() => {});
    }

    // Notify Principal with school-wide summary
    const { data: principal } = await svc
      .from("staff_records")
      .select("id")
      .eq("school_id", sid)
      .eq("sub_role", "principal")
      .maybeSingle();

    if (principal) {
      const totalRed   = flagged.filter((f) => f.flag === "RED").length;
      const totalAmber = flagged.filter((f) => f.flag === "AMBER").length;
      await svc.from("pwa_notifications").insert({
        school_id:  sid,
        teacher_id: principal.id,
        title:      "📊 Weekly Syllabus Check",
        message:    `${totalRed} RED and ${totalAmber} AMBER topics across school. Review syllabus tracker.`,
        type:       "syllabus_summary",
        url:        "/principal/academic-overview",
      }).throwOnError().catch(() => {});
    }

    totalFlags += flagged.length;
  }

  return new Response(
    JSON.stringify({ ok: true, week: currentWeek, flags: totalFlags }),
    { headers: { "Content-Type": "application/json" } },
  );
});
