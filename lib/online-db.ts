import { getSupabaseServerClient } from "./supabase";

type ClubRef = { id: string; name: string; logoUrl: string };

export type DailyQuestionRow = {
  index: number;
  clubA: ClubRef;
  clubB: ClubRef;
  answerPlayerIds: string[];
};

export type DailyRoundRow = {
  roundDate: string;
  questions: DailyQuestionRow[];
};

export async function getDailyRound(roundDate: string): Promise<DailyRoundRow | null> {
  const supabase = getSupabaseServerClient();
  const { data: roundRow, error: roundError } = await supabase
    .from("daily_rounds")
    .select("round_date")
    .eq("round_date", roundDate)
    .maybeSingle();
  if (roundError) throw roundError;
  if (!roundRow) return null;

  const { data: questionRows, error: questionsError } = await supabase
    .from("daily_questions")
    .select("*")
    .eq("round_date", roundDate)
    .order("question_index", { ascending: true });
  if (questionsError) throw questionsError;

  return {
    roundDate,
    questions: (questionRows ?? []).map((row) => ({
      index: row.question_index,
      clubA: { id: row.club_a_id, name: row.club_a_name, logoUrl: row.club_a_logo_url },
      clubB: { id: row.club_b_id, name: row.club_b_name, logoUrl: row.club_b_logo_url },
      answerPlayerIds: row.answer_player_ids,
    })),
  };
}

type QuestionInput = { clubA: ClubRef; clubB: ClubRef; answerPlayerIds: string[] };

/** Creates today's round (all N questions) if nobody has yet, otherwise
 * returns the set that won the race — safe to call concurrently from
 * multiple first-visitors. The per-question INSERT is a single statement, so
 * it's all-or-nothing: a concurrent duplicate just hits a unique-violation
 * and is discarded rather than leaving a half-written question set. */
export async function createDailyRound(roundDate: string, questions: QuestionInput[]): Promise<DailyRoundRow> {
  const supabase = getSupabaseServerClient();
  const { error: roundError } = await supabase
    .from("daily_rounds")
    .upsert({ round_date: roundDate, question_count: questions.length }, { onConflict: "round_date", ignoreDuplicates: true });
  if (roundError) throw roundError;

  const { data: existing, error: existingError } = await supabase
    .from("daily_questions")
    .select("question_index")
    .eq("round_date", roundDate)
    .limit(1);
  if (existingError) throw existingError;

  if (!existing || existing.length === 0) {
    const { error: insertError } = await supabase.from("daily_questions").insert(
      questions.map((q, index) => ({
        round_date: roundDate,
        question_index: index,
        club_a_id: q.clubA.id,
        club_a_name: q.clubA.name,
        club_a_logo_url: q.clubA.logoUrl,
        club_b_id: q.clubB.id,
        club_b_name: q.clubB.name,
        club_b_logo_url: q.clubB.logoUrl,
        answer_player_ids: q.answerPlayerIds,
      })),
    );
    if (insertError && insertError.code !== "23505") throw insertError;
  }

  const created = await getDailyRound(roundDate);
  if (!created) throw new Error("Failed to create or read today's daily round");
  return created;
}

export async function registerPlayer(
  username: string,
  token: string,
): Promise<{ ok: true; username: string } | { ok: false; error: "taken" }> {
  const supabase = getSupabaseServerClient();

  // Idempotent: a client that already has a token but re-submits (e.g. a
  // retried request) gets its existing username back instead of an error.
  const { data: existing } = await supabase
    .from("online_players")
    .select("username")
    .eq("player_token", token)
    .maybeSingle();
  if (existing) return { ok: true, username: existing.username };

  const { error } = await supabase.from("online_players").insert({ username, player_token: token });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "taken" };
    throw error;
  }
  return { ok: true, username };
}

export async function getPlayerByToken(token: string): Promise<{ username: string } | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("online_players")
    .select("username")
    .eq("player_token", token)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Records when a player started today's round — idempotent (first call
 * wins) so restarting the tab can't reset the clock. This, not any
 * client-reported duration, is the source of truth for the speed tie-break. */
export async function recordRoundStart(roundDate: string, token: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("daily_starts")
    .upsert(
      { round_date: roundDate, player_token: token },
      { onConflict: "round_date,player_token", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function getRoundStart(roundDate: string, token: string): Promise<Date | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("daily_starts")
    .select("started_at")
    .eq("round_date", roundDate)
    .eq("player_token", token)
    .maybeSingle();
  if (error) throw error;
  return data ? new Date(data.started_at) : null;
}

export async function recordGuess(
  roundDate: string,
  questionIndex: number,
  token: string,
  playerId: string,
  correct: boolean,
): Promise<{ isNew: boolean }> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("daily_guesses")
    .upsert(
      { round_date: roundDate, question_index: questionIndex, player_token: token, guessed_player_id: playerId, correct },
      { onConflict: "round_date,question_index,player_token,guessed_player_id", ignoreDuplicates: true },
    )
    .select();
  if (error) throw error;
  return { isNew: (data?.length ?? 0) > 0 };
}

export async function countCorrectGuessesForQuestion(
  roundDate: string,
  questionIndex: number,
  token: string,
): Promise<number> {
  const supabase = getSupabaseServerClient();
  const { count, error } = await supabase
    .from("daily_guesses")
    .select("*", { count: "exact", head: true })
    .eq("round_date", roundDate)
    .eq("question_index", questionIndex)
    .eq("player_token", token)
    .eq("correct", true);
  if (error) throw error;
  return count ?? 0;
}

const MIN_GUESS_INTERVAL_MS = 250;
const MAX_GUESSES_PER_ROUND = 80;

/** Lightweight anti-abuse check: rejects guesses submitted faster than
 * MIN_GUESS_INTERVAL_MS apart, or once a token has made MAX_GUESSES_PER_ROUND
 * attempts today (correct or not) — bounds brute-forcing without needing a
 * separate rate-limiter service. */
export async function checkGuessRateLimit(
  roundDate: string,
  token: string,
): Promise<{ allowed: true } | { allowed: false; reason: "too_fast" | "too_many" }> {
  const supabase = getSupabaseServerClient();

  const { count, error: countError } = await supabase
    .from("daily_guesses")
    .select("*", { count: "exact", head: true })
    .eq("round_date", roundDate)
    .eq("player_token", token);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_GUESSES_PER_ROUND) return { allowed: false, reason: "too_many" };

  const { data: last, error: lastError } = await supabase
    .from("daily_guesses")
    .select("created_at")
    .eq("round_date", roundDate)
    .eq("player_token", token)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;
  if (last && Date.now() - new Date(last.created_at).getTime() < MIN_GUESS_INTERVAL_MS) {
    return { allowed: false, reason: "too_fast" };
  }

  return { allowed: true };
}

export async function countCorrectGuesses(roundDate: string, token: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  const { count, error } = await supabase
    .from("daily_guesses")
    .select("*", { count: "exact", head: true })
    .eq("round_date", roundDate)
    .eq("player_token", token)
    .eq("correct", true);
  if (error) throw error;
  return count ?? 0;
}

function yesterday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type FinishResult = {
  correctCount: number;
  totalPossible: number;
  currentStreak: number;
  longestStreak: number;
};

const ROUND_DURATION_MS = 1 * 60 * 1000;
const CLOCK_SKEW_SLACK_MS = 5000;

/** How long the round took, from server-recorded timestamps only — never
 * from anything the client reports. Falls back to the player's earliest
 * guess if /api/online/start was somehow never called. */
async function computeServerDuration(roundDate: string, token: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  let start = await getRoundStart(roundDate, token);
  if (!start) {
    const { data } = await supabase
      .from("daily_guesses")
      .select("created_at")
      .eq("round_date", roundDate)
      .eq("player_token", token)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    start = data ? new Date(data.created_at) : null;
  }
  if (!start) return 0;
  const elapsed = Date.now() - start.getTime();
  return Math.max(0, Math.min(elapsed, ROUND_DURATION_MS + CLOCK_SKEW_SLACK_MS));
}

/** Locks in today's score from the server's own guess tally and server-timed
 * duration (never trusts anything client-reported) and advances the streak.
 * The score row is written once, ever, per (round, token) — a repeat call
 * (reload, retry, or someone trying to shave time off an already-finished
 * round) just reads back the original result instead of overwriting it. */
export async function finishRound(
  roundDate: string,
  token: string,
  username: string,
  totalPossible: number,
): Promise<FinishResult> {
  const supabase = getSupabaseServerClient();

  const { data: existingScore, error: existingError } = await supabase
    .from("daily_scores")
    .select("correct_count")
    .eq("round_date", roundDate)
    .eq("player_token", token)
    .maybeSingle();
  if (existingError) throw existingError;

  let correctCount: number;
  if (existingScore) {
    correctCount = existingScore.correct_count;
  } else {
    correctCount = await countCorrectGuesses(roundDate, token);
    const finalDuration = await computeServerDuration(roundDate, token);
    const { error: insertError } = await supabase.from("daily_scores").insert({
      round_date: roundDate,
      player_token: token,
      username,
      correct_count: correctCount,
      total_possible: totalPossible,
      duration_ms: finalDuration,
    });
    if (insertError && insertError.code === "23505") {
      // Lost a race with a concurrent finish call — read back the winner.
      const { data: raced } = await supabase
        .from("daily_scores")
        .select("correct_count")
        .eq("round_date", roundDate)
        .eq("player_token", token)
        .maybeSingle();
      if (raced) correctCount = raced.correct_count;
    } else if (insertError) {
      throw insertError;
    }
  }

  const { data: streakRow, error: streakReadError } = await supabase
    .from("streaks")
    .select("current_streak, longest_streak, last_played_date")
    .eq("player_token", token)
    .maybeSingle();
  if (streakReadError) throw streakReadError;

  let currentStreak = 1;
  if (streakRow?.last_played_date === roundDate) {
    currentStreak = streakRow.current_streak;
  } else if (streakRow?.last_played_date === yesterday(roundDate)) {
    currentStreak = streakRow.current_streak + 1;
  }
  const longestStreak = Math.max(streakRow?.longest_streak ?? 0, currentStreak);

  const { error: streakWriteError } = await supabase.from("streaks").upsert(
    {
      player_token: token,
      username,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      last_played_date: roundDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "player_token" },
  );
  if (streakWriteError) throw streakWriteError;

  return { correctCount, totalPossible, currentStreak, longestStreak };
}

export type LeaderboardEntry = {
  username: string;
  correctCount: number;
  totalPossible: number;
  durationMs: number;
};

export async function getTodayLeaderboard(roundDate: string, limit = 20): Promise<LeaderboardEntry[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("daily_scores")
    .select("username, correct_count, total_possible, duration_ms")
    .eq("round_date", roundDate)
    .order("correct_count", { ascending: false })
    .order("duration_ms", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    username: r.username,
    correctCount: r.correct_count,
    totalPossible: r.total_possible,
    durationMs: r.duration_ms,
  }));
}

export type TotalLeaderboardEntry = {
  username: string;
  totalCorrect: number;
  daysPlayed: number;
};

/** All-time leaderboard: most correct players found across every day
 * played, regardless of streaks or gaps — reads the player_totals view
 * (a GROUP BY over daily_scores) defined in supabase/schema.sql. */
export async function getTotalLeaderboard(limit = 20): Promise<TotalLeaderboardEntry[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("player_totals")
    .select("username, total_correct, days_played")
    .order("total_correct", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    username: r.username,
    totalCorrect: r.total_correct,
    daysPlayed: r.days_played,
  }));
}
