// Edge Function: analyze-consumption
// Scheduled: Monday 06:00 EAT (cron: "0 3 * * 1" UTC)
// Calculates 30-day inventory burn rates per school.
// Uses Claude Sonnet to identify unusual patterns.
// Inserts consumption_alerts for items with < 14 days remaining.

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

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: schools } = await svc
    .from("schools")
    .select("id")
    .eq("is_active", true);

  let totalAlerts = 0;

  for (const school of (schools ?? []) as Array<{ id: string }>) {
    const sid    = school.id;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    // Fetch 30-day inventory movement
    const { data: movements } = await svc
      .from("inventory_logs")
      .select(`
        item_id, quantity_change,
        inventory_items!item_id ( name, unit, current_stock, reorder_point, category )
      `)
      .eq("school_id", sid)
      .eq("transaction_type", "ISSUE")
      .gte("server_timestamp", cutoff);

    if (!movements?.length) continue;

    // Aggregate burn rate per item
    type ItemStat = {
      item_id: string; name: string; unit: string;
      current_stock: number; reorder_point: number; category: string;
      total_issued_30d: number; weekly_rate: number; days_remaining: number;
    };
    const stats = new Map<string, ItemStat>();

    for (const m of movements as any[]) {
      const item = m.inventory_items;
      if (!item) continue;
      const id = m.item_id;
      if (!stats.has(id)) {
        stats.set(id, {
          item_id: id, name: item.name, unit: item.unit,
          current_stock: item.current_stock, reorder_point: item.reorder_point,
          category: item.category, total_issued_30d: 0, weekly_rate: 0, days_remaining: 999,
        });
      }
      stats.get(id)!.total_issued_30d += Math.abs(m.quantity_change);
    }

    for (const s of stats.values()) {
      s.weekly_rate    = s.total_issued_30d / 4.3;
      s.days_remaining = s.weekly_rate > 0
        ? Math.round((s.current_stock / s.weekly_rate) * 7)
        : 999;
    }

    const critical = [...stats.values()].filter((s) => s.days_remaining < 14);
    if (!critical.length) continue;

    // Use Claude for pattern analysis on critical items
    let aiInsights: Record<string, string> = {};
    try {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 600,
          messages: [{
            role: "user",
            content: `Analyze school inventory data for Kenya. Items running low (< 14 days).
Return JSON only: {"insights":{"<item_name>":"<1-sentence procurement recommendation>"}}
Data: ${JSON.stringify(critical.map((s) => ({
  name: s.name, category: s.category, unit: s.unit,
  days_remaining: s.days_remaining, weekly_rate: s.weekly_rate,
})))}`,
          }],
        }),
      });
      const aiData = await aiRes.json();
      const text   = aiData?.content?.[0]?.text ?? "{}";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      aiInsights   = parsed?.insights ?? {};
    } catch {
      // AI enrichment is best-effort; proceed without it
    }

    // Insert consumption alerts
    for (const s of critical) {
      const depletionDate = new Date(
        Date.now() + s.days_remaining * 24 * 60 * 60 * 1000,
      ).toISOString().slice(0, 10);

      const orderDate = new Date(
        Date.now() + Math.max(0, s.days_remaining - 7) * 24 * 60 * 60 * 1000,
      ).toISOString().slice(0, 10);

      await svc.from("consumption_alerts").insert({
        school_id:                 sid,
        item_id:                   s.item_id,
        predicted_depletion_date:  depletionDate,
        days_remaining:            s.days_remaining,
        weekly_consumption_rate:   s.weekly_rate,
        confidence_level:          s.days_remaining < 7 ? "High" : "Medium",
        reasoning:                 aiInsights[s.name] ?? `Running low: ${s.days_remaining} days of stock remaining.`,
        recommended_order_quantity: Math.ceil(s.weekly_rate * 4),
        recommended_order_date:    orderDate,
      });
      totalAlerts++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, alerts_created: totalAlerts }),
    { headers: { "Content-Type": "application/json" } },
  );
});
