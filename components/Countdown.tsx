"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export function Countdown({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(3);
  const t = useTranslations("play");

  useEffect(() => {
    if (n === 0) {
      onDone();
      return;
    }
    const id = setTimeout(() => setN(n - 1), 1000);
    return () => clearTimeout(id);
  }, [n, onDone]);

  const isGo = n === 0;
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6">
      <p className="text-xs uppercase tracking-[0.3em] text-ink/40">
        {t("getReady")}
      </p>
      <div
        key={n}
        aria-live="polite"
        className={`animate-countdown-soft font-serif leading-none text-accent [font-variant-numeric:tabular-nums] ${
          isGo ? "text-7xl italic sm:text-8xl" : "text-[12rem] font-medium sm:text-[16rem]"
        }`}
      >
        {isGo ? t("go") : n}
      </div>
    </div>
  );
}
