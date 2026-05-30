import { Receiver } from "@upstash/qstash";
import { tasks } from "@trigger.dev/sdk/v3";
import { NextResponse } from "next/server";

async function verifyQStash(req: Request, body: string): Promise<void> {
  const currentKey = process.env.QSTASH_CURRENT_KEY;
  const nextKey    = process.env.QSTASH_NEXT_KEY;
  if (!currentKey || !nextKey) {
    if (process.env.NODE_ENV === "production") throw new Error("QStash keys not configured");
    return;
  }
  const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
  const sig = req.headers.get("upstash-signature") ?? "";
  const valid = await receiver.verify({ signature: sig, body });
  if (!valid) throw new Error("Invalid QStash signature");
}

export async function POST(req: Request) {
  const body = await req.text();
  try {
    await verifyQStash(req, body);

    const apiKey = process.env.TRIGGER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "TRIGGER_API_KEY not set" }, { status: 500 });
    }

    const payload = body ? JSON.parse(body) : {};
    const { school_id, school_name, admin_email } = payload as {
      school_id?: string;
      school_name?: string;
      admin_email?: string;
    };

    if (!school_id) {
      return NextResponse.json({ error: "school_id is required" }, { status: 400 });
    }

    const handle = await tasks.trigger("school-onboarding", {
      school_id,
      school_name: school_name ?? "",
      admin_email: admin_email ?? "",
    });

    return NextResponse.json({ ok: true, run_id: handle.id });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    const status = msg.includes("signature") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
