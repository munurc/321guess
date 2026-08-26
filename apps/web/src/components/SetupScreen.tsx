import { useEffect, useMemo, useState } from "react";
import { InteractionManager, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale, useTranslations } from "use-intl";
import type { Dataset, Difficulty, GameMode } from "@321guess/core";
import { loadDataset } from "../lib/dataset";
import { useGameSettings } from "../lib/game-settings-context";
import { localeUpper } from "../lib/locale-upper";
import { localizedPath } from "../lib/localized-path";
import { ArenaChip } from "./ArenaChip";
import { ArenaPressable } from "./ArenaPressable";
import { HomeHeading, HomeSeoSections } from "./HomeSeoContent";
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
  const insets = useSafeAreaInsets();
  const { setSettings } = useGameSettings();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [mode, setMode] = useState<GameMode>("clubClub");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [includedLeagues, setIncludedLeagues] = useState<Set<string>>(new Set());
  const [excludedCountries, setExcludedCountries] = useState<Set<string>>(new Set());
  // The country checklist is ~170 items — mounting all of them in the same
  // render pass as the mode-switch tap made the tap itself feel delayed on
  // native. Defer the list's mount to just after the current interaction
  // finishes, so the tap/toggle feels instant and the (still real, just
  // slightly later) list-mount cost isn't attributed to the tap.
  const [countriesReady, setCountriesReady] = useState(false);

  useEffect(() => {
    loadDataset().then((d) => {
      setDataset(d);
      setIncludedLeagues(new Set(d.leagues.map((l) => l.id)));
    });
  }, []);

  useEffect(() => {
    if (mode !== "countryClub") {
      setCountriesReady(false);
      return;
    }
    const task = InteractionManager.runAfterInteractions(() => setCountriesReady(true));
    return () => task.cancel();
  }, [mode]);

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
    router.push(localizedPath("/play", locale) as never);
  }

  if (Platform.OS !== "web") {
    return (
      <View className="flex-1 bg-arena-bg">
        <View className="flex-row items-center justify-end px-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
          <Pressable
            onPress={() => router.push("/settings")}
            accessibilityLabel={tSettings("title")}
            hitSlop={12}
            className="p-2"
          >
            <Text className="text-2xl">⚙️</Text>
          </Pressable>
        </View>

        {!dataset ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-arena-text-soft">{t("loading")}</Text>
          </View>
        ) : (
          <>
            <View className="relative flex-1">
              <ScrollView className="flex-1 px-4" contentContainerClassName="gap-10 pb-10">
                <View>
                  <Text className="mb-6 text-center text-4xl font-black text-arena-text">
                    {t("mode.heading")}
                  </Text>
                  <View className="gap-4">
                    <ArenaPressable
                      onPress={() => router.push("/online")}
                      className="flex-row items-center gap-4 rounded-2xl border-b-[6px] border-arena-accent-strong bg-arena-accent p-6"
                    >
                      <Text className="text-4xl">🏆</Text>
                      <View className="flex-1">
                        <Text className="text-lg font-bold text-[#2A1E00]">{tOnline("modeCard.title")}</Text>
                        <Text className="mt-1 text-base text-[#5C4300]">{tOnline("modeCard.description")}</Text>
                        <Text className="mt-2 text-sm font-bold tracking-wider text-[#2A1E00]">
                          ● {localeUpper(tOnline("modeCard.live"), locale)}
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
                      className="flex-row items-center gap-4 rounded-2xl border-[3px] border-dashed border-arena-bg-soft p-6"
                    >
                      <Text className="text-4xl">🔍</Text>
                      <View className="flex-1">
                        <Text className="text-lg font-bold text-arena-text">{tManual("title")}</Text>
                        <Text className="mt-1 text-base text-arena-text-soft">{tManual("description")}</Text>
                      </View>
                    </ArenaPressable>
                  </View>
                </View>

                <View>
                  <Text className="mb-4 text-lg font-semibold tracking-wider text-arena-text-soft">
                    {localeUpper(t("difficulty.heading"), locale)}
                  </Text>
                  <View className="flex-row gap-3">
                    {(["easy", "medium", "hard"] as const).map((d) => (
                      <ArenaPressable
                        key={d}
                        onPress={() => setDifficulty(d)}
                        className={`flex-1 items-center rounded-xl border-2 px-3 py-5 ${
                          difficulty === d
                            ? "border-arena-accent-2 bg-arena-accent-2/15"
                            : "border-arena-bg-soft bg-arena-bg-soft"
                        }`}
                      >
                        <Text className="text-lg font-semibold text-arena-text">{t(`difficulty.${d}.title`)}</Text>
                        <Text className="mt-1 text-center text-sm text-arena-text-soft">
                          {t(`difficulty.${d}.description`)}
                        </Text>
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
                      <Pressable onPress={selectAllLeagues}>
                        <Text className="text-base text-arena-accent-2">{t("leagues.selectAll")}</Text>
                      </Pressable>
                      <Pressable onPress={clearAllLeagues}>
                        <Text className="text-base text-arena-text-soft">{t("leagues.clearAll")}</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text className="mb-4 text-base text-arena-text-soft">{t("leagues.hint")}</Text>
                  <View className="gap-3">
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
                            onPress={() => toggleCountry(c.code)}
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
              </ScrollView>
              <ScrollFadeBottom />
            </View>

            <View className="border-t border-arena-bg-soft px-4 pb-6 pt-4">
              <ArenaPressable
                onPress={start}
                disabled={!canStart}
                className={`items-center rounded-2xl border-b-[6px] py-6 ${
                  canStart ? "border-arena-accent-strong bg-arena-accent" : "border-arena-bg-soft bg-arena-bg-soft"
                }`}
              >
                <Text className={`text-2xl font-bold ${canStart ? "text-[#2A1E00]" : "text-arena-text-soft"}`}>
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
    <View className="flex-1 bg-paper">
      <ScrollView className="flex-1 px-4 pt-8" contentContainerClassName="pb-8">
      <View className="mb-8 flex-row items-center justify-between">
        <Text className="text-3xl font-black text-ink">
          <Text className="text-accent">3·2·1</Text>guess
        </Text>
        <View className="flex-row items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </View>
      </View>

      <HomeHeading />

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
                onPress={() => router.push(localizedPath("/online", locale) as never)}
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
                onPress={() => router.push(localizedPath("/manual", locale) as never)}
                className="flex-row items-center gap-4 rounded-xl border-2 border-dashed border-ink/20 p-4"
              >
                <Text className="text-2xl">🔍</Text>
                <View className="flex-1">
                  <Text className="font-semibold text-ink">{tManual("title")}</Text>
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
                  <Text className="text-sm font-semibold text-ink">{t(`difficulty.${d}.title`)}</Text>
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
        </View>
      )}

      <HomeSeoSections />
      </ScrollView>
      {dataset && (
        <View className="border-t border-rule bg-paper px-4 pb-6 pt-4">
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
    </View>
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
      className={`flex-row items-center gap-4 rounded-2xl border-[3px] p-6 ${
        selected ? "border-arena-accent-2 bg-arena-accent-2/15" : "border-arena-bg-soft bg-arena-bg-soft"
      }`}
    >
      <Text className="text-4xl">{icon}</Text>
      <View className="flex-1">
        <Text className="text-lg font-bold text-arena-text">{title}</Text>
        <Text className="mt-1 text-base text-arena-text-soft">{description}</Text>
      </View>
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
        <Text className="font-semibold text-ink">{title}</Text>
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
