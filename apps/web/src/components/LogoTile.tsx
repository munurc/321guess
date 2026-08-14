import { Image, Platform, Text, View } from "react-native";

type LogoTileProps = {
  src: string;
  alt: string;
  caption: string;
  variant?: "logo" | "flag";
  /** "lg" is the original reveal-screen size; "sm" fits inside a denser
   * layout (e.g. the online mode's in-progress question card). */
  size?: "lg" | "sm";
  /** Ring color for the native circular medallion. Ignored on web and for
   * flags (a flag already carries its own color). Falls back to a neutral
   * arena accent when a club has no extracted color yet. */
  color?: string;
};

const NEUTRAL_RING_COLOR = "#2ECC8F"; // arena-accent-2

export function LogoTile({ src, alt, caption, variant = "logo", size = "lg", color }: LogoTileProps) {
  const isSmall = size === "sm";

  if (Platform.OS !== "web" && variant === "logo") {
    const ringColor = color ?? NEUTRAL_RING_COLOR;
    return (
      <View className={`items-center ${isSmall ? "gap-1.5" : "gap-3"}`}>
        <View
          className={`aspect-square items-center justify-center rounded-full bg-arena-card ${
            isSmall ? "w-14 p-2" : "w-24 p-4"
          }`}
          style={{
            borderWidth: isSmall ? 1.5 : 2.5,
            borderColor: ringColor,
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
            elevation: 3,
          }}
        >
          <Image
            source={{ uri: `${src}?width=400` }}
            accessibilityLabel={alt}
            resizeMode="contain"
            className="h-full w-full"
          />
        </View>
        <Text
          className={`text-center font-medium text-arena-text-soft ${
            isSmall ? "max-w-[5.5rem] text-[11px]" : "max-w-[16rem] text-sm"
          }`}
        >
          {caption}
        </Text>
      </View>
    );
  }

  return (
    <View className={`items-center ${isSmall ? "gap-1.5" : "gap-3"}`}>
      <View
        className={`aspect-square items-center justify-center rounded-2xl border ${
          Platform.OS === "web" ? "border-rule bg-paper-2" : "border-arena-accent-2 bg-arena-card"
        } ${isSmall ? "w-14 p-2" : "w-40 p-6"} ${variant === "flag" ? "overflow-hidden p-0" : ""}`}
      >
        <Image
          source={{ uri: `${src}?width=400` }}
          accessibilityLabel={alt}
          resizeMode={variant === "flag" ? "cover" : "contain"}
          className="h-full w-full"
        />
      </View>
      <Text
        className={`text-center font-medium ${Platform.OS === "web" ? "text-ink-soft" : "text-arena-text-soft"} ${
          isSmall ? "max-w-[5.5rem] text-[11px]" : "max-w-[16rem] text-sm"
        }`}
      >
        {caption}
      </Text>
    </View>
  );
}
