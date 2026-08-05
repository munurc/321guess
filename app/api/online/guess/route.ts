import { NextResponse } from "next/server";
import { todayRoundDate } from "@/lib/daily-round";
import {
  checkGuessRateLimit,
  countCorrectGuesses,
  getDailyRound,
  getPlayerByToken,
  recordGuess,
} from "@/lib/online-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { token?: unknown; playerId?: unknown };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { token, playerId } = body;
  if (typeof token !== "string" || !UUID_RE.test(token) || typeof playerId !== "string" || !playerId) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const roundDate = todayRoundDate();
    const round = await getDailyRound(roundDate);
    if (!round) return NextResponse.json({ error: "no_round" }, { status: 400 });

    const rateLimit = await checkGuessRateLimit(roundDate, token);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.reason }, { status: 429 });
    }

    const correct = round.answerPlayerIds.includes(playerId);
    const { isNew } = await recordGuess(roundDate, token, playerId, correct);
    const foundCount = await countCorrectGuesses(roundDate, token);

    return NextResponse.json({
      correct,
      alreadyGuessed: !isNew,
      foundCount,
      totalPossible: round.answerPlayerIds.length,
    });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
