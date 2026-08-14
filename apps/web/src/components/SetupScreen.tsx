import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useLocale, useTranslations } from "use-intl";
import type { Dataset, Difficulty, GameMode } from "@321guess/core";
import { loadDataset } from "../lib/dataset";
import { useGameSettings } from "../lib/game-settings-context";
import { ArenaPressable } from "./ArenaPressable";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ScrollFadeBottom } from "./ScrollFadeBottom";
import { ThemeToggle } from "./ThemeToggle";

export function SetupScreen() {
  const t = useTranslations("setup");
  const tManual = useTranslations("manual");
  const tOnline = useTranslations("online");
  const tSettings = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();
  const { setSettings } = useGameSettings();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [mode, setMode] = useState<GameMode>("clubClub");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [includedLeagues, setIncludedLeagues] = useState<Set<string>>(new Set());
  const [excludedCountries, setExcludedCountries] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDataset().then((d) => {
      setDataset(d);
      setIncludedLeagues(new Set(d.leagues.map((l) => l.id)));
    });
  }, []);

  const clubCountries = useMemo(() => {
    if (!dataset) return [];
    const codes = new Set<string>();
    for (const p of dataset.players) codes.add(p.nationalityCode);
    return dataset.countries
      .filter((c) => codes.has(c.code))
      .sort((a, b) => {
        const an = locale === "tr" ? a.nameTr : a.nameEn;
        const bn = locale === "tr" ? b.nameTr : b.nameEn;
        return an.localeCompare(bn);
      });
  }, [dataset, locale]);

  const canStart = dataset !== null && includedLeagues.size > 0;

  function toggleLeague(id: string) {
    setIncludedLeagues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleCountry(code: string) {
    setExcludedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }
  function selectAllLeagues() {
    if (dataset) setIncludedLeagues(new Set(dataset.leagues.map((l) => l.id)));
  }
  function clearAllLeagues() {
    setIncludedLeagues(new Set());
  }

  function start() {
    if (!canStart) return;
    setSettings({
      mode,
      difficulty,
      includedLeagues: [...includedLeagues],
      excludedCountries: [...excludedCountries],
    });
    router.push("/play");
  }

  if (Platform.OS !== "web") {
    return (
      <View className="flex-1 bg-arena-bg">
        <View className="flex-row items-center justify-between px-4 pb-2 pt-8">
          <Text className="text-3xl font-black text-arena-text">
            <Text className="text-arena-accent">3·2·1</Text>guess
          </Text>
          <Pressable onPress={() => router.push("/settings")} accessibilityLabel={tSettings("title")}>
            <Text className="text-xl">⚙️</Text>
          </Pressable>
        </View>

        {!dataset ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-arena-text-soft">{t("loading")}</Text>
          </View>
        ) : (
          <>
            <View className="relative flex-1">
              <ScrollView className="flex-1 px-4" contentContainerClassName="gap-8 pb-10">
                <View>
                  <Text className="mb-3 text-sm font-semibold uppercase tracking-wider text-arena-text-soft">
                    {t("mode.heading")}
                  </Text>
                  <View className="gap-3">
                    <ArenaPressable
                      onPress={() => router.push("/online")}
                      className="flex-row items-center gap-4 rounded-2xl border-b-4 border-arena-accent-strong bg-arena-accent p-4"
                    >
                      <Text className="text-2xl">🏆</Text>
                      <View className="flex-1">
                        <Text className="font-semibold text-[#2A1E00]">{tOnline("modeCard.title")}</Text>
                        <Text className="mt-1 text-xs text-[#5C4300]">{tOnline("modeCard.description")}</Text>
                        <Text className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#2A1E00]">
                          ● {tOnline("modeCard.live")}
                        </Text>
                      </View>
                    </ArenaPressable>

                    <ArenaModeCard
                      selected={mode === "clubClub"}
                      onPress={() => setMode("clubClub")}
                      title={t("mode.clubClub.title")}
                      description={t("mode.clubClub.description")}
                      icon="🛡️"
                    />
                    <ArenaModeCard
                      selected={mode === "countryClub"}
                      onPress={() => setMode("countryClub")}
                      title={t("mode.countryClub.title")}
                      description={t("mode.countryClub.description")}
                      icon="🚩"
                    />

                    <ArenaPressable
                      onPress={() => router.push("/manual")}
                      className="flex-row items-center gap-4 rounded-2xl border-2 border-dashed border-arena-bg-soft p-4"
                    >
                      <Text className="text-2xl">🔍</Text>
                      <View className="flex-1">
                        <Text className="font-semibold text-arena-text">{tManual("title")}</Text>
                        <Text className="mt-1 text-xs text-arena-text-soft">{tManual("description")}</Text>
                      </View>
                    </ArenaPressable>
                  </View>
                </View>

                <View>
                  <Text className="mb-3 text-sm font-semibold uppercase tracking-wider text-arena-text-soft">
                    {t("difficulty.heading")}
                  </Text>
                  <View className="flex-row gap-2">
                    {(["easy", "medium", "hard"] as const).map((d) => (
                      <ArenaPressable
                        key={d}
                        onPress={() => setDifficulty(d)}
                        className={`flex-1 items-center rounded-xl border-2 px-3 py-3 ${
                          difficulty === d
                            ? "border-arena-accent-2 bg-arena-accent-2/15"
                            : "border-arena-bg-soft bg-arena-bg-soft"
                        }`}
                      >
                        <Text className="text-sm font-semibold text-arena-text">{t(`difficulty.${d}.title`)}</Text>
                        <Text className="mt-1 text-center text-[10px] text-arena-text-soft">
                          {t(`difficulty.${d}.description`)}
                        </Text>
                      </ArenaPressable>
                    ))}
                  </View>
                </View>

                <View>
                  <View className="mb-3 flex-row items-baseline justify-between">
                    <Text className="text-sm font-semibold uppercase tracking-wider text-arena-text-soft">
                      {t("leagues.heading")}
                    </Text>
                    <View className="flex-row gap-3">
                      <Pressable onPress={selectAllLeagues}>
                        <Text className="text-xs text-arena-accent-2">{t("leagues.selectAll")}</Text>
                      </Pressable>
                      <Pressable onPress={clearAllLeagues}>
                        <Text className="text-xs text-arena-text-soft">{t("leagues.clearAll")}</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text className="mb-3 text-xs text-arena-text-soft">{t("leagues.hint")}</Text>
                  <View className="gap-2">
                    {dataset.leagues.map((l) => (
                      <ArenaChip
                        key={l.id}
                        checked={includedLeagues.has(l.id)}
                        onPress={() => toggleLeague(l.id)}
                        label={locale === "tr" ? l.nameTr : l.nameEn}
                      />
                    ))}
                  </View>
                </View>

                {mode === "countryClub" && (
                  <View>
                    <Text className="mb-3 text-sm font-semibold uppercase tracking-wider text-arena-text-soft">
                      {t("excludedCountries.heading")}
                    </Text>
                    <Text className="mb-3 text-xs text-arena-text-soft">{t("excludedCountries.hint")}</Text>
                    <View className="gap-2">
                      {clubCountries.map((c) => (
                        <ArenaChip
                          key={c.code}
                          checked={!excludedCountries.has(c.code)}
                          onPress={() => toggleCountry(c.code)}
                          label={locale === "tr" ? c.nameTr : c.nameEn}
                        />
                      ))}
                    </View>
                  </View>
                )}
              </ScrollView>
              <ScrollFadeBottom />
            </View>

            <View className="border-t border-arena-bg-soft px-4 pb-6 pt-3">
              <ArenaPressable
                onPress={start}
                disabled={!canStart}
                className={`items-center rounded-2xl py-4 ${
                  canStart ? "border-b-4 border-arena-accent-strong bg-arena-accent" : "bg-arena-bg-soft"
                }`}
              >
                <Text className={`text-lg font-bold ${canStart ? "text-[#2A1E00]" : "text-arena-text-soft"}`}>
                  {canStart ? t("start") : t("startDisabled")}
                </Text>
              </ArenaPressable>
            </View>
          </>
        )}
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-paper px-4 py-8">
      <View className="mb-8 flex-row items-center justify-between">
        <Text className="text-3xl font-black">
          <Text className="text-accent">3·2·1</Text>guess
        </Text>
        <View className="flex-row items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </View>
      </View>

      {!dataset ? (
        <View className="items-center rounded-lg border border-rule bg-ink/5 p-8">
          <Text className="text-ink-mute">{t("loading")}</Text>
        </View>
      ) : (
        <View className="gap-8">
          <View>
            <Text className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
              {t("mode.heading")}
            </Text>
            <View className="gap-3">
              <Pressable
                onPress={() => router.push("/online")}
                className="flex-row items-center gap-4 rounded-xl bg-accent p-4"
              >
                <Text className="text-2xl">🏆</Text>
                <View className="flex-1">
                  <Text className="font-semibold text-paper">{tOnline("modeCard.title")}</Text>
                  <Text className="mt-1 text-xs text-paper/80">{tOnline("modeCard.description")}</Text>
                  <Text className="mt-2 text-[10px] font-bold uppercase tracking-wider text-paper">
                    ● {tOnline("modeCard.live")}
                  </Text>
                </View>
              </Pressable>

              <ModeCard
                selected={mode === "clubClub"}
                onPress={() => setMode("clubClub")}
                title={t("mode.clubClub.title")}
                description={t("mode.clubClub.description")}
                icon="🛡️"
              />
              <ModeCard
                selected={mode === "countryClub"}
                onPress={() => setMode("countryClub")}
                title={t("mode.countryClub.title")}
                description={t("mode.countryClub.description")}
                icon="🚩"
              />
              <Pressable
                onPress={() => router.push("/manual")}
                className="flex-row items-center gap-4 rounded-xl border-2 border-dashed border-ink/20 p-4"
              >
                <Text className="text-2xl">🔍</Text>
                <View className="flex-1">
                  <Text className="font-semibold">{tManual("title")}</Text>
                  <Text className="mt-1 text-xs text-ink-mute">{tManual("description")}</Text>
                </View>
              </Pressable>
            </View>
          </View>

          <View>
            <Text className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
              {t("difficulty.heading")}
            </Text>
            <View className="flex-row gap-2">
              {(["easy", "medium", "hard"] as const).map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDifficulty(d)}
                  className={`flex-1 items-center rounded-xl border-2 px-3 py-3 ${
                    difficulty === d ? "border-accent bg-accent/10" : "border-rule bg-ink/5"
                  }`}
                >
                  <Text className="text-sm font-semibold">{t(`difficulty.${d}.title`)}</Text>
                  <Text className="mt-1 text-center text-[10px] text-ink-mute">
                    {t(`difficulty.${d}.description`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View>
            <View className="mb-3 flex-row items-baseline justify-between">
              <Text className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
                {t("leagues.heading")}
              </Text>
              <View className="flex-row gap-3">
                <Pressable onPress={selectAllLeagues}>
                  <Text className="text-xs text-accent">{t("leagues.selectAll")}</Text>
                </Pressable>
                <Pressable onPress={clearAllLeagues}>
                  <Text className="text-xs text-ink-mute">{t("leagues.clearAll")}</Text>
                </Pressable>
              </View>
            </View>
            <Text className="mb-3 text-xs text-ink-mute">{t("leagues.hint")}</Text>
            <View className="gap-2">
              {dataset.leagues.map((l) => (
                <Chip
                  key={l.id}
                  checked={includedLeagues.has(l.id)}
                  onPress={() => toggleLeague(l.id)}
                  label={locale === "tr" ? l.nameTr : l.nameEn}
                />
              ))}
            </View>
          </View>

          {mode === "countryClub" && (
            <View>
              <Text className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
                {t("excludedCountries.heading")}
              </Text>
              <Text className="mb-3 text-xs text-ink-mute">{t("excludedCountries.hint")}</Text>
              <View className="gap-2">
                {clubCountries.map((c) => (
                  <Chip
                    key={c.code}
                    checked={!excludedCountries.has(c.code)}
                    onPress={() => toggleCountry(c.code)}
                    label={locale === "tr" ? c.nameTr : c.nameEn}
                  />
                ))}
              </View>
            </View>
          )}

          <Pressable
            onPress={start}
            disabled={!canStart}
            className={`items-center rounded-xl py-4 ${canStart ? "bg-accent" : "bg-ink/10"}`}
          >
            <Text className={`text-lg font-bold ${canStart ? "text-paper" : "text-ink-mute"}`}>
              {canStart ? t("start") : t("startDisabled")}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function ArenaModeCard({
  selected,
  onPress,
  title,
  description,
  icon,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <ArenaPressable
      onPress={onPress}
      className={`flex-row items-center gap-4 rounded-2xl border-2 p-4 ${
        selected ? "border-arena-accent-2 bg-arena-accent-2/15" : "border-arena-bg-soft bg-arena-bg-soft"
      }`}
    >
      <Text className="text-2xl">{icon}</Text>
      <View className="flex-1">
        <Text className="font-semibold text-arena-text">{title}</Text>
        <Text className="mt-1 text-xs text-arena-text-soft">{description}</Text>
      </View>
    </ArenaPressable>
  );
}

function ArenaChip({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <ArenaPressable
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-lg border px-3 py-2 ${
        checked ? "border-arena-accent-2 bg-arena-accent-2/15" : "border-arena-bg-soft bg-arena-bg-soft"
      }`}
    >
      <Text className={checked ? "text-arena-accent-2" : "text-arena-text-soft"}>{checked ? "☑" : "☐"}</Text>
      <Text className={checked ? "text-arena-text" : "text-arena-text-soft"}>{label}</Text>
    </ArenaPressable>
  );
}

function ModeCard({
  selected,
  onPress,
  title,
  description,
  icon,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-4 rounded-xl border-2 p-4 ${
        selected ? "border-accent bg-accent/10" : "border-rule bg-ink/5"
      }`}
    >
      <Text className="text-2xl">{icon}</Text>
      <View className="flex-1">
        <Text className="font-semibold">{title}</Text>
        <Text className="mt-1 text-xs text-ink-mute">{description}</Text>
      </View>
    </Pressable>
  );
}

function Chip({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-lg border px-3 py-2 ${
        checked ? "border-accent/50 bg-accent/10" : "border-rule bg-ink/5"
      }`}
    >
      <Text>{checked ? "☑" : "☐"}</Text>
      <Text className={checked ? "text-ink" : "text-ink-mute"}>{label}</Text>
    </Pressable>
  );
}
