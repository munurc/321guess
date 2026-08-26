import { apiBaseUrl } from "./api-base-url";
import type { Difficulty, GameMode } from "@321guess/core";

type ClubRef = { id: string; name: string; logoUrl: string };
export type ChallengeQuestion = { index: number; clubA: ClubRef; clubB: ClubRef; totalPossible: number };
export type ChallengeRow = {
  id: string;
  creatorToken: string;
  opponentToken: string | null;
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

async function get<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`);
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
): Promise<ApiResult<ChallengeRow>> {
  return post("/api/challenges/create", { token, mode, difficulty, includedLeagues });
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
  return get(`/api/challenges/${challengeId}?token=${token}`);
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

export type RivalryChallenge = ChallengeRow & { rivalry: { playerAWins: number; playerBWins: number; ties: number }; opponentUsername: string };
export type ChallengeList = { incoming: ChallengeRow[]; outgoing: ChallengeRow[]; completed: RivalryChallenge[] };

export function listChallenges(token: string): Promise<ApiResult<ChallengeList>> {
  return get(`/api/challenges/list?token=${token}`);
}

export async function searchUsernames(query: string): Promise<string[]> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.usernames) ? data.usernames : [];
  } catch {
    return [];
  }
}
