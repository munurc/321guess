import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { claimChallengeAsOpponent, getChallenge, toClientChallenge } from "@/lib/challenge-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    let challenge = await getChallenge(id);
    if (!challenge) return NextResponse.json({ error: "no_challenge" }, { status: 404 });

    if (challenge.opponentToken === null && challenge.creatorToken !== token) {
      const claimed = await claimChallengeAsOpponent(id, token);
      if (claimed) challenge = claimed;
      // If claiming lost the race (someone else claimed it first between
      // getChallenge and here), fall through and return the challenge as
      // read — the caller will see it's already claimed by someone else
      // and the client shows "bu meydan okuma zaten oynanmış" accordingly.
      else challenge = (await getChallenge(id))!;
    }

    return NextResponse.json(toClientChallenge(challenge));
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
