import { Pressable, Text, View } from "react-native";
import type { Country, Dataset, Difficulty, GameMode, League } from "@321guess/core";
import { localeUpper } from "../lib/locale-upper";
import { ArenaChip } from "./ArenaChip";
import { ArenaPressable } from "./ArenaPressable";
import { useTranslations } from "use-intl";

export function GameSettingsPicker({
  mode,
  difficulty,
  includedLeagues,
  excludedCountries,
  onModeChange,
  onDifficultyChange,
  onToggleLeague,
  onToggleCountry,
  onSelectAllLeagues,
  onClearAllLeagues,
  dataset,
  clubCountries,
  countriesReady,
  locale,
}: {
  mode: GameMode;
  difficulty: Difficulty;
  includedLeagues: Set<string>;
  excludedCountries: Set<string>;
  onModeChange: (mode: GameMode) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onToggleLeague: (id: string) => void;
  onToggleCountry: (code: string) => void;
  onSelectAllLeagues: () => void;
  onClearAllLeagues: () => void;
  dataset: Dataset;
  clubCountries: Country[];
  countriesReady: boolean;
  locale: string;
}) {
  const t = useTranslations("setup");
  const tMode = (key: string) => t(`mode.${key}` as never);

  return (
    <View className="gap-10">
      <View>
        <Text className="mb-4 text-lg font-semibold tracking-wider text-arena-text-soft">
          {localeUpper(t("difficulty.heading"), locale)}
        </Text>
        <View className="flex-row gap-3">
          {(["easy", "medium", "hard"] as const).map((d) => (
            <ArenaPressable
              key={d}
              onPress={() => onDifficultyChange(d)}
              className={`flex-1 items-center rounded-xl border-2 px-3 py-5 ${
                difficulty === d
                  ? "border-arena-accent-2 bg-arena-accent-2/15"
                  : "border-arena-bg-soft bg-arena-bg-soft"
              }`}
            >
              <Text className="text-lg font-semibold text-arena-text">{t(`difficulty.${d}.title`)}</Text>
              <Text className="mt-1 text-center text-sm text-arena-text-soft">{t(`difficulty.${d}.description`)}</Text>
            </ArenaPressable>
          ))}
        </View>
      </View>

      <View>
        <View className="flex-row gap-3">
          {(["clubClub", "countryClub"] as const).map((m) => (
            <ArenaPressable
              key={m}
              onPress={() => onModeChange(m)}
              className={`flex-1 items-center rounded-2xl border-[3px] p-4 ${
                mode === m ? "border-arena-accent-2 bg-arena-accent-2/15" : "border-arena-bg-soft bg-arena-bg-soft"
              }`}
            >
              <Text className="text-lg font-bold text-arena-text">{tMode(`${m}.title`)}</Text>
              <Text className="mt-1 text-center text-sm text-arena-text-soft">{tMode(`${m}.description`)}</Text>
            </ArenaPressable>
          ))}
        </View>
      </View>

      <View>
        <View className="mb-4 flex-row items-baseline justify-between">
          <Text className="text-lg font-semibold tracking-wider text-arena-text-soft">
            {localeUpper(t("leagues.heading"), locale)}
          </Text>
          <View className="flex-row gap-3">
            <Pressable onPress={onSelectAllLeagues}>
              <Text className="text-base text-arena-accent-2">{t("leagues.selectAll")}</Text>
            </Pressable>
            <Pressable onPress={onClearAllLeagues}>
              <Text className="text-base text-arena-text-soft">{t("leagues.clearAll")}</Text>
            </Pressable>
          </View>
        </View>
        <Text className="mb-4 text-base text-arena-text-soft">{t("leagues.hint")}</Text>
        <View className="gap-3">
          {dataset.leagues.map((l: League) => (
            <ArenaChip
              key={l.id}
              checked={includedLeagues.has(l.id)}
              onPress={() => onToggleLeague(l.id)}
              label={locale === "tr" ? l.nameTr : l.nameEn}
            />
          ))}
        </View>
      </View>

      {mode === "countryClub" && (
        <View>
          <Text className="mb-4 text-lg font-semibold tracking-wider text-arena-text-soft">
            {localeUpper(t("excludedCountries.heading"), locale)}
          </Text>
          <Text className="mb-4 text-base text-arena-text-soft">{t("excludedCountries.hint")}</Text>
          {countriesReady ? (
            <View className="gap-3">
              {clubCountries.map((c) => (
                <ArenaChip
                  key={c.code}
                  checked={!excludedCountries.has(c.code)}
                  onPress={() => onToggleCountry(c.code)}
                  label={locale === "tr" ? c.nameTr : c.nameEn}
                />
              ))}
            </View>
          ) : (
            <View className="items-center py-6">
              <Text className="text-arena-text-soft">…</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
