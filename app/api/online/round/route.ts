import { NextResponse } from "next/server";
import type { Player } from "@/lib/types";
import { pickDailyMatchup, todayRoundDate } from "@/lib/daily-round";
import { createDailyRound, getDailyRound } from "@/lib/online-db";

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

/**
 * Returns today's online-mode matchup (never the answer list). Lazily
 * generates it on the first request of the day using the same deterministic
 * "easy" pairing every visitor would get, then asks the existing /api/round
 * endpoint for the authoritative Wikidata answer set — falling back to the
 * local dataset intersection if that call fails, same as the local game does.
 */
export async function GET() {
  const roundDate = todayRoundDate();

  try {
    const existing = await getDailyRound(roundDate);
    if (existing) {
      return NextResponse.json({
        roundDate: existing.roundDate,
        clubA: existing.clubA,
        clubB: existing.clubB,
        totalPossible: existing.answerPlayerIds.length,
      });
    }

    const matchup = await pickDailyMatchup(roundDate);
    if (!matchup) {
      return NextResponse.json({ error: "no_matchup" }, { status: 500 });
    }

    let answerPlayerIds = matchup.fallbackAnswerPlayerIds;
    try {
      const origin = getInternalOrigin();
      const res = await fetch(`${origin}/api/round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "clubClub", clubA: matchup.clubA.id, clubB: matchup.clubB.id }),
      });
      if (res.ok) {
        const data = (await res.json()) as { players?: Player[] };
        if (Array.isArray(data.players) && data.players.length > 0) {
          answerPlayerIds = data.players.map((p) => p.id);
        }
      }
    } catch {
      // Wikidata unreachable — keep the local-dataset fallback list.
    }

    const created = await createDailyRound(roundDate, matchup.clubA, matchup.clubB, answerPlayerIds);
    return NextResponse.json({
      roundDate: created.roundDate,
      clubA: created.clubA,
      clubB: created.clubB,
      totalPossible: created.answerPlayerIds.length,
    });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
