import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

/** Wraps children with a brief scale+glow pulse, replayed every time
 * `trigger` changes — bump a counter on each correct guess to fire it.
 * `trigger === 0` never animates, so mounting with the initial value
 * doesn't pulse before the first real guess. */
export function CelebrationPulse({ trigger, children }: { trigger: number; children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    scale.value = withSequence(withTiming(1.12, { duration: 160 }), withTiming(1, { duration: 220 }));
    glow.value = withSequence(withTiming(1, { duration: 160 }), withTiming(0, { duration: 300 }));
  }, [trigger, scale, glow]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowColor: '#2ECC8F',
    shadowOpacity: glow.value * 0.8,
    shadowRadius: glow.value * 16,
    shadowOffset: { width: 0, height: 0 },
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
