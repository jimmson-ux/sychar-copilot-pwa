// Edge Function: process-invoice-ocr
// Called by storekeeper when a delivery note / LPO is received.
// Extracts structured line items via Claude vision, inserts into inventory_intake.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: { user }, error: authErr } = await svc.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  let body: {
    imageUrl:  string;
    schoolId:  string;
    notes?:    string;
  };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const prompt = `Extract delivery note / invoice data from this image for a Kenyan school.
Return JSON only (no markdown):
{
  "supplier_name": "string",
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "total_amount": number,
  "line_items": [
    {"item_name": "string", "quantity": number, "unit": "string", "unit_price": number, "line_total": number}
  ]
}`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image", source: { type: "url", url: body.imageUrl } },
        ],
      }],
    }),
  });

  const aiData  = await aiRes.json();
  let extracted: Record<string, unknown> = {};
  try {
    const raw = aiData?.content?.[0]?.text ?? "{}";
    extracted = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return new Response(
      JSON.stringify({ error: "AI extraction failed", raw: aiData }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }

  const { data: intake, error: dbErr } = await svc
    .from("inventory_intake")
    .insert({
      school_id:           body.schoolId,
      supplier_name:       String(extracted.supplier_name ?? ""),
      invoice_number:      String(extracted.invoice_number ?? ""),
      invoice_date:        String(extracted.invoice_date ?? new Date().toISOString().slice(0, 10)),
      total_amount:        Number(extracted.total_amount) || 0,
      document_image_url:  body.imageUrl,
      ai_extracted_data:   extracted,
      line_items:          extracted.line_items ?? [],
      verification_status: "Pending",
      notes:               body.notes ?? null,
    })
    .select()
    .single();

  if (dbErr) {
    return new Response(
      JSON.stringify({ error: "DB insert failed", detail: dbErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok:                   true,
      intakeId:             intake.id,
      extracted,
      requiresVerification: true,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
