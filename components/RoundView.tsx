"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Round } from "@/lib/types";
import { LogoTile } from "./LogoTile";

export function RoundView({
  round,
  onNext,
}: {
  round: Round;
  onNext: () => void;
}) {
  const t = useTranslations("play");
  const locale = useLocale();
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 px-4 py-8">
      <div className="animate-fade-in flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
        {round.kind === "clubClub" ? (
          <>
            <LogoTile src={round.clubA.logoUrl} alt={round.clubA.name} caption={round.clubA.name} />
            <div className="text-2xl font-black text-ink/30">{t("vs")}</div>
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
            <div className="text-2xl font-black text-ink/30">{t("vs")}</div>
            <LogoTile src={round.club.logoUrl} alt={round.club.name} caption={round.club.name} />
          </>
        )}
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="w-full rounded-xl bg-accent py-4 text-lg font-bold text-paper shadow-lg shadow-accent/20 hover:bg-accent/90"
          >
            {t("showAnswers")}
          </button>
        ) : (
          <>
            <div className="animate-fade-in rounded-xl border border-ink/10 bg-ink/5 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent">
                {t("answersHeading")} ({round.correctPlayers.length})
              </h3>
              {round.correctPlayers.length === 0 ? (
                <p className="text-sm text-ink/50">{t("noAnswers")}</p>
              ) : (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {round.correctPlayers.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-md bg-ink/5 px-3 py-2 text-sm leading-tight"
                    >
                      <div>{p.name}</div>
                      <div className="text-xs text-ink/40">{p.nationalityCode}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={onNext}
              className="w-full rounded-xl bg-accent py-4 text-lg font-bold text-paper shadow-lg shadow-accent/20 hover:bg-accent/90"
            >
              {t("nextRound")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
