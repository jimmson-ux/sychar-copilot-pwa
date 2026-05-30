import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export const schoolOnboarding = task({
  id: "school-onboarding",
  maxDuration: 300,
  run: async (payload: { school_id: string; school_name: string; admin_email: string }) => {
    const db = svc();

    // 1. Verify school exists
    const { data: school, error } = await db
      .from("schools")
      .select("id, name")
      .eq("id", payload.school_id)
      .single();

    if (error || !school) {
      return { ok: false, message: "School not found" };
    }

    // 2. Seed academic term (Term 2 current year as default)
    const year = new Date().getFullYear();
    await db.from("academic_terms").upsert(
      {
        school_id:    payload.school_id,
        name:         `Term 1 ${year}`,
        academic_year: String(year),
        term_number:  1,
        is_current:   true,
        start_date:   `${year}-01-06`,
        end_date:     `${year}-04-11`,
      },
      { onConflict: "school_id,name,academic_year" },
    );

    // 3. Seed default study PIN (school short code)
    const { data: tc } = await db
      .from("tenant_configs")
      .select("school_short_code")
      .eq("school_id", payload.school_id)
      .maybeSingle();

    const pin = (tc as any)?.school_short_code ?? "1234";
    await db.from("tenant_configs")
      .update({ study_pin: pin })
      .eq("school_id", payload.school_id);

    // 4. Send welcome email via Resend (if configured)
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && payload.admin_email) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from:    "Sychar Copilot <noreply@sychar.co.ke>",
          to:      [payload.admin_email],
          subject: `Welcome to Sychar Copilot — ${payload.school_name}`,
          html:    `<h2>Welcome, ${payload.school_name}!</h2>
<p>Your Sychar Copilot account is set up and ready to use.</p>
<ul>
  <li>Study PIN for students: <strong>${pin}</strong></li>
  <li>Add staff from the User Admin panel</li>
  <li>Import students via CSV upload</li>
</ul>
<p>Need help? Reply to this email or visit our support portal.</p>`,
        }),
      }).catch(() => {});
    }

    return {
      ok:     true,
      school_id: payload.school_id,
      seeded: ["academic_term", "study_pin"],
      welcome_email_sent: !!(resendKey && payload.admin_email),
    };
  },
});
