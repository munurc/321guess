import { NextResponse } from "next/server";
import { todayRoundDate } from "@/lib/daily-round";
import { getDailyRound, getPlayerByToken, recordRoundStart } from "@/lib/online-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { token?: unknown };

// Browsers preflight cross-origin POST requests with a JSON body
// (apps/web calling this from a different origin) before sending the
// real request — next.config.ts's headers() sets the CORS headers on
// the response, but a route with no OPTIONS export gets Next.js's
// default 405 for it, which fails the preflight. An empty 204 here is
// all a preflight needs.
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

/** Marks the moment a player begins today's round — the only input the speed
 * tie-break trusts. Idempotent: calling it again (reload, resumed session)
 * doesn't reset the clock. */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { token } = body;
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const roundDate = todayRoundDate();
    const round = await getDailyRound(roundDate);
    if (!round) return NextResponse.json({ error: "no_round" }, { status: 400 });

    await recordRoundStart(roundDate, token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
