import { LinearGradient } from 'expo-linear-gradient';

/** A ~40px bottom-edge gradient (transparent → arena-bg) laid over the
 * bottom of a scrollable region, signaling "more content below" without
 * relying on a bare scrollbar. Must be the last child of a `relative`
 * (or otherwise positioned) container the same size as the scroll area. */
export function ScrollFadeBottom() {
  return (
    <LinearGradient
      colors={['transparent', '#0F2A1E']}
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 40 }}
    />
  );
}
