import { getSupabaseServerClient } from "./supabase";
import { pickChallengeQuestions, QUESTIONS_PER_ROUND, RANDOM_LEAGUE_IDS } from "./challenge-round";
import { applyResult, canonicalPair, type RivalryTotals } from "./rivalry";
import { isMatchableRandomChallenge } from "./challenge-eligibility";
import type { Settings } from "@321guess/core";

type ClubRef = { id: string; name: string; logoUrl: string };

export type ChallengeQuestionRow = {
  index: number;
  clubA: ClubRef;
  clubB: ClubRef;
  totalPossible: number;
};

export type ChallengeRow = {
  id: string;
  creatorToken: string;
  opponentToken: string | null;
  deliveryType: "invite" | "link" | "random" | null;
  mode: string;
  difficulty: string;
  includedLeagues: string[];
  status: "waiting" | "pending" | "completed";
  createdAt: string;
  expiresAt: string;
  questions: ChallengeQuestionRow[];
};

function mapChallengeRow(row: any, questionRows: any[]): ChallengeRow {
  return {
    id: row.id,
    creatorToken: row.creator_token,
    opponentToken: row.opponent_token,
    deliveryType: row.delivery_type,
    mode: row.mode,
    difficulty: row.difficulty,
    includedLeagues: row.included_leagues,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    questions: questionRows
      .sort((a, b) => a.question_index - b.question_index)
      .map((q) => ({
        index: q.question_index,
        clubA: { id: q.club_a_id, name: q.club_a_name, logoUrl: q.club_a_logo_url },
        clubB: { id: q.club_b_id, name: q.club_b_name, logoUrl: q.club_b_logo_url },
        totalPossible: q.answer_player_ids.length,
      })),
  };
}

// Returns the raw inserted rows (snake_case, matching the challenge_questions
// table) rather than a mapped ChallengeQuestionRow[] — callers feed these
// straight into mapChallengeRow, which is the ONE place snake_case becomes
// the client-facing camelCase shape (and the one place that must never
// forward answer_player_ids as-is; see mapChallengeRow above).
async function insertQuestions(challengeId: string, settings: Settings) {
  const supabase = getSupabaseServerClient();
  const matchups = await pickChallengeQuestions(settings, QUESTIONS_PER_ROUND);
  const rows = matchups.map((m, index) => {
    if (m.round.kind === "clubClub") {
      return {
        challenge_id: challengeId,
        question_index: index,
        club_a_id: m.round.clubA.id,
        club_a_name: m.round.clubA.name,
        club_a_logo_url: m.round.clubA.logoUrl,
        club_b_id: m.round.clubB.id,
        club_b_name: m.round.clubB.name,
        club_b_logo_url: m.round.clubB.logoUrl,
        answer_player_ids: m.round.correctPlayers.map((p) => p.id),
      };
    }
    // countryClub: store the country's "club slot" as clubA (flag), the
    // actual club as clubB — ChallengeQuestionRow has no separate country
    // field, matching how the client only ever needs two logo/flag tiles.
    return {
      challenge_id: challengeId,
      question_index: index,
      club_a_id: m.round.country.code,
      club_a_name: m.round.country.nameEn,
      club_a_logo_url: m.round.country.flagUrl,
      club_b_id: m.round.club.id,
      club_b_name: m.round.club.name,
      club_b_logo_url: m.round.club.logoUrl,
      answer_player_ids: m.round.correctPlayers.map((p) => p.id),
    };
  });
  const { error } = await supabase.from("challenge_questions").insert(rows);
  if (error) throw error;
  return rows;
}

export async function createChallenge(creatorToken: string, settings: Settings): Promise<ChallengeRow> {
  const supabase = getSupabaseServerClient();
  const { data: row, error } = await supabase
    .from("challenges")
    .insert({
      creator_token: creatorToken,
      mode: settings.mode,
      difficulty: settings.difficulty,
      included_leagues: settings.includedLeagues,
    })
    .select()
    .single();
  if (error) throw error;

  const questionRows = await insertQuestions(row.id, settings);
  return mapChallengeRow(row, questionRows);
}

export async function getChallenge(id: string): Promise<ChallengeRow | null> {
  const supabase = getSupabaseServerClient();
  const { data: row, error } = await supabase.from("challenges").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const { data: questionRows, error: qError } = await supabase
    .from("challenge_questions")
    .select("*")
    .eq("challenge_id", id);
  if (qError) throw qError;

  return mapChallengeRow(row, questionRows ?? []);
}

export async function setChallengeDelivery(
  id: string,
  delivery: "invite" | "link",
  opponentToken: string | null,
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("challenges")
    .update({
      delivery_type: delivery,
      opponent_token: opponentToken,
      status: opponentToken ? "pending" : "waiting",
    })
    .eq("id", id);
  if (error) throw error;
}

/** Atomically claims an unclaimed link/random challenge for `opponentToken`
 * — the conditional `.eq("opponent_token", null)` in the UPDATE means a
 * concurrent second claim attempt affects zero rows and gets null back,
 * rather than racing to overwrite the first claimant. */
export async function claimChallengeAsOpponent(id: string, opponentToken: string): Promise<ChallengeRow | null> {
  const supabase = getSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("challenges")
    .update({ opponent_token: opponentToken, status: "pending" })
    .eq("id", id)
    .is("opponent_token", null)
    .select();
  if (error) throw error;
  if (!rows || rows.length === 0) return null;
  return getChallenge(id);
}

/** Implements the Random Opponent flow: claim the oldest waiting random
 * challenge not created by `requesterToken` if one exists (becoming its
 * opponent, role: "opponent" — the creator already played, so this
 * player's result screen appears immediately after they finish); otherwise
 * create a brand-new one with the fixed random settings (role: "creator",
 * waiting for a future match). Supabase's PostgREST doesn't expose raw
 * `FOR UPDATE SKIP LOCKED`, so this uses the same conditional-UPDATE
 * pattern as claimChallengeAsOpponent for the race-safety that gives —
 * two simultaneous requesters can each successfully claim DIFFERENT
 * waiting rows, and if both try the same row only one UPDATE affects it. */
export async function matchOrCreateRandomChallenge(
  requesterToken: string,
): Promise<{ challenge: ChallengeRow; role: "creator" | "opponent" }> {
  const supabase = getSupabaseServerClient();
  const { data: candidates, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("delivery_type", "random")
    .eq("status", "waiting")
    .is("opponent_token", null)
    .neq("creator_token", requesterToken)
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) throw error;

  const now = new Date();
  for (const candidate of candidates ?? []) {
    const matchable = isMatchableRandomChallenge(
      {
        id: candidate.id,
        creatorToken: candidate.creator_token,
        opponentToken: candidate.opponent_token,
        deliveryType: candidate.delivery_type,
        status: candidate.status,
        expiresAt: candidate.expires_at,
      },
      requesterToken,
      now,
    );
    if (!matchable) continue;
    const claimed = await claimChallengeAsOpponent(candidate.id, requesterToken);
    if (claimed) return { challenge: claimed, role: "opponent" };
    // Lost the race for this one — try the next candidate.
  }

  const settings: Settings = {
    mode: "clubClub",
    difficulty: "easy",
    includedLeagues: RANDOM_LEAGUE_IDS,
    excludedCountries: [],
  };
  const { data: row, error: insertError } = await supabase
    .from("challenges")
    .insert({
      creator_token: requesterToken,
      delivery_type: "random",
      mode: settings.mode,
      difficulty: settings.difficulty,
      included_leagues: settings.includedLeagues,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  const questionRows = await insertQuestions(row.id, settings);
  const challenge = mapChallengeRow(row, questionRows);
  return { challenge, role: "creator" };
}

export async function recordChallengeGuess(
  challengeId: string,
  questionIndex: number,
  token: string,
  playerId: string,
  correct: boolean,
): Promise<{ isNew: boolean }> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("challenge_guesses")
    .upsert(
      { challenge_id: challengeId, question_index: questionIndex, player_token: token, guessed_player_id: playerId, correct },
      { onConflict: "challenge_id,question_index,player_token,guessed_player_id", ignoreDuplicates: true },
    )
    .select();
  if (error) throw error;
  return { isNew: (data?.length ?? 0) > 0 };
}

export async function countCorrectChallengeGuesses(challengeId: string, token: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  const { count, error } = await supabase
    .from("challenge_guesses")
    .select("*", { count: "exact", head: true })
    .eq("challenge_id", challengeId)
    .eq("player_token", token)
    .eq("correct", true);
  if (error) throw error;
  return count ?? 0;
}

export type FinishChallengeResult = {
  correctCount: number;
  totalPossible: number;
  completed: boolean;
  opponentToken: string | null;
  opponentResult: { correctCount: number; totalPossible: number; username: string } | null;
};

/** Locks in this player's score for the challenge (idempotent — a repeat
 * call reads back the original result, same pattern as
 * lib/online-db.ts's finishRound), then checks whether the OTHER side has
 * already finished. On the transition where both sides now have a score
 * (this call is whichever of the two finishes second), marks the
 * challenge completed and updates the rivalries row. */
export async function finishChallenge(
  challengeId: string,
  token: string,
  username: string,
  totalPossible: number,
): Promise<FinishChallengeResult> {
  const supabase = getSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("challenge_scores")
    .select("correct_count")
    .eq("challenge_id", challengeId)
    .eq("player_token", token)
    .maybeSingle();
  if (existingError) throw existingError;

  let correctCount: number;
  if (existing) {
    correctCount = existing.correct_count;
  } else {
    correctCount = await countCorrectChallengeGuesses(challengeId, token);
    const { error: insertError } = await supabase.from("challenge_scores").insert({
      challenge_id: challengeId,
      player_token: token,
      username,
      correct_count: correctCount,
      total_possible: totalPossible,
      duration_ms: 0,
    });
    if (insertError && insertError.code !== "23505") throw insertError;
  }

  const { data: challengeRow, error: challengeError } = await supabase
    .from("challenges")
    .select("creator_token, opponent_token")
    .eq("id", challengeId)
    .single();
  if (challengeError) throw challengeError;

  const otherToken = challengeRow.creator_token === token ? challengeRow.opponent_token : challengeRow.creator_token;
  if (!otherToken) {
    return { correctCount, totalPossible, completed: false, opponentToken: null, opponentResult: null };
  }

  const { data: otherScore, error: otherError } = await supabase
    .from("challenge_scores")
    .select("correct_count, total_possible, username")
    .eq("challenge_id", challengeId)
    .eq("player_token", otherToken)
    .maybeSingle();
  if (otherError) throw otherError;

  if (!otherScore) {
    return { correctCount, totalPossible, completed: false, opponentToken: otherToken, opponentResult: null };
  }

  // Both sides have now finished — this call is the second one. Mark
  // completed and update the rivalry (idempotent via the challenges.status
  // check: a retried finishRound call after completion just returns the
  // same result without re-applying the rivalry update).
  const { data: alreadyCompleted } = await supabase
    .from("challenges")
    .select("status")
    .eq("id", challengeId)
    .single();

  if (alreadyCompleted?.status !== "completed") {
    await supabase.from("challenges").update({ status: "completed" }).eq("id", challengeId);

    const winnerToken =
      correctCount === otherScore.correct_count
        ? null
        : correctCount > otherScore.correct_count
          ? token
          : otherToken;
    const [playerAToken, playerBToken] = canonicalPair(token, otherToken);

    const { data: rivalryRow } = await supabase
      .from("rivalries")
      .select("player_a_wins, player_b_wins, ties")
      .eq("player_a_token", playerAToken)
      .eq("player_b_token", playerBToken)
      .maybeSingle();

    const current: RivalryTotals = rivalryRow
      ? { playerAWins: rivalryRow.player_a_wins, playerBWins: rivalryRow.player_b_wins, ties: rivalryRow.ties }
      : { playerAWins: 0, playerBWins: 0, ties: 0 };
    const updated = applyResult(current, playerAToken, playerBToken, winnerToken);

    await supabase.from("rivalries").upsert(
      {
        player_a_token: playerAToken,
        player_b_token: playerBToken,
        player_a_wins: updated.playerAWins,
        player_b_wins: updated.playerBWins,
        ties: updated.ties,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_a_token,player_b_token" },
    );
  }

  return {
    correctCount,
    totalPossible,
    completed: true,
    opponentToken: otherToken,
    opponentResult: {
      correctCount: otherScore.correct_count,
      totalPossible: otherScore.total_possible,
      username: otherScore.username,
    },
  };
}

/** The only place the real answer key for a question is readable — called
 * directly by the guess/finish routes, never exposed via ChallengeRow
 * (whose ChallengeQuestionRow only carries totalPossible). */
export async function getChallengeQuestionAnswers(challengeId: string, questionIndex: number): Promise<string[] | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("challenge_questions")
    .select("answer_player_ids")
    .eq("challenge_id", challengeId)
    .eq("question_index", questionIndex)
    .maybeSingle();
  if (error) throw error;
  return data?.answer_player_ids ?? null;
}

export async function listChallengesForPlayer(playerToken: string) {
  const supabase = getSupabaseServerClient();
  const { data: created, error: createdError } = await supabase
    .from("challenges")
    .select("*")
    .eq("creator_token", playerToken)
    .order("created_at", { ascending: false });
  if (createdError) throw createdError;

  const { data: received, error: receivedError } = await supabase
    .from("challenges")
    .select("*")
    .eq("opponent_token", playerToken)
    .order("created_at", { ascending: false });
  if (receivedError) throw receivedError;

  const all = [...(created ?? []), ...(received ?? [])];
  const incoming = all.filter((c) => c.status === "pending" && c.opponent_token === playerToken);
  const outgoing = all.filter((c) => c.status === "waiting" && c.creator_token === playerToken);
  const completedRows = all.filter((c) => c.status === "completed");

  const completed = await Promise.all(
    completedRows.map(async (c) => {
      const opponentToken = c.creator_token === playerToken ? c.opponent_token : c.creator_token;
      const [playerAToken, playerBToken] = canonicalPair(playerToken, opponentToken);
      const { data: rivalryRow } = await supabase
        .from("rivalries")
        .select("player_a_wins, player_b_wins, ties")
        .eq("player_a_token", playerAToken)
        .eq("player_b_token", playerBToken)
        .maybeSingle();
      const rivalry: RivalryTotals = rivalryRow
        ? { playerAWins: rivalryRow.player_a_wins, playerBWins: rivalryRow.player_b_wins, ties: rivalryRow.ties }
        : { playerAWins: 0, playerBWins: 0, ties: 0 };
      const { data: opponentPlayer } = await supabase
        .from("online_players")
        .select("username")
        .eq("player_token", opponentToken)
        .maybeSingle();

      const { data: questionRows } = await supabase
        .from("challenge_questions")
        .select("*")
        .eq("challenge_id", c.id);
      return { ...mapChallengeRow(c, questionRows ?? []), rivalry, opponentUsername: opponentPlayer?.username ?? "?" };
    }),
  );

  const withQuestions = async (rows: any[]) =>
    Promise.all(
      rows.map(async (c) => {
        const { data: questionRows } = await supabase.from("challenge_questions").select("*").eq("challenge_id", c.id);
        return mapChallengeRow(c, questionRows ?? []);
      }),
    );

  return {
    incoming: await withQuestions(incoming),
    outgoing: await withQuestions(outgoing),
    completed,
  };
}

/** Backs the "search an existing user" step of sending a targeted
 * challenge — prefix match against username_lower (schema.sql's generated
 * column), same case-insensitivity the uniqueness constraint already uses. */
export async function searchPlayers(query: string, limit: number): Promise<{ username: string }[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("online_players")
    .select("username")
    .ilike("username_lower", `${query.toLowerCase()}%`)
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
