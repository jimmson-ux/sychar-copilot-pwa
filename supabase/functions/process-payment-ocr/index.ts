// Edge Function: process-payment-ocr
// Called by bursar when uploading M-Pesa SMS text or bank slip photo.
// Extracts payment details via Claude, inserts pending transaction for verification.

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

  // Auth: validate Supabase JWT
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
    type: "sms" | "image";
    inputText?: string;     // M-Pesa SMS body
    imageUrl?: string;      // bank slip image URL
    studentId: string;
    schoolId:  string;
  };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const prompt = body.type === "sms"
    ? `Extract payment data from this M-Pesa SMS message: "${body.inputText}".
       Return JSON only (no markdown): {"amount":number,"transaction_code":"string","date":"YYYY-MM-DD","sender_name":"string","sender_phone":"string"}`
    : `Extract payment data from this bank deposit slip image.
       Return JSON only (no markdown): {"amount":number,"transaction_reference":"string","date":"YYYY-MM-DD","bank_name":"string","account_name":"string"}`;

  const messages = body.type === "sms"
    ? [{ role: "user", content: prompt }]
    : [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image", source: { type: "url", url: body.imageUrl } },
        ],
      }];

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages,
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

  const amount    = Number(extracted.amount) || 0;
  const reference = String(
    extracted.transaction_code ?? extracted.transaction_reference ?? `AUTO-${Date.now()}`
  );
  const txDate    = String(extracted.date ?? new Date().toISOString().slice(0, 10));
  const mode      = body.type === "sms" ? "MPesa" : "Bank";

  const { data: tx, error: txErr } = await svc
    .from("transactions")
    .insert({
      school_id:        body.schoolId,
      student_id:       body.studentId,
      amount,
      payment_mode:     mode,
      reference_number: reference,
      transaction_date: txDate,
      status:           "Pending",
      notes:            `AI-extracted from ${mode} ${body.type}. Requires bursar verification.`,
      created_by:       user.id,
    })
    .select()
    .single();

  if (txErr) {
    return new Response(
      JSON.stringify({ error: "DB insert failed", detail: txErr.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok:                   true,
      transactionId:        tx.id,
      extracted,
      requiresVerification: true,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
