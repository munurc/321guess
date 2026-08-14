import { Platform } from "react-native";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";

const SOURCES = {
  tap: require("../../assets/sounds/tap.wav"),
  correct: require("../../assets/sounds/correct.wav"),
  wrong: require("../../assets/sounds/wrong.wav"),
} as const;

export type SoundName = keyof typeof SOURCES;

// Reused across calls (seek-to-start + replay) instead of created fresh per
// call — allocating/decoding a brand new AudioPlayer on every tap was
// expensive enough to be felt as UI lag, since ArenaPressable calls this on
// nearly every button press across the whole app. Lazily created on first
// use, one per sound name, and kept alive for the app's lifetime.
const players: Partial<Record<SoundName, AudioPlayer>> = {};

function getPlayer(name: SoundName): AudioPlayer {
  let player = players[name];
  if (!player) {
    player = createAudioPlayer(SOURCES[name]);
    players[name] = player;
  }
  return player;
}

/** Fire-and-forget: replays a pre-created, reused player. No-ops on web and
 * whenever `enabled` (the Settings screen's sound toggle) is off. */
export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled || Platform.OS === "web") return;
  const player = getPlayer(name);
  player.seekTo(0).catch(() => {});
  player.play();
}
