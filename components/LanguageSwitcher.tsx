"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { locales } from "@/i18n/request";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("language");

  function switchTo(next: string) {
    const segments = pathname.split("/");
    segments[1] = next;
    router.push(segments.join("/") || "/");
  }

  return (
    <div className="inline-flex gap-1 rounded-full border border-ink/10 bg-ink/5 p-1 text-xs">
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          className={`rounded-full px-3 py-1 transition ${
            locale === l ? "bg-accent text-paper font-semibold" : "text-ink/70 hover:text-ink"
          }`}
        >
          {t(l)}
        </button>
      ))}
    </div>
  );
}
