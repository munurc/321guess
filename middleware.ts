import createMiddleware from "next-intl/middleware";
import { defaultLocale, locales } from "./i18n/request";

export default createMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: "always",
});

export const config = {
  // Skip locale routing for API routes, Next internals, static assets, and
  // metadata files (favicon, opengraph-image, twitter-image, sitemap, robots).
  matcher: ["/((?!api|_next|opengraph-image|twitter-image|favicon|sitemap|robots|.*\\..*).*)"],
};
