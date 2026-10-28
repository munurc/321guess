import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { getOrCreateLink } from "@/lib/challenge-link-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

async function readToken(req: Request): Promise<string | null> {
  try {
    const body = (await req.json()) as { token?: unknown };
    return typeof body.token === "string" && UUID_RE.test(body.token) ? body.token : null;
  } catch {
    return null;
  }
}

/** Creator gets (or creates) the shareable invite link for a challenge they've finished. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await readToken(req);
  if (!token || !UUID_RE.test(id)) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });
    const result = await getOrCreateLink(id, token);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.error === "not_creator" ? 403 : 409 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
