import { NextResponse } from "next/server";
import { upsertPushToken, type PushPlatform } from "@/lib/push-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { token?: unknown; platform?: unknown; playerToken?: unknown };

function isPushPlatform(value: unknown): value is PushPlatform {
  return value === "ios" || value === "android";
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { token, platform, playerToken } = body;
  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!isPushPlatform(platform)) {
    return NextResponse.json({ error: "invalid_platform" }, { status: 400 });
  }
  if (playerToken !== undefined && (typeof playerToken !== "string" || !UUID_RE.test(playerToken))) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    await upsertPushToken(token, platform, typeof playerToken === "string" ? playerToken : null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
