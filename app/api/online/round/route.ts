import { NextResponse } from "next/server";
import type { Player } from "@/lib/types";
import { pickDailyQuestions, QUESTIONS_PER_ROUND, todayRoundDate } from "@/lib/daily-round";
import { createDailyRound, getDailyRound, type DailyQuestionRow } from "@/lib/online-db";

// Deliberately NOT derived from the incoming request (e.g. new URL(req.url))
// — that origin tracks the Host header, which can be attacker-controlled
// behind some proxy configs. Since this URL's response gets frozen as the
// entire day's answer key for every player, a spoofed origin would let an
// attacker poison the shared daily puzzle. INTERNAL_BASE_URL/VERCEL_URL are
// set by the platform, not by the request.
function getInternalOrigin(): string {
  if (process.env.INTERNAL_BASE_URL) return process.env.INTERNAL_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

async function fetchLiveAnswers(clubAId: string, clubBId: string, fallback: string[]): Promise<string[]> {
  try {
    const origin = getInternalOrigin();
    const res = await fetch(`${origin}/api/round`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "clubClub", clubA: clubAId, clubB: clubBId }),
    });
    if (res.ok) {
      const data = (await res.json()) as { players?: Player[] };
      if (Array.isArray(data.players) && data.players.length > 0) {
        return data.players.map((p) => p.id);
      }
    }
  } catch {
    // Wikidata unreachable — keep the local-dataset fallback list.
  }
  return fallback;
}

function toPublicQuestion(q: DailyQuestionRow) {
  return { index: q.index, clubA: q.clubA, clubB: q.clubB, totalPossible: q.answerPlayerIds.length };
}

/**
 * Returns today's online-mode question set (never the answer lists). Lazily
 * generates it on the first request of the day: QUESTIONS_PER_ROUND
 * deterministic "easy" club×club matchups, each backed by the same
 * authoritative Wikidata answer source /api/round already uses — falling
 * back to the local dataset intersection per question if that call fails.
 */
export async function GET() {
  const roundDate = todayRoundDate();

  try {
    const existing = await getDailyRound(roundDate);
    if (existing) {
      return NextResponse.json({
        roundDate,
        questions: existing.questions.map(toPublicQuestion),
        totalPossible: existing.questions.reduce((sum, q) => sum + q.answerPlayerIds.length, 0),
      });
    }

    const matchups = await pickDailyQuestions(roundDate, QUESTIONS_PER_ROUND);
    if (matchups.length === 0) {
      return NextResponse.json({ error: "no_matchups" }, { status: 500 });
    }

    const questions = await Promise.all(
      matchups.map(async (m) => ({
        clubA: m.clubA,
        clubB: m.clubB,
        answerPlayerIds: await fetchLiveAnswers(m.clubA.id, m.clubB.id, m.fallbackAnswerPlayerIds),
      })),
    );

    const created = await createDailyRound(roundDate, questions);
    return NextResponse.json({
      roundDate,
      questions: created.questions.map(toPublicQuestion),
      totalPossible: created.questions.reduce((sum, q) => sum + q.answerPlayerIds.length, 0),
    });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
