import { apiBaseUrl } from "./api-base-url";
import type { Difficulty, GameMode } from "@321guess/core";

type ClubRef = { id: string; name: string; logoUrl: string };
export type ChallengeQuestion = { index: number; clubA: ClubRef; clubB: ClubRef; totalPossible: number };
/** Mirrors the API's ClientChallengeRow — deliberately WITHOUT the
 * creator/opponent player_token fields, which the server strips at the
 * response boundary because player_token is the app's auth credential. */
export type ChallengeRow = {
  id: string;
  deliveryType: "invite" | "link" | "random" | null;
  mode: GameMode;
  difficulty: Difficulty;
  includedLeagues: string[];
  status: "waiting" | "pending" | "completed";
  createdAt: string;
  expiresAt: string;
  questions: ChallengeQuestion[];
};

export type ApiResult<T> = { status: "ok"; data: T } | { status: "expired" } | { status: "failed" };

async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return { status: "expired" };
    if (!res.ok) return { status: "failed" };
    return { status: "ok", data: (await res.json()) as T };
  } catch {
    return { status: "failed" };
  }
}

async function get<T>(path: string, token?: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.status === 401) return { status: "expired" };
    if (!res.ok) return { status: "failed" };
    return { status: "ok", data: (await res.json()) as T };
  } catch {
    return { status: "failed" };
  }
}

export function createChallenge(
  token: string,
  mode: GameMode,
  difficulty: Difficulty,
  includedLeagues: string[],
  excludedCountries: string[],
): Promise<ApiResult<ChallengeRow>> {
  return post("/api/challenges/create", { token, mode, difficulty, includedLeagues, excludedCountries });
}

export type SendResult =
  | { deliveryType: "invite" }
  | { deliveryType: "link"; url: string };

export function sendChallenge(
  token: string,
  challengeId: string,
  opponentUsername?: string,
): Promise<ApiResult<SendResult>> {
  return post(`/api/challenges/${challengeId}/send`, { token, opponentUsername });
}

export function fetchChallenge(token: string, challengeId: string): Promise<ApiResult<ChallengeRow>> {
  return get(`/api/challenges/${challengeId}`, token);
}

export function matchRandomChallenge(token: string): Promise<ApiResult<ChallengeRow & { role: "creator" | "opponent" }>> {
  return post("/api/challenges/random", { token });
}

export type ChallengeGuessResult = {
  correct: boolean;
  alreadyGuessed: boolean;
  questionTotalPossible: number;
  overallFoundCount: number;
  totalPossible: number;
};

export function submitChallengeGuess(
  token: string,
  challengeId: string,
  questionIndex: number,
  playerId: string,
): Promise<ApiResult<ChallengeGuessResult>> {
  return post(`/api/challenges/${challengeId}/guess`, { token, questionIndex, playerId });
}

export type FinishChallengeResult = {
  correctCount: number;
  totalPossible: number;
  completed: boolean;
  opponentResult: { correctCount: number; totalPossible: number; username: string } | null;
};

export function finishChallenge(token: string, challengeId: string): Promise<ApiResult<FinishChallengeResult>> {
  return post(`/api/challenges/${challengeId}/finish`, { token });
}

export type RivalryChallenge = ChallengeRow & { rivalry: { myWins: number; opponentWins: number; ties: number }; opponentUsername: string };
export type IncomingChallenge = ChallengeRow & { fromUsername: string };
/** opponentUsername is null until the challenge is sent or randomly matched. */
export type OutgoingChallenge = ChallengeRow & { opponentUsername: string | null };
export type ChallengeLinkSummary = { code: string; url: string; playedCount: number; createdAt: string; expiresAt: string };
export type ChallengeList = {
  incoming: IncomingChallenge[];
  outgoing: OutgoingChallenge[];
  completed: RivalryChallenge[];
  links: ChallengeLinkSummary[];
};

/** Public invite info for /m/[code]. `active` is false once revoked or expired. */
export type LinkInvite = {
  code: string;
  creatorUsername: string;
  creatorScore: { correctCount: number; totalPossible: number };
  mode: string;
  difficulty: string;
  playedCount: number;
  active: boolean;
};

/** A joined link copy plus the joiner's own guesses so far (never answers). */
export type JoinedChallenge = ChallengeRow & {
  myGuesses?: { questionIndex: number; playerId: string; correct: boolean }[];
};

export function createChallengeLink(token: string, challengeId: string): Promise<ApiResult<{ code: string; url: string }>> {
  return post(`/api/challenges/${challengeId}/link`, { token });
}

export function fetchLinkInvite(code: string): Promise<ApiResult<LinkInvite>> {
  return get(`/api/links/${code}`);
}

/** "gone": link revoked/expired/unknown; "own": the creator opened their own link. */
export async function joinLink(
  token: string,
  code: string,
): Promise<ApiResult<JoinedChallenge> | { status: "gone" } | { status: "own" }> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/links/${code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.status === 401) return { status: "expired" };
    if (res.status === 404 || res.status === 410) return { status: "gone" };
    if (res.status === 409) return { status: "own" };
    if (!res.ok) return { status: "failed" };
    return { status: "ok", data: (await res.json()) as JoinedChallenge };
  } catch {
    return { status: "failed" };
  }
}

export function revokeLink(token: string, code: string): Promise<ApiResult<{ revoked: true }>> {
  return post(`/api/links/${code}/revoke`, { token });
}

export function cancelChallenge(token: string, challengeId: string): Promise<ApiResult<{ cancelled: true }>> {
  return post(`/api/challenges/${challengeId}/cancel`, { token });
}

export function listChallenges(token: string): Promise<ApiResult<ChallengeList>> {
  return get(`/api/challenges/list`, token);
}

export async function searchUsernames(token: string, query: string): Promise<string[]> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.usernames) ? data.usernames : [];
  } catch {
    return [];
  }
}
