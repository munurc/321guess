import { Platform } from "react-native";
import { createAudioPlayer } from "expo-audio";

const SOURCES = {
  tap: require("../../assets/sounds/tap.wav"),
  correct: require("../../assets/sounds/correct.wav"),
  wrong: require("../../assets/sounds/wrong.wav"),
} as const;

export type SoundName = keyof typeof SOURCES;

/** Fire-and-forget: creates a short-lived player, plays once, and releases
 * itself when done. No-ops on web and whenever `enabled` (the Settings
 * screen's sound toggle) is off. */
export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled || Platform.OS === "web") return;
  const player = createAudioPlayer(SOURCES[name]);
  const subscription = player.addListener("playbackStatusUpdate", (status) => {
    if (status.didJustFinish) {
      subscription.remove();
      player.remove();
    }
  });
  player.play();
}
