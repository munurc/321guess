import { getSupabaseServerClient } from "./supabase";
import { getChallenge, setChallengeDelivery, type ChallengeRow } from "./challenge-db";
import { generateLinkCode, isLinkJoinable, linkUrl } from "./challenge-link";

const UNIQUE_VIOLATION = "23505";

export type LinkInvite = {
  code: string;
  creatorUsername: string;
  creatorScore: { correctCount: number; totalPossible: number };
  mode: string;
  difficulty: string;
  playedCount: number;
  active: boolean;
};

export type LinkSummary = { code: string; url: string; playedCount: number; createdAt: string; expiresAt: string };

async function countCompletedClones(code: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  const { count, error } = await supabase
    .from("challenges")
    .select("*", { count: "exact", head: true })
    .eq("link_code", code)
    .eq("status", "completed");
  if (error) throw error;
  return count ?? 0;
}

async function findActiveLink(sourceChallengeId: string): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("challenge_links")
    .select("code")
    .eq("source_challenge_id", sourceChallengeId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.code ?? null;
}

/** Creates the invite link for a challenge its creator has already played,
 * or returns the existing active one. The creator's score must exist: the
 * link shares it, and every clone copies it. */
export async function getOrCreateLink(
  sourceChallengeId: string,
  creatorToken: string,
): Promise<{ code: string; url: string } | { error: "not_creator" | "not_finished" | "not_linkable" }> {
  const supabase = getSupabaseServerClient();
  const source = await getChallenge(sourceChallengeId);
  if (!source || source.creatorToken !== creatorToken) return { error: "not_creator" };

  const { data: score, error: scoreError } = await supabase
    .from("challenge_scores")
    .select("challenge_id")
    .eq("challenge_id", sourceChallengeId)
    .eq("player_token", creatorToken)
    .maybeSingle();
  if (scoreError) throw scoreError;
  if (!score) return { error: "not_finished" };

  const existing = await findActiveLink(sourceChallengeId);
  if (existing) return { code: existing, url: linkUrl(existing) };

  // Marks the source as link-delivered. Only one concurrent caller can win
  // this conditional update; a loser re-checks for the winner's link (a
  // double tap). Otherwise it was already sent to a username or is a
  // random-queue challenge, and can't also be a link.
  const marked = await setChallengeDelivery(sourceChallengeId, "link", null);
  if (!marked) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const raced = await findActiveLink(sourceChallengeId);
      if (raced) return { code: raced, url: linkUrl(raced) };
      await new Promise((r) => setTimeout(r, 200));
    }
    return { error: "not_linkable" };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateLinkCode();
    const { error } = await supabase
      .from("challenge_links")
      .insert({ code, source_challenge_id: sourceChallengeId, creator_token: creatorToken });
    if (!error) return { code, url: linkUrl(code) };
    if (error.code !== UNIQUE_VIOLATION) throw error;
  }
  throw new Error("could not allocate a unique link code");
}

/** Public, token-free view of a link for the invite screen. Never includes
 * answers or tokens. */
export async function getLinkInvite(code: string): Promise<LinkInvite | null> {
  const supabase = getSupabaseServerClient();
  const { data: link, error } = await supabase.from("challenge_links").select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  if (!link) return null;

  const [{ data: source, error: sourceError }, { data: score, error: scoreError }, playedCount] = await Promise.all([
    supabase.from("challenges").select("mode, difficulty").eq("id", link.source_challenge_id).single(),
    supabase
      .from("challenge_scores")
      .select("username, correct_count, total_possible")
      .eq("challenge_id", link.source_challenge_id)
      .eq("player_token", link.creator_token)
      .single(),
    countCompletedClones(code),
  ]);
  if (sourceError) throw sourceError;
  if (scoreError) throw scoreError;

  return {
    code,
    creatorUsername: score.username,
    creatorScore: { correctCount: score.correct_count, totalPossible: score.total_possible },
    mode: source.mode,
    difficulty: source.difficulty,
    playedCount,
    active: !link.revoked_at && new Date(link.expires_at).getTime() > Date.now(),
  };
}

export async function listMyGuesses(
  challengeId: string,
  token: string,
): Promise<{ questionIndex: number; playerId: string; correct: boolean }[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("challenge_guesses")
    .select("question_index, guessed_player_id, correct, created_at")
    .eq("challenge_id", challengeId)
    .eq("player_token", token)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((g) => ({ questionIndex: g.question_index, playerId: g.guessed_player_id, correct: g.correct }));
}

/** A copy is complete once its questions exist: the creator's score goes in
 * first and the questions last, in a single insert. */
const isComplete = (c: ChallengeRow) => c.questions.length > 0;

/** Waits briefly for a concurrent join of the same player to finish copying. */
async function waitForCompleteClone(code: string, joinerToken: string): Promise<ChallengeRow | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const clone = await findClone(code, joinerToken);
    if (!clone) return null;
    if (isComplete(clone)) return clone;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

async function deleteClone(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  for (const table of ["challenge_guesses", "challenge_scores", "challenge_questions"]) {
    const { error } = await supabase.from(table).delete().eq("challenge_id", id);
    if (error) console.error(`clone cleanup: ${table} for ${id}`, error);
  }
  const { error } = await supabase.from("challenges").delete().eq("id", id);
  if (error) console.error(`clone cleanup: challenge ${id}`, error);
}

async function findClone(code: string, joinerToken: string): Promise<ChallengeRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("challenges")
    .select("id")
    .eq("link_code", code)
    .eq("opponent_token", joinerToken)
    .maybeSingle();
  if (error) throw error;
  return data ? getChallenge(data.id) : null;
}

/** Returns the joiner's own 1-to-1 copy of the linked challenge, creating
 * it on first join. A player who already joined always gets their existing
 * copy back — even after the link is revoked or expired — so a reopen lands
 * on their result rather than a second attempt. */
export async function joinLink(
  code: string,
  joinerToken: string,
): Promise<{ challenge: ChallengeRow } | { error: "not_found" | "revoked" | "expired" | "own_link" }> {
  const supabase = getSupabaseServerClient();
  const { data: link, error } = await supabase.from("challenge_links").select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  if (!link) return { error: "not_found" };

  const existing = await findClone(code, joinerToken);
  if (existing) {
    if (isComplete(existing)) return { challenge: existing };
    // Half-built: a concurrent join is still copying, or a failed copy left
    // it behind. Wait for the first; clear the second and build afresh.
    const ready = await waitForCompleteClone(code, joinerToken);
    if (ready) return { challenge: ready };
    await deleteClone(existing.id);
  }

  const joinable = isLinkJoinable(
    { creatorToken: link.creator_token, expiresAt: link.expires_at, revokedAt: link.revoked_at },
    joinerToken,
    new Date(),
  );
  if (!joinable.ok) return { error: joinable.reason };

  const { data: source, error: sourceError } = await supabase
    .from("challenges")
    .select("mode, difficulty, included_leagues")
    .eq("id", link.source_challenge_id)
    .single();
  if (sourceError) throw sourceError;

  const { data: clone, error: insertError } = await supabase
    .from("challenges")
    .insert({
      creator_token: link.creator_token,
      opponent_token: joinerToken,
      delivery_type: "link",
      status: "pending",
      link_code: code,
      mode: source.mode,
      difficulty: source.difficulty,
      included_leagues: source.included_leagues,
      expires_at: link.expires_at,
    })
    .select("id")
    .single();
  if (insertError) {
    // A concurrent join by the same player won the unique index race.
    if (insertError.code === UNIQUE_VIOLATION) {
      const raced = await waitForCompleteClone(code, joinerToken);
      if (raced) return { challenge: raced };
    }
    throw insertError;
  }

  try {
    const [{ data: questions, error: qError }, { data: creatorScore, error: sError }] = await Promise.all([
      supabase.from("challenge_questions").select("*").eq("challenge_id", link.source_challenge_id),
      supabase
        .from("challenge_scores")
        .select("*")
        .eq("challenge_id", link.source_challenge_id)
        .eq("player_token", link.creator_token)
        .single(),
    ]);
    if (qError) throw qError;
    if (sError) throw sError;

    // Score first, questions last: questions present = copy complete.
    const { error: sInsertError } = await supabase
      .from("challenge_scores")
      .insert({ ...creatorScore, challenge_id: clone.id });
    if (sInsertError) throw sInsertError;
    const { error: qInsertError } = await supabase
      .from("challenge_questions")
      .insert((questions ?? []).map((q) => ({ ...q, challenge_id: clone.id })));
    if (qInsertError) throw qInsertError;
  } catch (e) {
    await deleteClone(clone.id);
    throw e;
  }

  return { challenge: (await getChallenge(clone.id))! };
}

/** Stops a link accepting new players. Clones already played are kept. */
export async function revokeLink(code: string, creatorToken: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("challenge_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("code", code)
    .eq("creator_token", creatorToken)
    .is("revoked_at", null)
    .select("code");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function listLinksForCreator(creatorToken: string): Promise<LinkSummary[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("challenge_links")
    .select("code, created_at, expires_at")
    .eq("creator_token", creatorToken)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return Promise.all(
    (data ?? []).map(async (l) => ({
      code: l.code,
      url: linkUrl(l.code),
      playedCount: await countCompletedClones(l.code),
      createdAt: l.created_at,
      expiresAt: l.expires_at,
    })),
  );
}
