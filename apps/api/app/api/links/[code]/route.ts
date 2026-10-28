import { NextResponse } from "next/server";
import { getLinkInvite } from "@/lib/challenge-link-db";

const CODE_RE = /^[a-hjkmnp-z2-9]{8}$/;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

/** Public invite info for the /m/[code] screen — no token, no answers. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!CODE_RE.test(code)) return NextResponse.json({ error: "no_link" }, { status: 404 });
  try {
    const invite = await getLinkInvite(code);
    if (!invite) return NextResponse.json({ error: "no_link" }, { status: 404 });
    return NextResponse.json(invite);
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
