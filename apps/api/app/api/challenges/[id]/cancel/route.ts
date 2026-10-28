import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { cancelChallengeAsCreator } from "@/lib/challenge-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { token?: unknown };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

/** Creator withdraws an outgoing (not yet completed) challenge. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { token } = body;
  if (typeof token !== "string" || !UUID_RE.test(token) || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const cancelled = await cancelChallengeAsCreator(id, token);
    if (!cancelled) return NextResponse.json({ error: "not_cancellable" }, { status: 404 });
    return NextResponse.json({ cancelled: true });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
