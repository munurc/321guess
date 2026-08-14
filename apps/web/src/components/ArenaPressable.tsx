import { useRef } from 'react';
import { Animated, Pressable, type GestureResponderEvent, type PressableProps } from 'react-native';

import { hapticTap } from '@/lib/haptics';
import { useGameSettings } from '@/lib/game-settings-context';

type ArenaPressableProps = PressableProps & { children: React.ReactNode };

/** Drop-in replacement for RN's Pressable: adds a spring press-down scale
 * and a light haptic tap on every press. The haptic is native-only and
 * respects the Settings screen's toggle; the scale animation runs on both
 * platforms (harmless, cheap) but web screens don't use this component. */
export function ArenaPressable({ onPress, disabled, children, ...rest }: ArenaPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const { hapticsEnabled } = useGameSettings();

  function pressIn() {
    if (disabled) return;
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  }
  function pressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  }
  function handlePress(e: GestureResponderEvent) {
    if (disabled) return;
    void hapticTap(hapticsEnabled);
    onPress?.(e);
  }

  return (
    <Animated.View className={rest.className as string | undefined} style={{ transform: [{ scale }] }}>
      <Pressable onPressIn={pressIn} onPressOut={pressOut} onPress={handlePress} disabled={disabled} {...rest}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
