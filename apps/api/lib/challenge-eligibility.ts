export function isExpired(expiresAt: string, now: Date): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export type MatchableChallenge = {
  id: string;
  creatorToken: string;
  opponentToken: string | null;
  deliveryType: string | null;
  status: string;
  expiresAt: string;
};

/** Whether `requesterToken` may be matched into `challenge` via
 * POST /api/challenges/random. Pure predicate — the actual atomic claim
 * (concurrency-safe against other requesters) happens in the SQL query
 * in challenge-db.ts; this function documents/tests the eligibility rule
 * that query implements. */
export function isMatchableRandomChallenge(
  challenge: MatchableChallenge,
  requesterToken: string,
  now: Date,
): boolean {
  return (
    challenge.deliveryType === "random" &&
    challenge.opponentToken === null &&
    challenge.status === "waiting" &&
    challenge.creatorToken !== requesterToken &&
    !isExpired(challenge.expiresAt, now)
  );
}
