import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";

/** Tries the native share sheet first; falls back to clipboard if the
 * user cancels, the platform has no share sheet (some web browsers), or
 * sharing throws. Mirrors the original's navigator.share-then-clipboard
 * fallback chain. */
export async function shareOrCopy(text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    const result = await Share.share({ message: text });
    if (result.action === Share.sharedAction) return "shared";
    // action === dismissedAction (user cancelled) — fall through to copy.
  } catch {
    // Share unsupported on this platform — fall through to copy.
  }
  try {
    await Clipboard.setStringAsync(text);
    return "copied";
  } catch {
    return "failed";
  }
}
