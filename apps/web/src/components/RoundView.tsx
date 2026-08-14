import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useLocale, useTranslations } from "use-intl";
import type { Round } from "@321guess/core";
import { ArenaPressable } from "./ArenaPressable";
import { LogoTile } from "./LogoTile";

function codeToFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  const base = 0x1f1e6 - "A".charCodeAt(0);
  return String.fromCodePoint(base + code.charCodeAt(0), base + code.charCodeAt(1));
}

export function RoundView({ round, onNext }: { round: Round; onNext: () => void }) {
  const t = useTranslations("play");
  const locale = useLocale();
  const [revealed, setRevealed] = useState(false);

  if (Platform.OS !== "web") {
    return (
      <View className="items-center gap-8 px-4 py-8">
        <View className="flex-row items-center gap-6">
          {round.kind === "clubClub" ? (
            <>
              <LogoTile src={round.clubA.logoUrl} alt={round.clubA.name} caption={round.clubA.name} color={round.clubA.color} />
              <Text className="text-2xl font-black text-arena-text-soft">{t("vs")}</Text>
              <LogoTile src={round.clubB.logoUrl} alt={round.clubB.name} caption={round.clubB.name} color={round.clubB.color} />
            </>
          ) : (
            <>
              <LogoTile
                src={round.country.flagUrl}
                alt={locale === "tr" ? round.country.nameTr : round.country.nameEn}
                caption={locale === "tr" ? round.country.nameTr : round.country.nameEn}
                variant="flag"
              />
              <Text className="text-2xl font-black text-arena-text-soft">{t("vs")}</Text>
              <LogoTile src={round.club.logoUrl} alt={round.club.name} caption={round.club.name} color={round.club.color} />
            </>
          )}
        </View>

        <View className="w-full max-w-md gap-3">
          {!revealed ? (
            <ArenaPressable
              onPress={() => setRevealed(true)}
              className="items-center rounded-2xl border-b-4 border-arena-accent-strong bg-arena-accent py-4"
            >
              <Text className="text-lg font-bold text-[#2A1E00]">{t("showAnswers")}</Text>
            </ArenaPressable>
          ) : (
            <>
              <View className="rounded-2xl bg-arena-bg-soft p-4">
                <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-arena-accent-2">
                  {t("answersHeading")} ({round.correctPlayers.length})
                </Text>
                {round.correctPlayers.length === 0 ? (
                  <Text className="text-sm text-arena-text-soft">{t("noAnswers")}</Text>
                ) : (
                  <View className="gap-1">
                    {round.correctPlayers.map((p) => (
                      <View key={p.id} className="flex-row items-center gap-2 rounded-md bg-arena-bg px-3 py-2">
                        <Text>{codeToFlag(p.nationalityCode)}</Text>
                        <Text className="flex-1 text-sm text-arena-text">{p.name}</Text>
                        <Text className="text-[10px] font-medium uppercase text-arena-text-soft">
                          {p.nationalityCode}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <ArenaPressable
                onPress={onNext}
                className="items-center rounded-2xl border-b-4 border-arena-accent-strong bg-arena-accent py-4"
              >
                <Text className="text-lg font-bold text-[#2A1E00]">{t("nextRound")}</Text>
              </ArenaPressable>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View className="items-center gap-8 px-4 py-8">
      <View className="flex-row items-center gap-6">
        {round.kind === "clubClub" ? (
          <>
            <LogoTile src={round.clubA.logoUrl} alt={round.clubA.name} caption={round.clubA.name} />
            <Text className="text-2xl font-black text-ink-mute">{t("vs")}</Text>
            <LogoTile src={round.clubB.logoUrl} alt={round.clubB.name} caption={round.clubB.name} />
          </>
        ) : (
          <>
            <LogoTile
              src={round.country.flagUrl}
              alt={locale === "tr" ? round.country.nameTr : round.country.nameEn}
              caption={locale === "tr" ? round.country.nameTr : round.country.nameEn}
              variant="flag"
            />
            <Text className="text-2xl font-black text-ink-mute">{t("vs")}</Text>
            <LogoTile src={round.club.logoUrl} alt={round.club.name} caption={round.club.name} />
          </>
        )}
      </View>

      <View className="w-full max-w-md gap-3">
        {!revealed ? (
          <Pressable onPress={() => setRevealed(true)} className="items-center rounded-xl bg-accent py-4">
            <Text className="text-lg font-bold text-paper">{t("showAnswers")}</Text>
          </Pressable>
        ) : (
          <>
            <View className="rounded-xl border border-rule bg-ink/5 p-4">
              <Text className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">
                {t("answersHeading")} ({round.correctPlayers.length})
              </Text>
              {round.correctPlayers.length === 0 ? (
                <Text className="text-sm text-ink-mute">{t("noAnswers")}</Text>
              ) : (
                <View className="gap-1">
                  {round.correctPlayers.map((p) => (
                    <View key={p.id} className="flex-row items-center gap-2 rounded-md bg-paper px-3 py-2">
                      <Text>{codeToFlag(p.nationalityCode)}</Text>
                      <Text className="flex-1 text-sm">{p.name}</Text>
                      <Text className="text-[10px] font-medium uppercase text-ink-mute">
                        {p.nationalityCode}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            <Pressable onPress={onNext} className="items-center rounded-xl bg-accent py-4">
              <Text className="text-lg font-bold text-paper">{t("nextRound")}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
