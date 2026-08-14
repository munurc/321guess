import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** No-ops on web and whenever the caller's `enabled` flag (the Settings
 * screen's haptics toggle) is off. Never throws — a failed haptic call
 * shouldn't interrupt the game. */
export async function hapticTap(enabled: boolean): Promise<void> {
  if (!enabled || Platform.OS === "web") return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export async function hapticSuccess(enabled: boolean): Promise<void> {
  if (!enabled || Platform.OS === "web") return;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export async function hapticError(enabled: boolean): Promise<void> {
  if (!enabled || Platform.OS === "web") return;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
