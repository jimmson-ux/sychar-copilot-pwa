// Supabase Edge Function: early-warning
// Scheduled daily (cron) — scans exam scores and attendance,
// flags students with ≥20% grade drop or ≥30% absence rate.
// Inserts into student_flags (gc module) for the counselor dashboard.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url  = Deno.env.get("SUPABASE_URL")!;
  const key  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc  = createClient(url, key);

  const { data: schools } = await svc.from("schools").select("id").eq("is_active", true);
  const schoolList = (schools ?? []) as Array<{ id: string }>;

  let totalFlagged = 0;

  for (const school of schoolList) {
    const sid = school.id;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // ── Attendance flags ──────────────────────────────────────────────────────
    const { data: attn } = await svc
      .from("attendance_records")
      .select("student_id, status")
      .eq("school_id", sid)
      .gte("date", cutoff);

    const attByStudent = new Map<string, { present: number; total: number }>();
    for (const r of (attn ?? []) as any[]) {
      const e = attByStudent.get(r.student_id) ?? { present: 0, total: 0 };
      e.total++;
      if (r.status === "present") e.present++;
      attByStudent.set(r.student_id, e);
    }

    for (const [studentId, { present, total }] of attByStudent) {
      if (total < 5) continue;
      const absenceRate = Math.round(((total - present) / total) * 100);
      if (absenceRate >= 30) {
        await svc.from("student_flags").insert({
          school_id: sid,
          student_id: studentId,
          reason: `High absence rate: ${absenceRate}% absent in the last 30 days`,
          severity: absenceRate >= 50 ? "HIGH" : "MEDIUM",
          is_reviewed: false,
        }).catch(() => null);
        totalFlagged++;
      }
    }

    // ── Academic drop flags ───────────────────────────────────────────────────
    // Compare student's last 5 marks vs their previous 5
    const { data: allMarks } = await svc
      .from("marks")
      .select("student_id, percentage, created_at")
      .eq("school_id", sid)
      .order("created_at", { ascending: false })
      .limit(5000);

    const marksByStudent = new Map<string, number[]>();
    for (const m of (allMarks ?? []) as any[]) {
      const arr = marksByStudent.get(m.student_id) ?? [];
      arr.push(Number(m.percentage ?? 0));
      marksByStudent.set(m.student_id, arr);
    }

    for (const [studentId, scores] of marksByStudent) {
      if (scores.length < 6) continue;
      const recent = scores.slice(0, Math.ceil(scores.length / 2));
      const older  = scores.slice(Math.ceil(scores.length / 2));
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const olderAvg  = older.reduce((a, b) => a + b, 0) / older.length;
      if (olderAvg === 0) continue;
      const drop = ((olderAvg - recentAvg) / olderAvg) * 100;
      if (drop >= 20) {
        await svc.from("student_flags").insert({
          school_id: sid,
          student_id: studentId,
          reason: `Sudden academic decline: score dropped by ${drop.toFixed(1)}% (${olderAvg.toFixed(0)} → ${recentAvg.toFixed(0)})`,
          severity: drop >= 30 ? "HIGH" : "MEDIUM",
          is_reviewed: false,
        }).catch(() => null);
        totalFlagged++;
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, totalFlagged, schools: schoolList.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
