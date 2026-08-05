"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Re-applies the stored theme to <html data-theme> on every navigation.
 *
 * <html> lives inside app/[locale]/layout.tsx (there's no separate root
 * layout), so switching locale re-renders it. That wipes the data-theme
 * attribute — it was only ever set imperatively via
 * document.documentElement.setAttribute, which React's reconciliation
 * doesn't preserve, and the inline THEME_INIT_SCRIPT in <head> only runs on
 * a real full page load, not this kind of client-side transition. Depending
 * on pathname guarantees this effect re-fires on every route change,
 * including a locale switch, regardless of Next's remount behavior.
 */
export function ThemeSync() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      const stored = localStorage.getItem("321guess.theme");
      if (stored === "light" || stored === "dark") {
        document.documentElement.setAttribute("data-theme", stored);
      }
    } catch {}
  }, [pathname]);

  return null;
}
