import AsyncStorage from "@react-native-async-storage/async-storage";

const IDENTITY_KEY = "321guess.online.player";
const PROGRESS_KEY_PREFIX = "321guess.online.progress.";

export type Identity = { token: string; username: string };

export type FinishResult = {
  correctCount: number;
  totalPossible: number;
  currentStreak: number;
  longestStreak: number;
};

export type StoredProgress =
  | { finished: true; result: FinishResult }
  | {
      finished: false;
      questionIndex: number;
      foundPlayerIds: string[];
      wrongPlayerIds: string[];
      overallFoundCount: number;
      startedAt: number;
    };

function progressKey(roundDate: string) {
  return `${PROGRESS_KEY_PREFIX}${roundDate}`;
}

export async function loadIdentity(): Promise<Identity | null> {
  try {
    const raw = await AsyncStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token === "string" && typeof parsed?.username === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function saveIdentity(identity: Identity): Promise<void> {
  await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

/** A saved identity can outlive its server-side record (moderation
 * cleanup, a Supabase reset) — every online API returns 401 in that
 * case. Sweeps cached progress too, since it's keyed by date, not
 * identity, and a fresh registration shouldn't inherit a ghost
 * identity's stale result. */
export async function clearIdentity(): Promise<void> {
  try {
    await AsyncStorage.removeItem(IDENTITY_KEY);
    const keys = await AsyncStorage.getAllKeys();
    const progressKeys = keys.filter((k) => k.startsWith(PROGRESS_KEY_PREFIX));
    if (progressKeys.length > 0) await AsyncStorage.removeMany(progressKeys);
  } catch {}
}

export async function loadProgress(roundDate: string): Promise<StoredProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(progressKey(roundDate));
    return raw ? (JSON.parse(raw) as StoredProgress) : null;
  } catch {
    return null;
  }
}

export async function saveProgress(roundDate: string, progress: StoredProgress): Promise<void> {
  await AsyncStorage.setItem(progressKey(roundDate), JSON.stringify(progress));
}
