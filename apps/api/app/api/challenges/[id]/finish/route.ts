import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { finishChallenge, getChallenge } from "@/lib/challenge-db";
import { notifyPlayer } from "@/lib/challenge-push";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { token?: unknown };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

    const challenge = await getChallenge(id);
    if (!challenge) return NextResponse.json({ error: "no_challenge" }, { status: 400 });
    if (challenge.creatorToken !== token && challenge.opponentToken !== token) {
      return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
    }

    const totalPossible = challenge.questions.reduce((sum, q) => sum + q.totalPossible, 0);
    const result = await finishChallenge(id, token, player.username, totalPossible);

    if (result.newlyCompleted && result.opponentToken) {
      // Whoever just finished second sees the result immediately in this
      // response — this push is for the OTHER player, who finished first
      // and has been waiting.
      await notifyPlayer(
        result.opponentToken,
        "Meydan okuman sonuçlandı!",
        `${player.username} da oynadı — sonucu görmek için dokun.`,
      );
    }

    return NextResponse.json({
      correctCount: result.correctCount,
      totalPossible: result.totalPossible,
      completed: result.completed,
      opponentResult: result.opponentResult,
    });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
