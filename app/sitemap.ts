import type { MetadataRoute } from "next";
import { locales } from "@/i18n/request";

const BASE_URL = "https://www.321guess.com";
const ROUTES = ["", "/play", "/manual"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.flatMap((route) =>
    locales.map((locale) => {
      const url = `${BASE_URL}/${locale}${route}`;
      const languages = Object.fromEntries(
        locales.map((l) => [l, `${BASE_URL}/${l}${route}`]),
      );
      return {
        url,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: route === "" ? 1.0 : 0.7,
        alternates: {
          languages: {
            ...languages,
            "x-default": `${BASE_URL}/tr${route}`,
          },
        },
      };
    }),
  );
}
