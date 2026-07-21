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

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <p className="mb-6 text-sm uppercase tracking-widest text-ink/40">
        {t("getReady")}
      </p>
      <div
        key={n}
        className="animate-countdown text-[16rem] font-black leading-none text-accent [font-variant-numeric:tabular-nums]"
      >
        {n === 0 ? "GO" : n}
      </div>
    </div>
  );
}
