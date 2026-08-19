import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// Same GA4 property the retired Next.js site used (G-PW8MGE4D96) — reused
// rather than creating a new one, so historical data stays continuous.
// Only the gtag() function itself is defined here — no `config` call, and
// therefore no analytics cookie, until the user grants consent (see
// analytics-consent.tsx / CookieConsent).
const GA_MEASUREMENT_ID = "G-PW8MGE4D96";

/** Web-only document shell (never touched by native builds). Mirrors
 * expo-router's own default (node_modules/expo-router/build/static/html.js)
 * exactly, plus the GA4 script tags. */
export default function Root({ children }: PropsWithChildren) {
  return (
    // "tr" is a fallback only — PageMeta's per-route <html lang> (react-helmet
    // htmlAttributes) is injected before this static one during export, and
    // per the HTML spec the first of two duplicate attributes wins, so any
    // route with PageMeta gets its real language. The (rare) route without
    // PageMeta — +not-found, the auto-generated _sitemap — falls back to
    // this default. Needs to stay an actual attribute, not just an empty
    // tag: Expo's static-export code injects htmlAttributes by string-
    // replacing the literal "<html " (trailing space from having at least
    // one attribute) — an attribute-less "<html>" has no such anchor, and
    // the injection silently no-ops.
    <html lang="tr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
