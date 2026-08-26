import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Player } from "@321guess/core";
import { LogoTile } from "./LogoTile";
import { CelebrationPulse } from "./CelebrationPulse";

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normalize(s: string): string {
  return stripDiacritics(s).toLowerCase();
}

export function GuessInput({
  players,
  excludedIds,
  onGuess,
  placeholder,
  emptyText,
}: {
  players: Player[];
  excludedIds: Set<string>;
  onGuess: (player: Player) => void;
  placeholder: string;
  emptyText: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const isNative = Platform.OS !== "web";

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [];
    return players.filter((p) => !excludedIds.has(p.id) && normalize(p.name).includes(q)).slice(0, 8);
  }, [query, players, excludedIds]);

  function pick(player: Player) {
    onGuess(player);
    setQuery("");
    setOpen(false);
  }

  if (isNative) {
    return (
      <View className="relative">
        <TextInput
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          placeholderTextColor="#8FE8C4"
          className="rounded-2xl border border-arena-accent-2 bg-arena-bg-soft px-4 py-4 text-lg text-arena-text"
        />
        {open && query.trim().length >= 2 && (
          <View className="absolute top-[70px] z-20 max-h-72 w-full rounded-2xl border border-arena-accent-2 bg-arena-bg-soft">
            {filtered.length === 0 ? (
              <Text className="px-4 py-3 text-base text-arena-text-soft">{emptyText}</Text>
            ) : (
              <ScrollView>
                {filtered.map((p) => (
                  <Pressable key={p.id} onPress={() => pick(p)} className="px-4 py-3">
                    <Text className="text-lg text-arena-text">{p.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    // See the matching comment in ManualScreen's SearchBox: react-native-web
    // gives every View an implicit z-index:0 stacking context, so the
    // dropdown's z-20 can't rise above sibling elements (feedback chip,
    // found/wrong chips, Pas/Bitir buttons) unless this wrapper itself is
    // raised while the dropdown is open.
    <View className={`relative ${open && query.trim().length >= 2 ? "z-30" : ""}`}>
      <TextInput
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="rounded-xl border border-rule bg-paper-2 px-4 py-3 text-base text-ink"
      />
      {open && query.trim().length >= 2 && (
        <View className="absolute top-16 z-20 max-h-72 w-full rounded-xl border border-rule bg-paper">
          {filtered.length === 0 ? (
            <Text className="px-4 py-3 text-sm text-ink-mute">{emptyText}</Text>
          ) : (
            <ScrollView>
              {filtered.map((p) => (
                <Pressable key={p.id} onPress={() => pick(p)} className="px-4 py-2">
                  <Text className="text-sm text-ink">{p.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

export type PlayQuestion = {
  clubA: { id: string; name: string; logoUrl: string; color?: string };
  clubB: { id: string; name: string; logoUrl: string; color?: string };
  totalPossible: number;
};

/** Shared "answer this club×club or country×club question" UI — question
 * card, guess autocomplete, correct/wrong feedback, found/wrong chip list.
 * Used by both OnlineScreen (Daily Challenge, which wraps this with its
 * own countdown timer above it) and the new Challenge Mode play screen
 * (no timer — challenges are untimed/async). Native-only, matching both
 * callers' existing scope (this is never rendered on web). */
export function RoundPlayView({
  question,
  foundPlayers,
  wrongPlayers,
  players,
  celebrationTick,
  guessFeedback,
  onGuess,
  vsLabel,
  possibleCountLabel,
  guessPlaceholder,
  guessEmptyText,
}: {
  question: PlayQuestion;
  foundPlayers: Player[];
  wrongPlayers: Player[];
  players: Player[];
  celebrationTick: number;
  guessFeedback: { id: number; status: "correct" | "wrong"; label: string } | null;
  onGuess: (player: Player) => void;
  vsLabel: string;
  possibleCountLabel: string;
  guessPlaceholder: string;
  guessEmptyText: string;
}) {
  return (
    <View className="gap-4">
      <View className="rounded-2xl bg-arena-bg-soft px-4 pb-5 pt-5">
        <CelebrationPulse trigger={celebrationTick}>
          <View className="flex-row items-center justify-center gap-4">
            <LogoTile size="sm" src={question.clubA.logoUrl} alt={question.clubA.name} caption={question.clubA.name} color={question.clubA.color} />
            <Text className="text-sm font-black text-arena-text-soft">{vsLabel}</Text>
            <LogoTile size="sm" src={question.clubB.logoUrl} alt={question.clubB.name} caption={question.clubB.name} color={question.clubB.color} />
          </View>
        </CelebrationPulse>

        <View className="mt-4 items-center gap-2">
          <Text className="text-xs text-arena-text-soft">{possibleCountLabel}</Text>
          <View className="flex-row gap-2">
            {Array.from({ length: question.totalPossible }).map((_, i) => (
              <View
                key={i}
                className={`h-3 w-3 rounded-full border border-arena-accent-2 ${i < foundPlayers.length ? "bg-arena-accent-2" : ""}`}
              />
            ))}
          </View>
        </View>
      </View>

      <GuessInput
        players={players}
        excludedIds={new Set([...foundPlayers, ...wrongPlayers].map((p) => p.id))}
        onGuess={onGuess}
        placeholder={guessPlaceholder}
        emptyText={guessEmptyText}
      />

      {guessFeedback && (
        <View
          className={`flex-row items-center gap-2 rounded-lg px-4 py-2.5 ${
            guessFeedback.status === "correct" ? "bg-arena-accent-2/20" : "bg-red-500/15"
          }`}
        >
          <Text className={`text-base ${guessFeedback.status === "correct" ? "text-arena-accent-2" : "text-red-300"}`}>
            {guessFeedback.status === "correct" ? "✓" : "✗"} {guessFeedback.label}
          </Text>
        </View>
      )}

      {(foundPlayers.length > 0 || wrongPlayers.length > 0) && (
        <View className="flex-row flex-wrap gap-2">
          {foundPlayers.map((p) => (
            <View key={p.id} className="rounded-full bg-arena-accent-2/20 px-4 py-2">
              <Text className="text-sm font-medium text-arena-text">{p.name}</Text>
            </View>
          ))}
          {wrongPlayers.map((p) => (
            <View key={p.id} className="rounded-full bg-red-500/15 px-4 py-2">
              <Text className="text-sm font-medium text-red-300">✕ {p.name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
