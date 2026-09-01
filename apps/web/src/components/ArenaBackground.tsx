import { LinearGradient } from "expo-linear-gradient";
import { View, type ViewProps } from "react-native";

type ArenaBackgroundProps = ViewProps & { children?: React.ReactNode; className?: string };

/** Root background for every native "arena" screen — a dark purple gradient
 * (top `#3A2E5C` to bottom `#1A1330`) replacing the old flat `arena-bg`
 * color. `expo-linear-gradient` only renders a linear gradient (the design
 * spec's mockups used a CSS radial-gradient); a top-to-bottom linear
 * gradient between the same two stops is the approved substitute.
 *
 * `className`/`style` land on an inner plain View, not on LinearGradient
 * itself — NativeWind doesn't auto-register className support for
 * custom-wrapped components (the same lesson ArenaPressable's doc comment
 * already records), so LinearGradient only ever carries a fixed
 * `style={{ flex: 1 }}` and every caller's layout classes apply normally
 * to the inner View. Drop-in replacement for
 * `<View className="flex-1 bg-arena-bg">` — remove `bg-arena-bg` from the
 * className when switching a call site to this component. */
export function ArenaBackground({ children, className, style, ...rest }: ArenaBackgroundProps) {
  return (
    <LinearGradient colors={["#3A2E5C", "#1A1330"]} style={{ flex: 1 }}>
      <View className={className} style={style} {...rest}>
        {children}
      </View>
    </LinearGradient>
  );
}
