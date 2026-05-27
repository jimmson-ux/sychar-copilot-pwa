/**
 * gemini-ai — Gemini 2.0 Flash inference via REST API.
 *
 * Complements the existing Anthropic (ai-insights, analyze-consumption) functions.
 * Use for: syllabus analysis, exam narratives, welfare pattern detection (cheaper at scale).
 *
 * Auth: Authorization: Bearer <service_role_key>  OR  x-cron-secret header.
 *
 * Body:
 *   {
 *     school_id: string,
 *     prompt:    string,
 *     context?:  string,   // system instruction prepended to contents
 *     use_case:  "syllabus_check" | "exam_analysis" | "welfare_alert" | "general"
 *   }
 *
 * Secrets required:
 *   GEMINI_API_KEY   ← from Google AI Studio (aistudio.google.com)
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPTS: Record<string, string> = {
  syllabus_check:
    "You are a curriculum analyst for a Kenyan secondary school. Provide concise, actionable feedback on syllabus coverage and pacing. Respond in plain text, no markdown headers.",
  exam_analysis:
    "You are an exam performance analyst for a Kenyan secondary school using CBC/8-4-4 curriculum. Identify patterns, strengths, and areas needing intervention. Be specific and data-driven.",
  welfare_alert:
    "You are a school welfare officer reviewing student welfare indicators. Identify students at risk and suggest immediate actions. Be empathetic but concise. Do not invent data.",
  general:
    "You are an intelligent assistant for Sychar school management system. Provide helpful, accurate, and concise responses.",
};

interface RequestBody {
  school_id: string;
  prompt:    string;
  context?:  string;
  use_case:  "syllabus_check" | "exam_analysis" | "welfare_alert" | "general";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth gate
  const cronSecret = Deno.env.get("CRON_SECRET") ?? Deno.env.get("X_CRON_SECRET");
  const svcRole    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";

  const isAuthorised =
    (cronSecret && cronHeader === cronSecret) ||
    (svcRole    && authHeader === `Bearer ${svcRole}`);

  if (!isAuthorised) return json({ error: "unauthorised" }, 401);

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not configured" }, 500);

    const body = (await req.json()) as RequestBody;
    if (!body.school_id || !body.prompt || !body.use_case) {
      return json({ error: "school_id, prompt, and use_case are required" }, 400);
    }

    const systemInstruction = body.context
      ? `${SYSTEM_PROMPTS[body.use_case] ?? SYSTEM_PROMPTS.general}\n\n${body.context}`
      : (SYSTEM_PROMPTS[body.use_case] ?? SYSTEM_PROMPTS.general);

    const geminiRes = await fetch(`${GEMINI_API}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: body.prompt }],
          },
        ],
        generationConfig: {
          temperature:     0.4,
          maxOutputTokens: 2048,
          topP:            0.95,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text().catch(() => "unknown");
      console.error("[gemini-ai] API error:", err);
      return json({ error: "Gemini API error", detail: err }, 502);
    }

    const geminiData = await geminiRes.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      usageMetadata?: { totalTokenCount?: number };
    };

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const tokensUsed = geminiData.usageMetadata?.totalTokenCount ?? 0;

    return json({ response: text, tokens_used: tokensUsed, model: GEMINI_MODEL });
  } catch (e) {
    console.error("[gemini-ai] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
