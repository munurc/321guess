import { apiBaseUrl } from "./api-base-url";

type ClubRef = { id: string; name: string; logoUrl: string };
export type QuestionInfo = { index: number; clubA: ClubRef; clubB: ClubRef; totalPossible: number };
export type RoundInfo = { roundDate: string; questions: QuestionInfo[]; totalPossible: number };

export type RegisterResult =
  | { ok: true; username: string }
  | { ok: false; reason: "taken" | "blocked" | "format" | "server" };

export async function registerPlayer(username: string, token: string): Promise<RegisterResult> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, token }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error === "username_taken") return { ok: false, reason: "taken" };
      if (data.error === "invalid_username_blocked") return { ok: false, reason: "blocked" };
      if (data.error === "invalid_username_format" || data.error === "invalid_body") {
        return { ok: false, reason: "format" };
      }
      return { ok: false, reason: "server" };
    }
    return { ok: true, username: data.username };
  } catch {
    return { ok: false, reason: "server" };
  }
}

export async function fetchRound(): Promise<RoundInfo | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/round`);
    if (!res.ok) return null;
    return (await res.json()) as RoundInfo;
  } catch {
    return null;
  }
}

/** Returns 401 as a distinct result (not a thrown error) so the caller can
 * tell "identity expired" apart from "network hiccup, try again". */
export async function startRound(token: string): Promise<"ok" | "expired" | "failed"> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.status === 401) return "expired";
    return res.ok ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

export type GuessResult =
  | { status: "expired" }
  | { status: "failed" }
  | { status: "ok"; correct: boolean; overallFoundCount: number };

export async function submitGuess(token: string, questionIndex: number, playerId: string): Promise<GuessResult> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/guess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, questionIndex, playerId }),
    });
    if (res.status === 401) return { status: "expired" };
    if (!res.ok) return { status: "failed" };
    const data = await res.json();
    return { status: "ok", correct: data.correct, overallFoundCount: data.overallFoundCount };
  } catch {
    return { status: "failed" };
  }
}

export type FinishApiResult =
  | { status: "expired" }
  | { status: "failed" }
  | {
      status: "ok";
      result: { correctCount: number; totalPossible: number; currentStreak: number; longestStreak: number };
    };

export async function finishRound(token: string): Promise<FinishApiResult> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.status === 401) return { status: "expired" };
    if (!res.ok) return { status: "failed" };
    return { status: "ok", result: await res.json() };
  } catch {
    return { status: "failed" };
  }
}

export async function registerPushToken(
  expoPushToken: string,
  platform: "ios" | "android",
  playerToken: string | undefined,
): Promise<void> {
  try {
    await fetch(`${apiBaseUrl()}/api/push/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: expoPushToken, platform, playerToken }),
    });
  } catch {
    // Best-effort: a failed push registration shouldn't disrupt the game.
  }
}

export type LeaderboardResponse =
  | { type: "today"; roundDate: string; entries: { username: string; correctCount: number; totalPossible: number; durationMs: number }[] }
  | { type: "total"; entries: { username: string; totalCorrect: number; daysPlayed: number }[] };

export async function fetchLeaderboard(tab: "today" | "total"): Promise<LeaderboardResponse | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/online/leaderboard?type=${tab}`);
    if (!res.ok) return null;
    return (await res.json()) as LeaderboardResponse;
  } catch {
    return null;
  }
}
