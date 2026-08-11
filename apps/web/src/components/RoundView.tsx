import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocale, useTranslations } from "use-intl";
import type { Round } from "@321guess/core";
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
