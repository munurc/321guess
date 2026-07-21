"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Dataset, Difficulty, GameMode, Settings } from "@/lib/types";
import { loadDataset } from "@/lib/data";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";

const SETTINGS_KEY = "321guess.settings";

export function SetupScreen() {
  const t = useTranslations("setup");
  const locale = useLocale();
  const router = useRouter();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [mode, setMode] = useState<GameMode>("clubClub");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [includedLeagues, setIncludedLeagues] = useState<Set<string>>(new Set());
  const [excludedCountries, setExcludedCountries] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDataset().then((d) => {
      setDataset(d);
      setIncludedLeagues(new Set(d.leagues.map((l) => l.id)));
      setExcludedCountries(new Set()); // default: nothing excluded
    });
  }, []);

  const clubCountries = useMemo(() => {
    if (!dataset) return [];
    // For Country × Club mode we care about which player nationalities can
    // appear — any nationality represented in the player pool.
    const codes = new Set<string>();
    for (const p of dataset.players) codes.add(p.nationalityCode);
    return dataset.countries.filter((c) => codes.has(c.code)).sort((a, b) => {
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
    if (!dataset) return;
    setIncludedLeagues(new Set(dataset.leagues.map((l) => l.id)));
  }
  function clearAllLeagues() {
    setIncludedLeagues(new Set());
  }

  function start() {
    if (!canStart) return;
    const settings: Settings = {
      mode,
      difficulty,
      includedLeagues: [...includedLeagues],
      excludedCountries: [...excludedCountries],
    };
    sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    router.push(`/${locale}/play`);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-14">
      <header className="mb-8 flex items-center justify-between gap-3">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          <span className="text-accent">3·2·1</span>guess
        </h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>

      {!dataset ? (
        <div className="rounded-lg border border-ink/10 bg-ink/5 p-8 text-center text-ink/60">
          {t("loading")}
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink/70">
              {t("mode.heading")}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <ModeCard
                selected={mode === "clubClub"}
                onClick={() => setMode("clubClub")}
                title={t("mode.clubClub.title")}
                description={t("mode.clubClub.description")}
                icon={<CrestIcon />}
              />
              <ModeCard
                selected={mode === "countryClub"}
                onClick={() => setMode("countryClub")}
                title={t("mode.countryClub.title")}
                description={t("mode.countryClub.description")}
                icon={<FlagIcon />}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink/70">
              {t("difficulty.heading")}
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {(["easy", "medium", "hard"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`rounded-xl border-2 px-3 py-3 text-center transition ${
                    difficulty === d
                      ? "border-accent bg-accent/10"
                      : "border-ink/10 bg-ink/5 hover:border-ink/30"
                  }`}
                >
                  <div className="text-sm font-semibold">{t(`difficulty.${d}.title`)}</div>
                  <div className="mt-1 text-[10px] leading-tight text-ink/50">
                    {t(`difficulty.${d}.description`)}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink/70">
                {t("leagues.heading")}
              </h2>
              <div className="flex gap-3 text-xs">
                <button
                  onClick={selectAllLeagues}
                  className="text-accent hover:underline"
                >
                  {t("leagues.selectAll")}
                </button>
                <button
                  onClick={clearAllLeagues}
                  className="text-ink/50 hover:text-ink/80"
                >
                  {t("leagues.clearAll")}
                </button>
              </div>
            </div>
            <p className="mb-3 text-xs text-ink/40">{t("leagues.hint")}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {dataset.leagues.map((l) => (
                <Chip
                  key={l.id}
                  checked={includedLeagues.has(l.id)}
                  onChange={() => toggleLeague(l.id)}
                  label={locale === "tr" ? l.nameTr : l.nameEn}
                />
              ))}
            </div>
          </section>

          {mode === "countryClub" && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink/70">
                {t("excludedCountries.heading")}
              </h2>
              <p className="mb-3 text-xs text-ink/40">{t("excludedCountries.hint")}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {clubCountries.map((c) => (
                  <Chip
                    key={c.code}
                    checked={!excludedCountries.has(c.code)}
                    onChange={() => toggleCountry(c.code)}
                    label={locale === "tr" ? c.nameTr : c.nameEn}
                    icon={
                      <img
                        src={`${c.flagUrl}?width=32`}
                        alt=""
                        className="h-4 w-6 rounded-sm object-cover"
                        loading="lazy"
                      />
                    }
                  />
                ))}
              </div>
            </section>
          )}

          <div className="sticky bottom-4 pt-4">
            <button
              onClick={start}
              disabled={!canStart}
              className="w-full rounded-xl bg-accent py-4 text-lg font-bold text-paper shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/30"
            >
              {canStart ? t("start") : t("startDisabled")}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ModeCard({
  selected,
  onClick,
  title,
  description,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-4 rounded-xl border-2 p-4 text-left transition ${
        selected
          ? "border-accent bg-accent/10"
          : "border-ink/10 bg-ink/5 hover:border-ink/30"
      }`}
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
          selected ? "bg-accent text-paper" : "bg-ink/10 text-ink/70"
        }`}
      >
        {icon}
      </div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="mt-1 text-xs leading-relaxed text-ink/60">{description}</div>
      </div>
    </button>
  );
}

function Chip({
  checked,
  onChange,
  label,
  icon,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
        checked
          ? "border-accent/50 bg-accent/10 text-ink"
          : "border-ink/10 bg-ink/5 text-ink/50 hover:border-ink/20"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-accent"
      />
      {icon}
      <span className="truncate">{label}</span>
    </label>
  );
}

function CrestIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3Zm0 4.5 4 1.5v4c0 3.2-1.9 6.1-4 7-2.1-.9-4-3.8-4-7V8l4-1.5Z" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M5 3v18h2v-7h11l-2-4 2-4H7V3H5Z" />
    </svg>
  );
}
