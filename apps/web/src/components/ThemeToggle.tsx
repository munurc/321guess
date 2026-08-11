import { Pressable, Text } from "react-native";
import { useColorScheme } from "nativewind";

export function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useColorScheme();
  return (
    <Pressable
      onPress={toggleColorScheme}
      accessibilityLabel={colorScheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="h-8 w-8 items-center justify-center rounded-full border border-ink/10 bg-ink/5"
    >
      <Text className="text-ink-soft">{colorScheme === "dark" ? "☀️" : "🌙"}</Text>
    </Pressable>
  );
}
