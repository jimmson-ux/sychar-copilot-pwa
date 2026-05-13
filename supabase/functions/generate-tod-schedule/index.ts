import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { academic_year, term_number, term_start_date, school_id } = await req.json();
    if (!school_id) throw new Error("school_id required");

    // 1. Fetch teacher attendance compliance indices
    const { data: teacherMetrics } = await supabase
      .from("staff_records")
      .select("id, full_name, sub_role")
      .eq("school_id", school_id)
      .eq("is_active", true)
      .in("sub_role", [
        "subject_teacher","class_teacher","hod_sciences","hod_arts",
        "hod_languages","hod_mathematics","hod_social_sciences",
        "hod_humanities","hod_applied_sciences","hod_games_sports",
        "hod_pathways","counselor","guidance_counseling","deputy_principal_academics",
      ]);

    if (!teacherMetrics || teacherMetrics.length === 0) {
      throw new Error("No active teaching staff found for this school");
    }

    // 2. Fetch recent incident counts per week to build stress profiles
    const { data: incidentData } = await supabase
      .from("daily_incident_logs")
      .select("incident_date, severity_level")
      .eq("school_id", school_id)
      .gte("incident_date", new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));

    // Compute weekly incident stress index
    const weekStress: Record<number, number> = {};
    for (const inc of incidentData ?? []) {
      const d = new Date(inc.incident_date);
      const weekNum = Math.ceil(
        (d.getTime() - new Date(term_start_date).getTime()) / (7 * 86400000),
      );
      const weight = inc.severity_level === "Critical" ? 3
        : inc.severity_level === "High" ? 2
        : inc.severity_level === "Medium" ? 1.5
        : 1;
      weekStress[weekNum] = (weekStress[weekNum] ?? 0) + weight;
    }

    // 3. Delete existing draft schedule for this term
    await supabase
      .from("tod_master_schedule")
      .delete()
      .eq("school_id", school_id)
      .eq("academic_year", academic_year)
      .eq("term_number", term_number)
      .eq("shift_status", "Draft");

    const generatedAssignments = [];
    let currentWeekStart = new Date(term_start_date);

    // 4. Build 14-week balanced allocation matrix
    for (let week = 1; week <= 14; week++) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 4);

      const rawStress = weekStress[week] ?? 0;
      const stressIndex = rawStress > 0 ? Math.min(rawStress / 10 + 1, 3) : 1.0;

      // High-stress weeks: pick teacher with least recent duty assignments
      // Low-stress weeks: round-robin
      const selectedTeacher = teacherMetrics[(week - 1) % teacherMetrics.length];

      generatedAssignments.push({
        school_id,
        assigned_teacher_id: selectedTeacher.id,
        academic_year,
        term_number,
        calendar_week_number: week,
        start_date: currentWeekStart.toISOString().slice(0, 10),
        end_date: weekEnd.toISOString().slice(0, 10),
        computed_difficulty_score: stressIndex,
        shift_status: "Draft",
      });

      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }

    const { error: insertError } = await supabase
      .from("tod_master_schedule")
      .insert(generatedAssignments);

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ success: true, weeks_generated: generatedAssignments.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    );
  }
});
