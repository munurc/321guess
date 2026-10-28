import { Platform } from "react-native";
import Head from "expo-router/head";

type PageMetaProps = {
  title: string;
  description: string;
  /** Path only, e.g. "/manual" — combined with the site origin for the
   * canonical URL and og:url. */
  path: string;
  /** Personal pages (invite links) that shouldn't appear in search: emits
   * robots noindex and leaves out canonical/hreflang/og:url, so a shared
   * link previews with its own URL. */
  noindex?: boolean;
};

const SITE_URL = "https://www.321guess.com";
// Logo only, centered: survives both the wide card and WhatsApp's square crop.
const OG_IMAGE = `${SITE_URL}/og-logo.png`;

/** Given any route's path (e.g. "/manual" or "/en/manual"), returns the
 * unprefixed base path ("/manual") both locale variants share. */
function basePath(path: string): string {
  if (path === "/en") return "/";
  if (path.startsWith("/en/")) return path.slice(3);
  return path;
}

/** Per-route <head> tags for web (title, description, canonical, hreflang,
 * Open Graph, Twitter card). No-op on native — react-helmet-async only
 * manipulates a real DOM document, which native doesn't have.
 *
 * hreflang is derived automatically from `path`: every route exists at both
 * an unprefixed Turkish URL and an "/en"-prefixed English URL (see
 * src/app/en/), so any route's PageMeta can compute both alternates without
 * each call site repeating the pairing. */
export function PageMeta({ title, description, path, noindex }: PageMetaProps) {
  // expo-router/head's native (iOS) implementation isn't a no-op like its
  // web one — mounting it registers a Handoff/Spotlight activity via a
  // native module that alerts if the app isn't configured for it. This
  // component exists purely for web <head> tags, so skip it entirely on
  // native rather than configuring a feature this app doesn't use.
  if (Platform.OS !== "web") return null;

  const url = `${SITE_URL}${path}`;
  const base = basePath(path);
  const trUrl = `${SITE_URL}${base}`;
  const enUrl = `${SITE_URL}${base === "/" ? "/en" : `/en${base}`}`;
  const lang = path === "/en" || path.startsWith("/en/") ? "en" : "tr";
  return (
    <Head>
      {/* Overrides +html.tsx's bare <html> shell per-route (react-helmet's
       * htmlAttributes) so a crawler reading raw static HTML — no JS run —
       * sees the real page language, not a hardcoded default. */}
      <html lang={lang} />
      <title>{title}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex" />}
      {!noindex && <link rel="canonical" href={url} />}
      {!noindex && <link rel="alternate" hrefLang="tr" href={trUrl} />}
      {!noindex && <link rel="alternate" hrefLang="en" href={enUrl} />}
      {!noindex && <link rel="alternate" hrefLang="x-default" href={trUrl} />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="321guess" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {!noindex && <meta property="og:url" content={url} />}
      <meta property="og:image" content={OG_IMAGE} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="321guess" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={OG_IMAGE} />
    </Head>
  );
}
