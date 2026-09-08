import { Text, View } from "react-native";

/** A small set of fixed background colors so different usernames get
 * visually distinct badges without needing any real avatar/photo
 * infrastructure (this app has none — no upload, no storage). Picked
 * deterministically from the username so the same user always gets the
 * same color. */
const PALETTE = ["#FFC738", "#2ECC8F", "#E85D75", "#5B8FD9", "#C77DFF"];

function colorFor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function InitialAvatar({ username, size = 44 }: { username: string; size?: number }) {
  const initial = username.trim()[0]?.toUpperCase() ?? "?";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colorFor(username),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.4, fontWeight: "900", color: "#1A1330" }}>{initial}</Text>
    </View>
  );
}
