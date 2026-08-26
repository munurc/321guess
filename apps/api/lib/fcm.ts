import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";

const expo = new Expo();

export type BroadcastResult = { successCount: number; invalidTokens: string[] };

/** Sends one message to a list of Expo push tokens. Tokens Expo's receipt
 * service reports as no-longer-valid are returned so the caller can prune
 * them from push_tokens. Shared by the daily broadcast (sendDailyBroadcast
 * below) and Challenge Mode's per-event notifications
 * (lib/challenge-push.ts) — the only thing that differs between call
 * sites is the title/body text. */
export async function sendPushToTokens(tokens: string[], title: string, body: string): Promise<BroadcastResult> {
  const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t));
  if (validTokens.length === 0) return { successCount: 0, invalidTokens: [] };

  const messages: ExpoPushMessage[] = validTokens.map((to) => ({ to, title, body }));

  const tickets: ExpoPushTicket[] = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
  }

  const invalidTokens: string[] = [];
  let successCount = 0;
  tickets.forEach((ticket, idx) => {
    if (ticket.status === "ok") {
      successCount += 1;
    } else if (ticket.details?.error === "DeviceNotRegistered") {
      invalidTokens.push(validTokens[idx]);
    }
  });

  return { successCount, invalidTokens };
}

/** Sends the generic "today's challenge is ready" push to every given
 * Expo push token. Expo's own delivery layer manages APNs/FCM under the
 * hood — no Firebase or Apple push credentials needed here. */
export async function sendDailyBroadcast(tokens: string[]): Promise<BroadcastResult> {
  return sendPushToTokens(
    tokens,
    "Bugünün challenge'ı hazır!",
    "321guess'te günlük meydan okuma seni bekliyor — hemen oyna.",
  );
}
