import { Pressable, Text } from "react-native";
import { useColorScheme } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const THEME_KEY = "321guess.settings.theme";

export function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useColorScheme();

  function handlePress() {
    const next = colorScheme === "dark" ? "light" : "dark";
    toggleColorScheme();
    AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityLabel={colorScheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="h-8 w-8 items-center justify-center rounded-full border border-ink/10 bg-ink/5"
    >
      <Text className="text-ink-soft">{colorScheme === "dark" ? "☀️" : "🌙"}</Text>
    </Pressable>
  );
}
