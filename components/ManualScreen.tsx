"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Club, Country, Dataset, GameMode, Round } from "@/lib/types";
import { loadDataset } from "@/lib/data";
import { fetchLiveRoundPlayers } from "@/lib/live-players";
import { RoundView } from "./RoundView";
import { LanguageSwitcher } from "./LanguageSwitcher";
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
    // Countries that could realistically appear as answers — any nationality
    // represented among players. Since players load lazily we approximate
    // with pool clubs' host countries + a superset of common footballing
    // nations. dataset.countries already covers this.
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
      const next: Round = {
        kind: "clubClub",
        clubA,
        clubB,
        correctPlayers: localMatches,
      };
      setRound(next);
      // Replace with fresh live data when it arrives.
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
      const next: Round = {
        kind: "countryClub",
        country,
        club: clubA,
        correctPlayers: localMatches,
      };
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

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-8 flex items-center justify-between gap-3">
        <Link
          href={`/${locale}`}
          className="text-xs uppercase tracking-wider text-ink/50 hover:text-ink"
        >
          ← {t("backHome")}
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>

      {!round ? (
        <>
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              <span className="text-accent">{t("title")}</span>
            </h1>
            <p className="mt-1 text-sm text-ink/60">{t("description")}</p>
          </div>

          <div className="mb-6 inline-flex rounded-full border border-ink/10 bg-ink/5 p-1 text-sm">
            {(["clubClub", "countryClub"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`rounded-full px-4 py-1.5 transition ${
                  mode === m ? "bg-accent text-paper font-semibold" : "text-ink/70 hover:text-ink"
                }`}
              >
                {t(`mode.${m}`)}
              </button>
            ))}
          </div>

          {!dataset ? (
            <div className="rounded-lg border border-ink/10 bg-ink/5 p-8 text-center text-ink/60">…</div>
          ) : mode === "clubClub" ? (
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
          )}

          <p className="mt-4 text-xs text-ink/40">{t("hint")}</p>

          <div className="mt-8 flex gap-3">
            <button
              onClick={startRound}
              disabled={!canStart}
              className="flex-1 rounded-xl bg-accent py-4 text-lg font-bold text-paper shadow-lg shadow-accent/20 hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/30 disabled:shadow-none"
            >
              {t("start")}
            </button>
            {(clubA || clubB || country) && (
              <button
                onClick={reset}
                className="rounded-xl border border-ink/10 px-4 text-sm text-ink/70 hover:border-ink/30 hover:text-ink"
              >
                {t("search.clear")}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <RoundView round={round} onNext={() => setRound(null)} />
          <div className="mx-auto mt-4 max-w-md text-center">
            <button
              onClick={reset}
              className="text-xs uppercase tracking-wider text-ink/50 hover:text-ink"
            >
              {t("newRound")}
            </button>
          </div>
        </>
      )}
    </main>
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
  emptyText: string;
};

function SearchBox<T>({ label, selected, onChange, items, getKey, getLabel, getSubtitle, emptyText }: SearchBoxProps<T>) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return items.slice(0, 30);
    return items
      .filter((item) => normalize(getLabel(item)).includes(q))
      .slice(0, 40);
  }, [query, items, getLabel]);

  if (selected) {
    return (
      <div className="rounded-xl border-2 border-accent bg-accent/10 p-3">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-ink/50">{label}</div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{getLabel(selected)}</div>
            <div className="text-xs text-ink/50">{getSubtitle(selected)}</div>
          </div>
          <button
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            className="rounded-md px-2 py-1 text-xs text-ink/50 hover:bg-ink/10 hover:text-ink"
            aria-label="Clear selection"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-ink/50">{label}</div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={label}
        className="w-full rounded-xl border border-ink/10 bg-paper-2 px-4 py-3 text-base text-ink placeholder:text-ink/30 focus:border-accent focus:outline-none"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-ink/10 bg-paper shadow-xl shadow-ink/10">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-ink/40">{emptyText}</div>
          ) : (
            <ul>
              {filtered.map((item) => (
                <li key={getKey(item)}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(item);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-ink/5"
                  >
                    <span className="truncate">{getLabel(item)}</span>
                    <span className="text-xs text-ink/40">{getSubtitle(item)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

