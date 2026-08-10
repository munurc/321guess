import { NextResponse } from "next/server";
import { todayRoundDate } from "@/lib/daily-round";
import { finishRound, getDailyRound, getPlayerByToken } from "@/lib/online-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { token?: unknown };

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

    // Duration is computed entirely server-side from the /api/online/start
    // timestamp (or the earliest guess as a fallback) — no client input.
    const totalPossible = round.questions.reduce((sum, q) => sum + q.answerPlayerIds.length, 0);
    const result = await finishRound(roundDate, token, player.username, totalPossible);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
