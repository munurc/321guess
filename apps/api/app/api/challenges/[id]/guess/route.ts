import { NextResponse } from "next/server";
import { getPlayerByToken } from "@/lib/online-db";
import {
  countCorrectChallengeGuesses,
  getChallenge,
  getChallengeQuestionAnswers,
  recordChallengeGuess,
} from "@/lib/challenge-db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { token?: unknown; questionIndex?: unknown; playerId?: unknown };

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
    const player = await getPlayerByToken(token);
    if (!player) return NextResponse.json({ error: "unknown_player" }, { status: 401 });

    const challenge = await getChallenge(id);
    const question = challenge?.questions.find((q) => q.index === questionIndex);
    if (!challenge || !question) return NextResponse.json({ error: "no_challenge" }, { status: 400 });
    if (challenge.creatorToken !== token && challenge.opponentToken !== token) {
      return NextResponse.json({ error: "not_a_participant" }, { status: 403 });
    }

    const answers = await getChallengeQuestionAnswers(id, questionIndex);
    if (!answers) return NextResponse.json({ error: "no_challenge" }, { status: 400 });

    const correct = answers.includes(playerId);
    const { isNew } = await recordChallengeGuess(id, questionIndex, token, playerId, correct);
    const overallFoundCount = await countCorrectChallengeGuesses(id, token);
    const totalPossible = challenge.questions.reduce((sum, q) => sum + q.totalPossible, 0);

    return NextResponse.json({
      correct,
      alreadyGuessed: !isNew,
      questionTotalPossible: question.totalPossible,
      overallFoundCount,
      totalPossible,
    });
  } catch (e) {
    return NextResponse.json({ error: "server_error", message: (e as Error).message }, { status: 500 });
  }
}
