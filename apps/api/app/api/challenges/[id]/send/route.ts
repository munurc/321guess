import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { getChallenge, getPlayerTokenByUsername, setChallengeDelivery } from "@/lib/challenge-db";
import { notifyPlayer } from "@/lib/challenge-push";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { token?: unknown; opponentUsername?: unknown };

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

  const { token, opponentUsername } = body;
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (opponentUsername !== undefined && typeof opponentUsername !== "string") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const challenge = await getChallenge(id);
    if (!challenge) return NextResponse.json({ error: "no_challenge" }, { status: 400 });
    if (challenge.creatorToken !== token) return NextResponse.json({ error: "not_the_creator" }, { status: 403 });

    if (opponentUsername) {
      const opponentToken = await getPlayerTokenByUsername(opponentUsername);
      if (!opponentToken) return NextResponse.json({ error: "unknown_username" }, { status: 404 });
      if (opponentToken === token) return NextResponse.json({ error: "cannot_challenge_self" }, { status: 400 });

      // False means the challenge is no longer in a sendable state (already
      // claimed, already being played, completed, or a random one still in
      // the matching queue) — don't notify anyone or report success.
      const sent = await setChallengeDelivery(id, "invite", opponentToken);
      if (!sent) return NextResponse.json({ error: "not_sendable" }, { status: 409 });

      await notifyPlayer(
        opponentToken,
        "Sana meydan okundu!",
        `${player.username} seni bir meydan okumaya davet etti — skorunu geç.`,
      );
      return NextResponse.json({ deliveryType: "invite" });
    }

    const linked = await setChallengeDelivery(id, "link", null);
    if (!linked) return NextResponse.json({ error: "not_sendable" }, { status: 409 });
    return NextResponse.json({ deliveryType: "link", url: `https://www.321guess.com/challenge/${id}` });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
