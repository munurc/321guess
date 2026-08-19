import Head from "expo-router/head";

type PageMetaProps = {
  title: string;
  description: string;
  /** Path only, e.g. "/manual" — combined with the site origin for the
   * canonical URL and og:url. */
  path: string;
};

const SITE_URL = "https://www.321guess.com";
const OG_IMAGE = `${SITE_URL}/og-image.png`;

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
export function PageMeta({ title, description, path }: PageMetaProps) {
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
      <link rel="canonical" href={url} />
      <link rel="alternate" hrefLang="tr" href={trUrl} />
      <link rel="alternate" hrefLang="en" href={enUrl} />
      <link rel="alternate" hrefLang="x-default" href={trUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="321guess" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={OG_IMAGE} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={OG_IMAGE} />
    </Head>
  );
}
