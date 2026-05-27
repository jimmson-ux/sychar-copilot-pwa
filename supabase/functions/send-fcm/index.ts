/**
 * send-fcm — Firebase Cloud Messaging delivery via FCM HTTP v1 REST API.
 *
 * Auth: Authorization: Bearer <service_role_key>  OR  x-cron-secret header.
 *
 * Body:
 *   {
 *     school_id: string,
 *     audience:  "all" | "role" | "staff" | "department",
 *     value?:    string | string[],   // role name(s) | staff_id(s) | dept slug
 *     payload:   { title, body, url?, tag? }
 *   }
 *
 * Secrets required (set via `supabase secrets set`):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_SERVICE_ACCOUNT_JSON   ← full service-account key JSON
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface FcmPayload {
  title: string;
  body:  string;
  url?:  string;
  tag?:  string;
}

interface RequestBody {
  school_id: string;
  audience:  "all" | "role" | "staff" | "department";
  value?:    string | string[];
  payload:   FcmPayload;
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
    const PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID");
    const SA_JSON    = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
    if (!PROJECT_ID || !SA_JSON) {
      return json({ error: "FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_JSON required" }, 500);
    }

    const body = (await req.json()) as RequestBody;
    if (!body.school_id || !body.payload?.title) {
      return json({ error: "school_id and payload.title required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve target staff_ids
    let staffIds: string[] = [];
    if (body.audience === "staff") {
      staffIds = Array.isArray(body.value) ? body.value : body.value ? [body.value] : [];
    } else if (body.audience === "role") {
      const roles = Array.isArray(body.value) ? body.value : body.value ? [body.value] : [];
      const { data } = await supabase
        .from("staff_records").select("id")
        .eq("school_id", body.school_id).in("sub_role", roles);
      staffIds = (data ?? []).map((r) => r.id);
    } else if (body.audience === "department") {
      const depts = Array.isArray(body.value) ? body.value : body.value ? [body.value] : [];
      const { data } = await supabase
        .from("staff_records").select("id")
        .eq("school_id", body.school_id).in("department", depts);
      staffIds = (data ?? []).map((r) => r.id);
    } else {
      const { data } = await supabase
        .from("staff_records").select("id")
        .eq("school_id", body.school_id).eq("is_active", true);
      staffIds = (data ?? []).map((r) => r.id);
    }

    if (staffIds.length === 0) return json({ sent: 0, reason: "no recipients" });

    const { data: tokens } = await supabase
      .from("fcm_tokens")
      .select("id, fcm_token, staff_id")
      .in("staff_id", staffIds)
      .eq("is_active", true);

    if (!tokens?.length) return json({ sent: 0, reason: "no fcm tokens" });

    const accessToken = await getGoogleAccessToken(SA_JSON);
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

    let sent = 0;
    let failed = 0;
    const staleIds: string[] = [];

    await Promise.allSettled(
      tokens.map(async (t: { id: string; fcm_token: string; staff_id: string }) => {
        try {
          const res = await fetch(fcmUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: t.fcm_token,
                notification: { title: body.payload.title, body: body.payload.body },
                data: {
                  url: body.payload.url ?? "",
                  tag: body.payload.tag ?? "",
                },
                webpush: {
                  notification: {
                    icon: "/icon-192.png",
                    badge: "/icon-192.png",
                    tag: body.payload.tag,
                    vibrate: [200, 100, 200],
                  },
                  fcm_options: { link: body.payload.url ?? "/" },
                },
              },
            }),
          });

          if (res.ok) {
            sent++;
          } else {
            const err = await res.json().catch(() => ({})) as { error?: { details?: Array<{ errorCode?: string }> } };
            const code = err?.error?.details?.[0]?.errorCode ?? "";
            if (code === "UNREGISTERED" || code === "INVALID_ARGUMENT") {
              staleIds.push(t.id);
            }
            failed++;
          }
        } catch {
          failed++;
        }
      }),
    );

    // Deactivate stale tokens
    if (staleIds.length) {
      await supabase.from("fcm_tokens").update({ is_active: false }).in("id", staleIds);
    }

    return json({ sent, failed, recipients: staffIds.length, tokens: tokens.length });
  } catch (e) {
    console.error("[send-fcm] error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});

// ── OAuth2 JWT Bearer token for Google APIs ───────────────────────────────────

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson) as {
    client_email: string;
    private_key:  string;
  };

  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss:   sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  }));

  const signingInput = `${header}.${payload}`;

  const pemBody = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const derBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    derBytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  const b64sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signingInput}.${b64sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  const tokenData = await tokenRes.json() as { access_token: string };
  return tokenData.access_token;
}

function b64url(s: string): string {
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
