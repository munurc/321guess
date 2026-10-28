import { useEffect, type RefObject } from "react";
import { Keyboard, type ScrollView } from "react-native";

/** While `enabled`, scrolls `ref` to its end whenever the keyboard opens, so a
 * guess input near the bottom of a play screen (and the Pas/Bitir buttons
 * under it) sits just above the keyboard instead of behind it. Pair with
 * `automaticallyAdjustKeyboardInsets` on the ScrollView so its scrollable
 * area actually shrinks to the space above the keyboard. */
export function useScrollToEndOnKeyboard(ref: RefObject<ScrollView | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      ref.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, [ref, enabled]);
}
