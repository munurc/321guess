import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

function getFirebaseApp() {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "Daily-challenge push is not configured: set FCM_SERVICE_ACCOUNT_JSON (see .env.example).",
    );
  }
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

// FCM's multicast send caps at 500 tokens per call.
const FCM_MULTICAST_CHUNK_SIZE = 500;

const INVALID_TOKEN_ERROR_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export type BroadcastResult = { successCount: number; invalidTokens: string[] };

/** Sends the generic "today's challenge is ready" push to every given
 * device token. Tokens FCM reports as no-longer-valid are returned so the
 * caller can prune them from push_tokens. */
export async function sendDailyBroadcast(tokens: string[]): Promise<BroadcastResult> {
  if (tokens.length === 0) return { successCount: 0, invalidTokens: [] };

  const messaging = getMessaging(getFirebaseApp());
  const invalidTokens: string[] = [];
  let successCount = 0;

  for (let i = 0; i < tokens.length; i += FCM_MULTICAST_CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + FCM_MULTICAST_CHUNK_SIZE);
    const res = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: "Bugünün challenge'ı hazır!",
        body: "321guess'te günlük meydan okuma seni bekliyor — hemen oyna.",
      },
    });
    successCount += res.successCount;
    res.responses.forEach((r, idx) => {
      if (!r.success && r.error && INVALID_TOKEN_ERROR_CODES.has(r.error.code)) {
        invalidTokens.push(chunk[idx]);
      }
    });
  }

  return { successCount, invalidTokens };
}
