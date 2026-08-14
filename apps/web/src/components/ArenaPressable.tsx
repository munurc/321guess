import { Pressable, type GestureResponderEvent, type PressableProps } from 'react-native';

import { hapticTap } from '@/lib/haptics';
import { playSound } from '@/lib/sound';
import { useGameSettings } from '@/lib/game-settings-context';

type ArenaPressableProps = PressableProps & { children: React.ReactNode; className?: string };

/** Drop-in replacement for RN's Pressable: adds a press-down scale, a light
 * haptic tap, and a soft tap sound on every press. Haptic/sound are
 * native-only and respect the Settings screen's toggles; the scale
 * animation runs on both platforms (harmless, cheap) but web screens don't
 * use this component.
 *
 * The scale is driven by NativeWind's `active:` variant + `transition-*`
 * utilities (built on top of react-native-css-interop's own Reanimated
 * integration), not a hand-rolled Animated wrapper. An earlier version
 * wrapped Pressable in `Animated.createAnimatedComponent` and drove it with
 * a manually managed `style` prop — NativeWind doesn't auto-register
 * className support for custom-wrapped components (classes silently
 * dropped, no error) and, once worked around via `cssInterop`, colliding
 * with a Reanimated-managed style prop broke rendering on native entirely.
 * Letting NativeWind own both the classes and the animation avoids both
 * failure modes. */
export function ArenaPressable({ onPress, disabled, children, className, ...rest }: ArenaPressableProps) {
  const { hapticsEnabled, soundEnabled } = useGameSettings();

  function handlePress(e: GestureResponderEvent) {
    if (disabled) return;
    void hapticTap(hapticsEnabled);
    playSound('tap', soundEnabled);
    onPress?.(e);
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      className={`transition-transform duration-100 active:scale-95 ${className ?? ''}`}
      {...rest}
    >
      {children}
    </Pressable>
  );
}
