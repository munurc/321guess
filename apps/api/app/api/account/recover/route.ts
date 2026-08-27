import { NextResponse } from "next/server";
import { getPlayerByAuthUserId, verifyAccessToken } from "@/lib/account-db";

type Body = { accessToken?: unknown };

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

  const { accessToken } = body;
  if (typeof accessToken !== "string" || !accessToken) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const verified = await verifyAccessToken(accessToken);
    if (!verified) return NextResponse.json({ error: "invalid_access_token" }, { status: 401 });

    const player = await getPlayerByAuthUserId(verified.id);
    if (!player) return NextResponse.json({ found: false });
    return NextResponse.json({ found: true, playerToken: player.playerToken, username: player.username });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
