/**
 * low-stock-push — called by Postgres trigger trg_low_stock_alert
 *
 * Sends a web-push notification to all storekeeper + principal staff
 * at the affected school when inventory crosses the reorder threshold.
 *
 * Auth: x-cron-secret header (reuses the same secret as cron jobs)
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface AlertBody {
  school_id:     string;
  item_id:       string;
  item_name:     string;
  current_stock: number;
  reorder_point: number;
  unit:          string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const secret = req.headers.get("x-cron-secret");
  if (secret !== Deno.env.get("CRON_SECRET")) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: AlertBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!body.school_id || !body.item_id) {
    return json({ error: "school_id and item_id required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve storekeeper + principal staff at this school
  const { data: staff } = await supabase
    .from("staff_records")
    .select("id")
    .eq("school_id", body.school_id)
    .in("sub_role", ["storekeeper", "principal", "deputy_principal", "bursar"])
    .eq("is_active", true);

  if (!staff?.length) return json({ sent: 0, reason: "no recipients" });

  const staffIds = staff.map((s) => s.id);

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, staff_id")
    .eq("school_id", body.school_id)
    .in("staff_id", staffIds);

  if (!subs?.length) return json({ sent: 0, reason: "no push subscriptions" });

  const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_SUB     = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@sychar.app";

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return json({ error: "VAPID keys not configured" }, 500);
  }

  const { default: webpush } = await import("npm:web-push@3.6.7");
  webpush.setVapidDetails(VAPID_SUB, VAPID_PUBLIC, VAPID_PRIVATE);

  const stockStr = `${body.current_stock} ${body.unit}`;
  const payload  = JSON.stringify({
    title: "⚠️ Low Stock Alert",
    body:  `${body.item_name} is at ${stockStr} — reorder point is ${body.reorder_point} ${body.unit}`,
    url:   "/dashboard/inventory",
    tag:   `low-stock-${body.item_id}`,
  });

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 * 4 }, // 4-hour TTL for low-stock alerts
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(sub.endpoint);
      }
    }),
  );

  if (dead.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", dead);
  }

  // Also log to pwa_notifications for in-app visibility
  const inserts = staffIds.map((id) => ({
    school_id:  body.school_id,
    teacher_id: id,
    title:      "Low Stock Alert",
    message:    `${body.item_name} is at ${stockStr} — reorder now`,
    type:       "inventory",
    severity:   "Amber",
    url:        "/dashboard/inventory",
  }));

  await supabase.from("pwa_notifications").insert(inserts);

  return json({ sent, recipients: subs.length });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
