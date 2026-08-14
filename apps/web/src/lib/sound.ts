import { Platform } from "react-native";
import { createAudioPlayer } from "expo-audio";

const SOURCES = {
  tap: require("../../assets/sounds/tap.wav"),
  correct: require("../../assets/sounds/correct.wav"),
  wrong: require("../../assets/sounds/wrong.wav"),
} as const;

export type SoundName = keyof typeof SOURCES;

// Longest bundled effect is ~380ms; this is a generous safety margin for
// the fallback release below, not a tuned value.
const RELEASE_FALLBACK_MS = 3000;

/** Fire-and-forget: creates a short-lived player, plays once, and releases
 * itself when done (or after a fallback timeout, in case playback is
 * interrupted — e.g. a call or audio-focus loss — and
 * `playbackStatusUpdate` never fires `didJustFinish`). No-ops on web and
 * whenever `enabled` (the Settings screen's sound toggle) is off. */
export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled || Platform.OS === "web") return;
  const player = createAudioPlayer(SOURCES[name]);
  let released = false;
  function release() {
    if (released) return;
    released = true;
    subscription.remove();
    player.remove();
  }
  const subscription = player.addListener("playbackStatusUpdate", (status) => {
    if (status.didJustFinish) release();
  });
  setTimeout(release, RELEASE_FALLBACK_MS);
  player.play();
}
