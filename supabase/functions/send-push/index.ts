/* Sychar Copilot — send web push notifications.
 *
 * Invoked from the client (or pg_cron / triggers) with:
 *   {
 *     audience: "all" | "role" | "staff" | "department",
 *     value?: string | string[],     // role name(s) | staff_id(s) | dept slug
 *     school_id: string,
 *     payload: { title, body, url?, tag?, renotify? }
 *   }
 *
 * Requires the following secrets:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: address)
 *
 * NOTE: Deploy this edge function with `supabase functions deploy send-push`
 * after creating the push_subscriptions table — see /docs/push-setup.sql.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  renotify?: boolean;
}

interface RequestBody {
  audience: "all" | "role" | "staff" | "department";
  value?: string | string[];
  school_id: string;
  payload: PushPayload;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@sychar.app";
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return json({ error: "VAPID keys not configured" }, 500);
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const body = (await req.json()) as RequestBody;
    if (!body.school_id || !body.payload?.title) {
      return json({ error: "school_id and payload.title required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve target staff_ids → push subscriptions
    let staffIds: string[] = [];
    if (body.audience === "staff") {
      staffIds = Array.isArray(body.value) ? body.value : body.value ? [body.value] : [];
    } else if (body.audience === "role") {
      const roles = Array.isArray(body.value) ? body.value : body.value ? [body.value] : [];
      const { data } = await supabase
        .from("staff_records")
        .select("id")
        .eq("school_id", body.school_id)
        .in("sub_role", roles);
      staffIds = (data ?? []).map((r) => r.id);
    } else if (body.audience === "department") {
      const depts = Array.isArray(body.value) ? body.value : body.value ? [body.value] : [];
      const { data } = await supabase
        .from("staff_records")
        .select("id")
        .eq("school_id", body.school_id)
        .in("department", depts);
      staffIds = (data ?? []).map((r) => r.id);
    } else {
      const { data } = await supabase
        .from("staff_records")
        .select("id")
        .eq("school_id", body.school_id)
        .eq("is_active", true);
      staffIds = (data ?? []).map((r) => r.id);
    }

    if (staffIds.length === 0) {
      return json({ sent: 0, reason: "no recipients" });
    }

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, staff_id")
      .in("staff_id", staffIds);

    let sent = 0, failed = 0;
    const dead: string[] = [];
    await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(body.payload),
            { TTL: 60 * 60 * 24 },
          );
          sent++;
        } catch (err) {
          failed++;
          // 404/410 = subscription gone
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) dead.push(s.endpoint);
        }
      }),
    );

    if (dead.length) {
      await supabase.from("push_subscriptions").delete().in("endpoint", dead);
    }

    return json({ sent, failed, recipients: staffIds.length, subscriptions: subs?.length ?? 0 });
  } catch (e) {
    console.error("[send-push] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}