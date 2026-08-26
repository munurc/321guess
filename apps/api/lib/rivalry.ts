export function canonicalPair(tokenX: string, tokenY: string): [string, string] {
  return tokenX < tokenY ? [tokenX, tokenY] : [tokenY, tokenX];
}

export type RivalryTotals = { playerAWins: number; playerBWins: number; ties: number };

/** Pure update of a rivalry row's totals given who won this one challenge.
 * playerAToken/playerBToken must already be in canonical order (call
 * canonicalPair first) — this function does not reorder them. */
export function applyResult(
  current: RivalryTotals,
  playerAToken: string,
  playerBToken: string,
  winnerToken: string | null,
): RivalryTotals {
  if (winnerToken === null) {
    return { ...current, ties: current.ties + 1 };
  }
  if (winnerToken === playerAToken) {
    return { ...current, playerAWins: current.playerAWins + 1 };
  }
  if (winnerToken === playerBToken) {
    return { ...current, playerBWins: current.playerBWins + 1 };
  }
  throw new Error("winnerToken must be playerAToken, playerBToken, or null");
}
