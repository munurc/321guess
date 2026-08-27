import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import { createChallenge, toClientChallenge } from "@/lib/challenge-db";
import type { Difficulty, GameMode } from "@321guess/core";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES: GameMode[] = ["clubClub", "countryClub"];
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

type Body = {
  token?: unknown;
  mode?: unknown;
  difficulty?: unknown;
  includedLeagues?: unknown;
  excludedCountries?: unknown;
};

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

  const { token, mode, difficulty, includedLeagues, excludedCountries } = body;
  if (
    excludedCountries !== undefined &&
    (!Array.isArray(excludedCountries) || !excludedCountries.every((c) => typeof c === "string"))
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (
    typeof token !== "string" ||
    !UUID_RE.test(token) ||
    typeof mode !== "string" ||
    !MODES.includes(mode as GameMode) ||
    typeof difficulty !== "string" ||
    !DIFFICULTIES.includes(difficulty as Difficulty) ||
    !Array.isArray(includedLeagues) ||
    includedLeagues.length === 0 ||
    !includedLeagues.every((l) => typeof l === "string")
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const challenge = await createChallenge(token, {
      mode: mode as GameMode,
      difficulty: difficulty as Difficulty,
      includedLeagues: includedLeagues as string[],
      excludedCountries: (excludedCountries as string[] | undefined) ?? [],
    });
    return NextResponse.json(toClientChallenge(challenge));
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
