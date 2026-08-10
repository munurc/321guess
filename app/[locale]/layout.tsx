import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { PushRegistration } from "@/components/PushRegistration";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import { ThemeSync } from "@/components/ThemeSync";
import { locales, type Locale } from "@/i18n/request";
import "../globals.css";

const GA_MEASUREMENT_ID = "G-PW8MGE4D96";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const title = t("title");
  const description = t("description");
  const url = `https://www.321guess.com/${locale}`;
  return {
    metadataBase: new URL("https://www.321guess.com"),
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        tr: "https://www.321guess.com/tr",
        en: "https://www.321guess.com/en",
        "x-default": "https://www.321guess.com/tr",
      },
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "321guess",
      type: "website",
      locale: locale === "tr" ? "tr_TR" : "en_US",
      alternateLocale: locale === "tr" ? ["en_US"] : ["tr_TR"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    keywords:
      locale === "tr"
        ? [
            "futbolcu tahmin oyunu",
            "futbol tahmin oyunu",
            "futbol bilgi yarışması",
            "futbolcu bul",
            "iki takımda oynayan futbolcular",
            "günlük meydan okuma",
            "online futbol yarışması",
            "321guess",
          ]
        : [
            "football player guessing game",
            "soccer player quiz",
            "guess the footballer",
            "football trivia",
            "daily football challenge",
            "online football trivia game",
            "321guess",
          ],
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(locales as readonly string[]).includes(locale)) notFound();
  setRequestLocale(locale as Locale);

  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Sync theme before hydration so the palette matches localStorage */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeSync />
        <PushRegistration />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
            <footer className="mt-8 pb-6 text-center text-xs text-ink/50">
              vibe coded by{" "}
              <a
                href="https://instagram.com/munurcoskun"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ink/70 underline decoration-ink/20 underline-offset-4 hover:text-accent hover:decoration-accent"
              >
                munurcoskun
              </a>
            </footer>
          </div>
          <Analytics />
        </NextIntlClientProvider>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
