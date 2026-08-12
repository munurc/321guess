import { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useTranslations } from "use-intl";

export function Countdown({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(3);
  const t = useTranslations("play");
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scale.setValue(0.85);
    opacity.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.02, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]),
      Animated.timing(scale, { toValue: 1.05, duration: 750, useNativeDriver: true }),
    ]).start();
  }, [n, scale, opacity]);

  useEffect(() => {
    if (n === 0) {
      onDone();
      return;
    }
    const id = setTimeout(() => setN(n - 1), 1000);
    return () => clearTimeout(id);
  }, [n, onDone]);

  const isGo = n === 0;
  return (
    <View className="min-h-[70vh] items-center justify-center gap-6">
      <Text className="text-xs uppercase tracking-[0.3em] text-ink-mute">{t("getReady")}</Text>
      <Animated.Text
        style={{ transform: [{ scale }], opacity }}
        className={`font-bold text-accent ${isGo ? "text-7xl" : "text-[8rem]"}`}
      >
        {isGo ? t("go") : n}
      </Animated.Text>
    </View>
  );
}
