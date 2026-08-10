import { NextResponse } from "next/server";
import { ensureDailyRound, NoDailyMatchupsError, todayRoundDate } from "@/lib/daily-round";
import type { DailyQuestionRow } from "@/lib/online-db";

function toPublicQuestion(q: DailyQuestionRow) {
  return { index: q.index, clubA: q.clubA, clubB: q.clubB, totalPossible: q.answerPlayerIds.length };
}

/**
 * Returns today's online-mode question set (never the answer lists). Lazily
 * generates it on the first request of the day via lib/daily-round.ts's
 * ensureDailyRound() — see that function for the generation details.
 */
export async function GET() {
  const roundDate = todayRoundDate();

  try {
    const round = await ensureDailyRound(roundDate);
    return NextResponse.json({
      roundDate,
      questions: round.questions.map(toPublicQuestion),
      totalPossible: round.questions.reduce((sum, q) => sum + q.answerPlayerIds.length, 0),
    });
  } catch (e) {
    if (e instanceof NoDailyMatchupsError) {
      return NextResponse.json({ error: "no_matchups" }, { status: 500 });
    }
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
