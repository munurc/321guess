import { apiBaseUrl } from "./api-base-url";

export async function linkAccount(playerToken: string, accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/account/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerToken, accessToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type RecoverResult = { found: true; playerToken: string; username: string } | { found: false };

export async function recoverAccount(accessToken: string): Promise<RecoverResult> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/account/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    if (!res.ok) return { found: false };
    return (await res.json()) as RecoverResult;
  } catch {
    return { found: false };
  }
}
