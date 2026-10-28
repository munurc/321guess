// Pure decisions for the /m/[code] invite flow, kept out of the component so
// they can be unit-tested.
import type { ApiResult, ChallengeRow, JoinedChallenge, LinkInvite } from "./challenge-api";
import type { Identity } from "./online-storage";

/** What to do when the invite page opens. A revoked/expired link may still
 * hold this browser's finished copy, so with an identity we ask the server
 * (join returns an existing copy even after revoke) instead of showing
 * "no longer active" to someone who already played. */
export function shouldTryJoinOnOpen(
  res: ApiResult<LinkInvite>,
  identity: Identity | null,
): "invite" | "rejoin" | "inactive" | "own" {
  if (res.status !== "ok") return "inactive";
  // Usernames are unique, so this is the creator opening their own link:
  // skip the "X challenged you" screen they can't play anyway.
  if (identity && identity.username.toLowerCase() === res.data.creatorUsername.toLowerCase()) return "own";
  if (res.data.active) return "invite";
  return identity ? "rejoin" : "inactive";
}

export type JoinOutcome =
  | { kind: "countdown"; challenge: JoinedChallenge }
  | { kind: "load-result"; challenge: ChallengeRow }
  | { kind: "inactive" }
  | { kind: "own" }
  | { kind: "username"; error: "expired" }
  | { kind: "error" };

export function phaseAfterJoin(
  res: ApiResult<JoinedChallenge> | { status: "gone" } | { status: "own" },
): JoinOutcome {
  switch (res.status) {
    case "ok":
      return res.data.status === "completed"
        ? { kind: "load-result", challenge: res.data }
        : { kind: "countdown", challenge: res.data };
    case "gone":
      return { kind: "inactive" };
    case "own":
      return { kind: "own" };
    case "expired":
      return { kind: "username", error: "expired" };
    default:
      return { kind: "error" };
  }
}

export type MyGuess = { questionIndex: number; playerId: string; correct: boolean };

/** Where a reopened, partly played copy picks up: the last question the
 * player guessed on, with that question's chips restored. Guesses are
 * stored server-side and idempotent, so nothing is lost by resuming. */
export function resumePoint(
  guesses: MyGuess[],
  questionCount: number,
): { questionIndex: number; foundIds: string[]; wrongIds: string[] } {
  if (guesses.length === 0) return { questionIndex: 0, foundIds: [], wrongIds: [] };
  const last = Math.min(Math.max(...guesses.map((g) => g.questionIndex)), questionCount - 1);
  const here = guesses.filter((g) => g.questionIndex === last);
  return {
    questionIndex: last,
    foundIds: here.filter((g) => g.correct).map((g) => g.playerId),
    wrongIds: here.filter((g) => !g.correct).map((g) => g.playerId),
  };
}
