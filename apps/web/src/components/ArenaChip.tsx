import { Pressable, Text } from "react-native";
import { useGameSettings } from "../lib/game-settings-context";
import { hapticTap } from "../lib/haptics";

// Plain Pressable, not ArenaPressable: this renders inside potentially long
// lists (the country list alone is 169 items), and ArenaPressable's
// per-item Animated.Value + haptic/sound overhead was expensive enough,
// multiplied across that many chips mounting at once, to cause a visible
// stall when switching into Country×Club mode. Keeps a plain haptic tap —
// cheap even at this scale — just drops the spring animation and sound.
export function ArenaChip({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  const { hapticsEnabled } = useGameSettings();
  return (
    <Pressable
      onPress={() => {
        void hapticTap(hapticsEnabled);
        onPress();
      }}
      className={`flex-row items-center gap-3 rounded-lg border-2 px-4 py-4 ${
        checked ? "border-arena-accent-2 bg-arena-accent-2/15" : "border-arena-bg-soft bg-arena-bg-soft"
      }`}
    >
      <Text className={`text-lg ${checked ? "text-arena-accent-2" : "text-arena-text-soft"}`}>
        {checked ? "☑" : "☐"}
      </Text>
      <Text className={`text-lg ${checked ? "text-arena-text" : "text-arena-text-soft"}`}>{label}</Text>
    </Pressable>
  );
}
