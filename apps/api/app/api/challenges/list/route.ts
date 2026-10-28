import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { listChallengesForPlayer } from "@/lib/challenge-db";
import { listLinksForCreator } from "@/lib/challenge-link-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const [result, links] = await Promise.all([listChallengesForPlayer(token), listLinksForCreator(token)]);
    return NextResponse.json({ ...result, links });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
