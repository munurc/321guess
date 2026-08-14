import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale, useTranslations } from "use-intl";
import type { Club, Country, Dataset, GameMode, Round } from "@321guess/core";
import { loadDataset } from "../lib/dataset";
import { fetchLiveRoundPlayers } from "../lib/live-players";
import { localeUpper } from "../lib/locale-upper";
import { ArenaPressable } from "./ArenaPressable";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LogoTile } from "./LogoTile";
import { RoundView } from "./RoundView";
import { ScrollFadeBottom } from "./ScrollFadeBottom";
import { ThemeToggle } from "./ThemeToggle";

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function normalize(s: string): string {
  return stripDiacritics(s).toLowerCase();
}

export function ManualScreen() {
  const t = useTranslations("manual");
  const locale = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [mode, setMode] = useState<GameMode>("clubClub");
  const [clubA, setClubA] = useState<Club | null>(null);
  const [clubB, setClubB] = useState<Club | null>(null);
  const [country, setCountry] = useState<Country | null>(null);
  const [round, setRound] = useState<Round | null>(null);

  useEffect(() => {
    loadDataset().then(setDataset);
  }, []);

  const countries = useMemo(() => {
    if (!dataset) return [];
    return [...dataset.countries].sort((a, b) => {
      const an = locale === "tr" ? a.nameTr : a.nameEn;
      const bn = locale === "tr" ? b.nameTr : b.nameEn;
      return an.localeCompare(bn);
    });
  }, [dataset, locale]);

  function reset() {
    setClubA(null);
    setClubB(null);
    setCountry(null);
    setRound(null);
  }

  function switchMode(next: GameMode) {
    setMode(next);
    reset();
  }

  function startRound() {
    if (!dataset) return;
    if (mode === "clubClub") {
      if (!clubA || !clubB || clubA.id === clubB.id) return;
      const localMatches = dataset.players.filter(
        (p) => p.clubIds.includes(clubA.id) && p.clubIds.includes(clubB.id),
      );
      const next: Round = { kind: "clubClub", clubA, clubB, correctPlayers: localMatches };
      setRound(next);
      fetchLiveRoundPlayers(next).then((live) => {
        if (!live) return;
        setRound((current) => {
          if (!current || current.kind !== "clubClub") return current;
          if (current.clubA.id !== next.clubA.id || current.clubB.id !== next.clubB.id) return current;
          return { ...current, correctPlayers: live };
        });
      });
    } else {
      if (!country || !clubA) return;
      const localMatches = dataset.players.filter(
        (p) => p.nationalityCode === country.code && p.clubIds.includes(clubA.id),
      );
      const next: Round = { kind: "countryClub", country, club: clubA, correctPlayers: localMatches };
      setRound(next);
      fetchLiveRoundPlayers(next).then((live) => {
        if (!live) return;
        setRound((current) => {
          if (!current || current.kind !== "countryClub") return current;
          if (current.country.code !== next.country.code || current.club.id !== next.club.id) return current;
          return { ...current, correctPlayers: live };
        });
      });
    }
  }

  const canStart =
    mode === "clubClub"
      ? clubA !== null && clubB !== null && clubA.id !== clubB.id
      : country !== null && clubA !== null;

  if (Platform.OS !== "web") {
    return (
      <View className="flex-1 bg-arena-bg">
        <View className="relative flex-1">
          <ScrollView
            className="flex-1 px-4 pb-8"
            contentContainerClassName="pb-10"
            contentContainerStyle={{ paddingTop: insets.top + 32 }}
          >
            <Pressable onPress={() => router.push("/")} className="mb-4">
              <Text className="text-sm tracking-wider text-arena-text-soft">← {localeUpper(t("backHome"), locale)}</Text>
            </Pressable>
            <Text className="text-4xl font-black text-arena-accent">{t("title")}</Text>
            <Text className="mt-2 text-base text-arena-text-soft">{t("description")}</Text>

            {!round ? (
              <>
                <View className="mb-6 mt-6 flex-row self-start rounded-full border border-arena-accent-2 bg-arena-bg-soft p-1.5">
                  {(["clubClub", "countryClub"] as const).map((m) => (
                    <ArenaPressable
                      key={m}
                      onPress={() => switchMode(m)}
                      className={`rounded-full px-5 py-2.5 ${mode === m ? "bg-arena-accent" : ""}`}
                    >
                      <Text
                        className={`text-base ${mode === m ? "font-semibold text-[#2A1E00]" : "text-arena-text-soft"}`}
                      >
                        {t(`mode.${m}`)}
                      </Text>
                    </ArenaPressable>
                  ))}
                </View>

                {!dataset ? (
                  <View className="items-center rounded-2xl bg-arena-bg-soft p-8">
                    <Text className="text-arena-text-soft">…</Text>
                  </View>
                ) : mode === "clubClub" ? (
                  <View className="gap-4">
                    <SearchBox
                      label={t("search.clubA")}
                      selected={clubA}
                      onChange={setClubA}
                      items={dataset.clubs}
                      getKey={(c) => c.id}
                      getLabel={(c) => c.name}
                      getSubtitle={(c) => c.countryCode}
                      getMedallion={(c) => ({ src: c.logoUrl, color: c.color })}
                      emptyText={t("search.empty")}
                    />
                    <SearchBox
                      label={t("search.clubB")}
                      selected={clubB}
                      onChange={setClubB}
                      items={dataset.clubs.filter((c) => clubA === null || c.id !== clubA.id)}
                      getKey={(c) => c.id}
                      getLabel={(c) => c.name}
                      getSubtitle={(c) => c.countryCode}
                      getMedallion={(c) => ({ src: c.logoUrl, color: c.color })}
                      emptyText={t("search.empty")}
                    />
                  </View>
                ) : (
                  <View className="gap-4">
                    <SearchBox
                      label={t("search.country")}
                      selected={country}
                      onChange={setCountry}
                      items={countries}
                      getKey={(c) => c.code}
                      getLabel={(c) => (locale === "tr" ? c.nameTr : c.nameEn)}
                      getSubtitle={(c) => c.code}
                      emptyText={t("search.empty")}
                    />
                    <SearchBox
                      label={t("search.club")}
                      selected={clubA}
                      onChange={setClubA}
                      items={dataset.clubs}
                      getKey={(c) => c.id}
                      getLabel={(c) => c.name}
                      getSubtitle={(c) => c.countryCode}
                      getMedallion={(c) => ({ src: c.logoUrl, color: c.color })}
                      emptyText={t("search.empty")}
                    />
                  </View>
                )}

                <Text className="mt-4 text-sm text-arena-text-soft">{t("hint")}</Text>

                <View className="mt-8 flex-row gap-3">
                  <ArenaPressable
                    onPress={startRound}
                    disabled={!canStart}
                    className={`flex-1 items-center rounded-2xl border-b-[6px] py-6 ${
                      canStart ? "border-arena-accent-strong bg-arena-accent" : "border-arena-bg-soft bg-arena-bg-soft"
                    }`}
                  >
                    <Text className={`text-2xl font-bold ${canStart ? "text-[#2A1E00]" : "text-arena-text-soft"}`}>
                      {t("start")}
                    </Text>
                  </ArenaPressable>
                  {(clubA || clubB || country) && (
                    <ArenaPressable onPress={reset} className="justify-center rounded-2xl border border-arena-accent-2 px-5">
                      <Text className="text-base text-arena-text-soft">{t("search.clear")}</Text>
                    </ArenaPressable>
                  )}
                </View>
              </>
            ) : (
              <>
                <RoundView round={round} onNext={() => setRound(null)} />
                <ArenaPressable onPress={reset} className="mt-4 items-center">
                  <Text className="text-sm tracking-wider text-arena-text-soft">{localeUpper(t("newRound"), locale)}</Text>
                </ArenaPressable>
              </>
            )}
          </ScrollView>
          <ScrollFadeBottom />
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-paper px-4 py-8">
      <View className="mb-8 flex-row items-center justify-between">
        <ThemeToggle />
        <LanguageSwitcher />
      </View>

      {!round ? (
        <>
          <Text className="text-2xl font-black text-accent">{t("title")}</Text>
          <Text className="mt-1 text-sm text-ink-mute">{t("description")}</Text>

          <View className="mb-6 mt-6 flex-row self-start rounded-full border border-rule bg-ink/5 p-1">
            {(["clubClub", "countryClub"] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => switchMode(m)}
                className={`rounded-full px-4 py-1.5 ${mode === m ? "bg-accent" : ""}`}
              >
                <Text className={mode === m ? "font-semibold text-paper" : "text-ink-soft"}>
                  {t(`mode.${m}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {!dataset ? (
            <View className="items-center rounded-lg border border-rule bg-ink/5 p-8">
              <Text className="text-ink-mute">…</Text>
            </View>
          ) : mode === "clubClub" ? (
            <View className="gap-4">
              <SearchBox
                label={t("search.clubA")}
                selected={clubA}
                onChange={setClubA}
                items={dataset.clubs}
                getKey={(c) => c.id}
                getLabel={(c) => c.name}
                getSubtitle={(c) => c.countryCode}
                emptyText={t("search.empty")}
              />
              <SearchBox
                label={t("search.clubB")}
                selected={clubB}
                onChange={setClubB}
                items={dataset.clubs.filter((c) => clubA === null || c.id !== clubA.id)}
                getKey={(c) => c.id}
                getLabel={(c) => c.name}
                getSubtitle={(c) => c.countryCode}
                emptyText={t("search.empty")}
              />
            </View>
          ) : (
            <View className="gap-4">
              <SearchBox
                label={t("search.country")}
                selected={country}
                onChange={setCountry}
                items={countries}
                getKey={(c) => c.code}
                getLabel={(c) => (locale === "tr" ? c.nameTr : c.nameEn)}
                getSubtitle={(c) => c.code}
                emptyText={t("search.empty")}
              />
              <SearchBox
                label={t("search.club")}
                selected={clubA}
                onChange={setClubA}
                items={dataset.clubs}
                getKey={(c) => c.id}
                getLabel={(c) => c.name}
                getSubtitle={(c) => c.countryCode}
                emptyText={t("search.empty")}
              />
            </View>
          )}

          <Text className="mt-4 text-xs text-ink-mute">{t("hint")}</Text>

          <View className="mt-8 flex-row gap-3">
            <Pressable
              onPress={startRound}
              disabled={!canStart}
              className={`flex-1 items-center rounded-xl py-4 ${canStart ? "bg-accent" : "bg-ink/10"}`}
            >
              <Text className={`text-lg font-bold ${canStart ? "text-paper" : "text-ink-mute"}`}>
                {t("start")}
              </Text>
            </Pressable>
            {(clubA || clubB || country) && (
              <Pressable onPress={reset} className="justify-center rounded-xl border border-rule px-4">
                <Text className="text-sm text-ink-soft">{t("search.clear")}</Text>
              </Pressable>
            )}
          </View>
        </>
      ) : (
        <>
          <RoundView round={round} onNext={() => setRound(null)} />
          <Pressable onPress={reset} className="mt-4 items-center">
            <Text className="text-xs uppercase tracking-wider text-ink-mute">{t("newRound")}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

type SearchBoxProps<T> = {
  label: string;
  selected: T | null;
  onChange: (item: T | null) => void;
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getSubtitle: (item: T) => string;
  /** Optional — only club-type SearchBox calls pass this. Renders a small
   * LogoTile medallion next to the selected item on native. Country
   * selections never pass it (a flag already carries its own color). */
  getMedallion?: (item: T) => { src: string; color?: string };
  emptyText: string;
};

function SearchBox<T>({
  label,
  selected,
  onChange,
  items,
  getKey,
  getLabel,
  getSubtitle,
  getMedallion,
  emptyText,
}: SearchBoxProps<T>) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const isNative = Platform.OS !== "web";
  const locale = useLocale();

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return items.slice(0, 30);
    return items.filter((item) => normalize(getLabel(item)).includes(q)).slice(0, 40);
  }, [query, items, getLabel]);

  if (selected) {
    if (isNative) {
      const medallion = getMedallion?.(selected);
      return (
        <View className="flex-row items-center gap-4 rounded-2xl border-[3px] border-arena-accent-2 bg-arena-accent-2/15 p-4">
          {medallion && (
            <LogoTile size="sm" src={medallion.src} alt={getLabel(selected)} caption="" color={medallion.color} />
          )}
          <View className="flex-1">
            <Text className="mb-1 text-xs tracking-wider text-arena-text-soft">{localeUpper(label, locale)}</Text>
            <Text className="text-lg font-semibold text-arena-text">{getLabel(selected)}</Text>
            <Text className="text-sm text-arena-text-soft">{getSubtitle(selected)}</Text>
          </View>
          <Pressable
            onPress={() => {
              onChange(null);
              setQuery("");
            }}
            className="rounded-md px-3 py-2"
          >
            <Text className="text-base text-arena-text-soft">✕</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View className="rounded-xl border-2 border-accent bg-accent/10 p-3">
        <Text className="mb-1 text-[10px] uppercase tracking-wider text-ink-mute">{label}</Text>
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-base font-semibold">{getLabel(selected)}</Text>
            <Text className="text-xs text-ink-mute">{getSubtitle(selected)}</Text>
          </View>
          <Pressable onPress={() => { onChange(null); setQuery(""); }} className="rounded-md px-2 py-1">
            <Text className="text-xs text-ink-mute">✕</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isNative) {
    // A dashed "+" circle echoes the medallion-slot metaphor from the
    // reveal screens even before anything is picked — only for club-type
    // calls (getMedallion is only ever passed for clubs, never countries),
    // matching the design spec's "unselected slot ... dashed-outline '+'
    // placeholder" requirement. The text input stays fully functional
    // alongside it — the circle is decorative, not a replacement control.
    return (
      <View className="flex-row items-center gap-3">
        {getMedallion && (
          <View className="h-16 w-16 items-center justify-center rounded-full border-[3px] border-dashed border-arena-accent-2">
            <Text className="text-xl text-arena-accent-2">+</Text>
          </View>
        )}
        <View className="relative flex-1">
          <Text className="mb-1 text-xs tracking-wider text-arena-text-soft">{localeUpper(label, locale)}</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setOpen(true)}
            placeholder={label}
            placeholderTextColor="#8FE8C4"
            className="rounded-2xl border border-arena-accent-2 bg-arena-bg-soft px-4 py-4 text-lg text-arena-text"
          />
          {open && (
            <View className="absolute top-[70px] z-20 max-h-72 w-full rounded-2xl border border-arena-accent-2 bg-arena-bg-soft">
              {filtered.length === 0 ? (
                <Text className="px-4 py-3 text-base text-arena-text-soft">{emptyText}</Text>
              ) : (
                <ScrollView>
                  {filtered.map((item) => (
                    <Pressable
                      key={getKey(item)}
                      onPress={() => {
                        onChange(item);
                        setQuery("");
                        setOpen(false);
                      }}
                      className="flex-row items-center justify-between px-4 py-3"
                    >
                      <Text className="flex-1 text-lg text-arena-text">{getLabel(item)}</Text>
                      <Text className="text-sm text-arena-text-soft">{getSubtitle(item)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View className="relative">
      <Text className="mb-1 text-[10px] uppercase tracking-wider text-ink-mute">{label}</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        onFocus={() => setOpen(true)}
        placeholder={label}
        className="rounded-xl border border-rule bg-paper-2 px-4 py-3 text-base text-ink"
      />
      {open && (
        <View className="absolute top-16 z-20 max-h-72 w-full rounded-xl border border-rule bg-paper">
          {filtered.length === 0 ? (
            <Text className="px-4 py-3 text-sm text-ink-mute">{emptyText}</Text>
          ) : (
            <ScrollView>
              {filtered.map((item) => (
                <Pressable
                  key={getKey(item)}
                  onPress={() => { onChange(item); setQuery(""); setOpen(false); }}
                  className="flex-row items-center justify-between px-4 py-2"
                >
                  <Text className="flex-1">{getLabel(item)}</Text>
                  <Text className="text-xs text-ink-mute">{getSubtitle(item)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}
