// Pure decisions for the /m/[code] invite flow, kept out of the component so
// they can be unit-tested.
import type { ApiResult, ChallengeRow, LinkInvite } from "./challenge-api";
import type { Identity } from "./online-storage";

/** What to do when the invite page opens. A revoked/expired link may still
 * hold this browser's finished copy, so with an identity we ask the server
 * (join returns an existing copy even after revoke) instead of showing
 * "no longer active" to someone who already played. */
export function shouldTryJoinOnOpen(
  res: ApiResult<LinkInvite>,
  identity: Identity | null,
): "invite" | "rejoin" | "inactive" {
  if (res.status !== "ok") return "inactive";
  if (res.data.active) return "invite";
  return identity ? "rejoin" : "inactive";
}

export type JoinOutcome =
  | { kind: "countdown"; challenge: ChallengeRow }
  | { kind: "load-result"; challenge: ChallengeRow }
  | { kind: "inactive" }
  | { kind: "own" }
  | { kind: "username"; error: "expired" }
  | { kind: "error" };

export function phaseAfterJoin(
  res: ApiResult<ChallengeRow> | { status: "gone" } | { status: "own" },
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
