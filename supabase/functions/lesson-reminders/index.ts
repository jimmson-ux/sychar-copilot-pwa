/**
 * lesson-reminders — cron every 5 min
 *
 * Finds lessons starting in the next 10 minutes across all schools
 * and sends a push notification to the assigned teacher.
 *
 * Auth: x-cron-secret header
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const secret = req.headers.get("x-cron-secret");
  if (secret !== Deno.env.get("CRON_SECRET")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Current time in EAT (UTC+3) as a time string HH:MM:SS
  const nowUtc = new Date();
  const nowEat = new Date(nowUtc.getTime() + 3 * 60 * 60 * 1000);
  const eatHH  = nowEat.getUTCHours().toString().padStart(2, "0");
  const eatMM  = nowEat.getUTCMinutes().toString().padStart(2, "0");
  const nowTime = `${eatHH}:${eatMM}:00`;

  // Window: lessons starting 1–10 minutes from now
  const plusOne  = new Date(nowEat.getTime() + 1  * 60 * 1000);
  const plusTen  = new Date(nowEat.getTime() + 10 * 60 * 1000);
  const loTime   = `${plusOne.getUTCHours().toString().padStart(2,"0")}:${plusOne.getUTCMinutes().toString().padStart(2,"0")}:00`;
  const hiTime   = `${plusTen.getUTCHours().toString().padStart(2,"0")}:${plusTen.getUTCMinutes().toString().padStart(2,"0")}:00`;

  // Day of week in ISO (1=Mon … 5=Fri); skip weekends
  const isoDow = nowEat.getUTCDay(); // 0=Sun
  const dow = isoDow === 0 ? null : isoDow === 6 ? null : isoDow;
  if (!dow) return json({ skipped: "weekend" });

  // Fetch upcoming lessons
  const { data: lessons, error } = await supabase
    .from("timetable_periods")
    .select("id, school_id, class_name, subject, teacher_id, start_time, end_time, room")
    .eq("day_of_week", dow)
    .eq("period_type", "lesson")
    .eq("is_active", true)
    .gte("start_time", loTime)
    .lte("start_time", hiTime);

  if (error) {
    console.error("[lesson-reminders] fetch error:", error);
    return json({ error: error.message }, 500);
  }

  if (!lessons?.length) return json({ sent: 0, reason: "no upcoming lessons" });

  // Group by school to batch push queries
  const bySchool: Record<string, typeof lessons> = {};
  for (const l of lessons) {
    if (!bySchool[l.school_id]) bySchool[l.school_id] = [];
    bySchool[l.school_id].push(l);
  }

  let totalSent = 0;

  for (const [schoolId, schoolLessons] of Object.entries(bySchool)) {
    const teacherIds = [
      ...new Set(schoolLessons.map((l) => l.teacher_id).filter(Boolean)),
    ] as string[];

    if (!teacherIds.length) continue;

    // Check for active_schedule_overrides today that might redirect teacher_id
    const today = nowEat.toISOString().slice(0, 10);
    const { data: overrides } = await supabase
      .from("active_schedule_overrides")
      .select("original_lesson_id, new_teacher_id")
      .eq("school_id", schoolId)
      .eq("override_date", today)
      .eq("is_active", true);

    const overrideMap: Record<string, string> = {};
    for (const o of overrides ?? []) {
      if (o.new_teacher_id) overrideMap[o.original_lesson_id] = o.new_teacher_id;
    }

    // Resolve effective teacher per lesson
    const effectiveIds = [
      ...new Set(
        schoolLessons.map((l) =>
          overrideMap[l.id] ?? l.teacher_id
        ).filter(Boolean),
      ),
    ] as string[];

    // Fetch push subscriptions for these teachers
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, staff_id")
      .eq("school_id", schoolId)
      .in("staff_id", effectiveIds);

    if (!subs?.length) continue;

    // Build per-teacher lesson map for notification bodies
    const teacherLessons: Record<string, (typeof lessons)[0][]> = {};
    for (const l of schoolLessons) {
      const tid = overrideMap[l.id] ?? l.teacher_id;
      if (!tid) continue;
      if (!teacherLessons[tid]) teacherLessons[tid] = [];
      teacherLessons[tid].push(l);
    }

    // Dynamically import web-push
    const { default: webpush } = await import("npm:web-push@3.6.7");
    const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_SUB     = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@sychar.app";

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      console.warn("[lesson-reminders] VAPID keys not set");
      continue;
    }

    webpush.setVapidDetails(VAPID_SUB, VAPID_PUBLIC, VAPID_PRIVATE);

    const dead: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        const myLessons = teacherLessons[sub.staff_id] ?? [];
        if (!myLessons.length) return;

        const first = myLessons[0];
        const payload = JSON.stringify({
          title: `Lesson in ${first.start_time.slice(0, 5)}`,
          body:  `${first.subject} — ${first.class_name}${first.room ? " • " + first.room : ""}`,
          url:   "/dashboard/timetable",
          tag:   `lesson-${first.id}`,
        });

        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 300 },
          );
          totalSent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) dead.push(sub.endpoint);
        }
      }),
    );

    if (dead.length) {
      await supabase.from("push_subscriptions").delete().in("endpoint", dead);
    }
  }

  return json({ sent: totalSent, lessons: lessons.length });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
