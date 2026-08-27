import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { linkAccount, verifyAccessToken } from "@/lib/account-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { playerToken?: unknown; accessToken?: unknown };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { playerToken, accessToken } = body;
  if (typeof playerToken !== "string" || !UUID_RE.test(playerToken) || typeof accessToken !== "string" || !accessToken) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(playerToken);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const verified = await verifyAccessToken(accessToken);
    if (!verified) return NextResponse.json({ error: "invalid_access_token" }, { status: 401 });

    await linkAccount(playerToken, verified.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
