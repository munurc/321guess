"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Dataset, Round, Settings } from "@/lib/types";
import { loadDataset } from "@/lib/data";
import { buildPool, pickRound } from "@/lib/game";
import { Countdown } from "./Countdown";
import { RoundView } from "./RoundView";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

const SETTINGS_KEY = "321guess.settings";
type Phase = "countdown" | "round";

export function PlayScreen() {
  const t = useTranslations("play");
  const locale = useLocale();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("countdown");
  const [round, setRound] = useState<Round | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      setError("noSettings");
      const timer = setTimeout(() => router.push(`/${locale}`), 1500);
      return () => clearTimeout(timer);
    }
    const parsed = JSON.parse(raw) as Settings;
    setSettings(parsed);
    loadDataset().then(setDataset);
  }, [locale, router]);

  const rollNext = useCallback(() => {
    if (!dataset || !settings) return;
    const pool = buildPool(dataset, settings);
    const excluded = new Set(settings.excludedCountries);
    const next = pickRound(pool, settings.mode, excluded, settings.difficulty);
    setRound(next);
  }, [dataset, settings]);

  useEffect(() => {
    if (dataset && settings && !round) {
      rollNext();
    }
  }, [dataset, settings, round, rollNext]);

  function handleCountdownDone() {
    setPhase("round");
  }

  function handleNextRound() {
    rollNext();
  }

  if (error === "noSettings") {
    return (
      <main className="grid min-h-screen place-items-center px-4 text-center">
        <p className="text-ink/60">{t("noSettings")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link
          href={`/${locale}`}
          className="text-xs uppercase tracking-wider text-ink/50 hover:text-ink"
        >
          ← {t("backToSetup")}
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>

      {phase === "countdown" ? (
        <Countdown onDone={handleCountdownDone} />
      ) : !round ? (
        <div className="grid min-h-[70vh] place-items-center text-ink/50">
          {t("rerolling")}
        </div>
      ) : (
        <RoundView key={roundKey(round)} round={round} onNext={handleNextRound} />
      )}
    </main>
  );
}

function roundKey(round: Round): string {
  return round.kind === "clubClub"
    ? `cc-${round.clubA.id}-${round.clubB.id}`
    : `cn-${round.country.code}-${round.club.id}`;
}
