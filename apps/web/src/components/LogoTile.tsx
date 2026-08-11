import { Image, View, Text } from "react-native";

type LogoTileProps = {
  src: string;
  alt: string;
  caption: string;
  variant?: "logo" | "flag";
  /** "lg" is the original reveal-screen size; "sm" fits inside a denser
   * layout (e.g. the online mode's in-progress question card). */
  size?: "lg" | "sm";
};

export function LogoTile({ src, alt, caption, variant = "logo", size = "lg" }: LogoTileProps) {
  const isSmall = size === "sm";
  return (
    <View className={`items-center ${isSmall ? "gap-1.5" : "gap-3"}`}>
      <View
        className={`aspect-square items-center justify-center rounded-2xl border border-rule bg-paper-2 ${
          isSmall ? "w-14 p-2" : "w-40 p-6"
        } ${variant === "flag" ? "overflow-hidden p-0" : ""}`}
      >
        <Image
          source={{ uri: `${src}?width=400` }}
          accessibilityLabel={alt}
          resizeMode={variant === "flag" ? "cover" : "contain"}
          className="h-full w-full"
        />
      </View>
      <Text
        className={`text-center font-medium text-ink-soft ${
          isSmall ? "max-w-[5.5rem] text-[11px]" : "max-w-[16rem] text-sm"
        }`}
      >
        {caption}
      </Text>
    </View>
  );
}
