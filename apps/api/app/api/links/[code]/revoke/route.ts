import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { revokeLink } from "@/lib/challenge-link-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[a-hjkmnp-z2-9]{8}$/;

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

/** Creator stops a link accepting new players; already-played results stay. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const token = await readToken(req);
  if (!token) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  if (!CODE_RE.test(code)) return NextResponse.json({ error: "not_revocable" }, { status: 404 });
  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });
    const revoked = await revokeLink(code, token);
    if (!revoked) return NextResponse.json({ error: "not_revocable" }, { status: 404 });
    return NextResponse.json({ revoked: true });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
