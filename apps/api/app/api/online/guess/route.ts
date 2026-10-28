import { NextResponse } from "next/server";
import { todayRoundDate } from "@/lib/daily-round";
import {
  checkGuessRateLimit,
  countCorrectGuesses,
  countCorrectGuessesForQuestion,
  getDailyRound,
  getPlayerByToken,
  recordGuess,
} from "@/lib/online-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { token?: unknown; questionIndex?: unknown; playerId?: unknown };

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

  const { token, questionIndex, playerId } = body;
  if (
    typeof token !== "string" ||
    !UUID_RE.test(token) ||
    typeof questionIndex !== "number" ||
    !Number.isInteger(questionIndex) ||
    questionIndex < 0 ||
    typeof playerId !== "string" ||
    !playerId
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    // Independent reads run in parallel: each one is a round-trip to
    // Supabase, and running them back to back made every guess feel slow on
    // device. Validation order of the responses is unchanged.
    const roundDate = todayRoundDate();
    const [player, round, rateLimit] = await Promise.all([
      getPlayerByToken(token),
      getDailyRound(roundDate),
      checkGuessRateLimit(roundDate, token),
    ]);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const question = round?.questions.find((q) => q.index === questionIndex);
    if (!round || !question) return NextResponse.json({ error: "no_round" }, { status: 400 });

    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.reason }, { status: 429 });
    }

    const correct = question.answerPlayerIds.includes(playerId);
    const { isNew } = await recordGuess(roundDate, questionIndex, token, playerId, correct);
    const [questionFoundCount, overallFoundCount] = await Promise.all([
      countCorrectGuessesForQuestion(roundDate, questionIndex, token),
      countCorrectGuesses(roundDate, token),
    ]);
    const totalPossible = round.questions.reduce((sum, q) => sum + q.answerPlayerIds.length, 0);

    return NextResponse.json({
      correct,
      alreadyGuessed: !isNew,
      questionFoundCount,
      questionTotalPossible: question.answerPlayerIds.length,
      overallFoundCount,
      totalPossible,
    });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
