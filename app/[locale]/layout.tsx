import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { locales, type Locale } from "@/i18n/request";
import "../globals.css";

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
  return {
    title: t("title"),
    description: t("description"),
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
    <html lang={locale}>
      <body>
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
