import { NextResponse } from "next/server";
import { validateUsername } from "@321guess/core";
import { registerPlayer } from "@/lib/online-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { username?: unknown; token?: unknown };

// Browsers preflight cross-origin POST requests with a JSON body
// (apps/web calling this from a different origin) before sending the
// real request — next.config.ts's headers() sets the CORS headers on
// the response, but a route with no OPTIONS export gets Next.js's
// default 405 for it, which fails the preflight. An empty 204 here is
// all a preflight needs.
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

  const { username, token } = body;
  if (typeof username !== "string" || typeof token !== "string" || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const validation = validateUsername(username);
  if (!validation.valid) {
    return NextResponse.json({ error: `invalid_username_${validation.reason}` }, { status: 400 });
  }

  try {
    const result = await registerPlayer(username, token);
    if (!result.ok) {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }
    return NextResponse.json({ username: result.username });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
