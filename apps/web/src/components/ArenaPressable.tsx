import { useRef } from 'react';
import { Animated, Pressable, type GestureResponderEvent, type PressableProps } from 'react-native';

import { hapticTap } from '@/lib/haptics';
import { playSound } from '@/lib/sound';
import { useGameSettings } from '@/lib/game-settings-context';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ArenaPressableProps = PressableProps & { children: React.ReactNode };

/** Drop-in replacement for RN's Pressable: adds a spring press-down scale,
 * a light haptic tap, and a soft tap sound on every press. Haptic/sound are
 * native-only and respect the Settings screen's toggles; the scale
 * animation runs on both platforms (harmless, cheap) but web screens don't
 * use this component. A single Animated-wrapped Pressable (not a Pressable
 * nested inside a separate Animated.View) so `style` (the transform) and
 * `className` (everything visual) land on the same node — a wrapper/inner
 * split previously broke `flex-1` layouts, since `className` reached the
 * inner node while the outer node (unstyled) governed the parent's flex
 * layout. */
export function ArenaPressable({ onPress, disabled, children, ...rest }: ArenaPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const { hapticsEnabled, soundEnabled } = useGameSettings();

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
    playSound('tap', soundEnabled);
    onPress?.(e);
  }

  return (
    <AnimatedPressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={handlePress}
      disabled={disabled}
      style={{ transform: [{ scale }] }}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
